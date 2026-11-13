import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'preact/hooks'

import { Celebration } from '../../components/Celebration'
import { nextCelebration, type CelebrationEvent } from '../../components/celebration-catalog'
import {
  addCustomMetric,
  bulkAddMetrics,
  fetchCustomMetrics,
  fetchMetricTimeSeriesWithSource,
} from '../../state/api'
import { auth } from '../../state/auth'
import {
  CPAP_SOURCE,
  cpapFields,
  cpapHistory,
  cpapMetricDefinitions,
  parseCPAPCsv,
  type CPAPPreview,
  type CPAPDay,
} from './model'
import './style.css'

export function CPAP() {
  const [historyLimit, setHistoryLimit] = useState(60)
  const loggedIn = Boolean(auth.value.token)
  const definitions = useQuery({
    queryKey: ['cpap-definitions'],
    queryFn: fetchCustomMetrics,
    enabled: loggedIn,
  })
  const history = useQuery({
    queryKey: ['cpap-history'],
    enabled: loggedIn && definitions.isSuccess,
    queryFn: async () => {
      const existing = new Set(definitions.data?.map((d) => d.name))
      const points = await Promise.all(
        cpapFields
          .filter(([, metric]) => existing.has(metric))
          .map(([, metric]) =>
            fetchMetricTimeSeriesWithSource(
              metric,
              new Date('2000-01-01T00:00:00Z'),
              new Date(Date.now() + 86_400_000),
            ),
          ),
      )
      return cpapHistory(points.flat())
    },
  })
  const days = history.data ?? []

  if (!loggedIn) {
    return (
      <div class="cpap-page">
        <h1>CPAP</h1>
        <p>Please log in to view and import CPAP records.</p>
      </div>
    )
  }
  return (
    <div class="cpap-page">
      <header>
        <p class="cpap-eyebrow">ResMed myAir</p>
        <h1>CPAP therapy</h1>
        <p>Review nightly usage, AHI, mask leak, and myAir scores.</p>
      </header>
      <CPAPImport />
      {(definitions.isLoading || history.isLoading) && <p role="status">Loading CPAP history…</p>}
      {(definitions.isError || history.isError) && (
        <p role="alert" class="cpap-error">
          Could not load CPAP history. {String(definitions.error?.message ?? history.error?.message ?? '')}
        </p>
      )}
      {days.length > 0 && (
        <>
          <CPAPReport
            days={days}
            historyLimit={historyLimit}
            onMore={() => setHistoryLimit((limit) => limit + 60)}
          />
        </>
      )}
      {history.isSuccess && !days.length && <p>No CPAP records yet. Import SLEEP_RECORD.csv to begin.</p>}
    </div>
  )
}

function CPAPReport({
  days,
  historyLimit,
  onMore,
}: {
  days: CPAPDay[]
  historyLimit: number
  onMore: () => void
}) {
  const recent = days.slice(0, 30)
  const average = (metric: string) => {
    const values = recent.flatMap((day) => (day.values[metric] === undefined ? [] : [day.values[metric]]))
    return values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2) : '—'
  }

  return (
    <>
      {' '}
      <section class="cpap-card">
        <h2>Recent averages</h2>
        <p>
          Latest {recent.length} recorded session dates, {recent.at(-1)?.date} through {recent[0].date}.
          Missing values are excluded; zero usage is included.
        </p>
        <div class="cpap-stats">
          {[cpapFields[0], cpapFields[1], cpapFields[4], cpapFields[6]].map(([, metric, label, unit]) => (
            <a
              key={metric}
              href={`/chart?source_type=metric&pattern=${metric}&chart_type=bar&aggregation=mean&lookback_days=90`}
            >
              <span>{label}</span>
              <strong>{average(metric)}</strong>
              <small>{unit} · View chart</small>
            </a>
          ))}
        </div>
      </section>
      <section class="cpap-card">
        <h2>Session history</h2>
        <p>
          {days.length} recorded dates. Noon timestamps identify the session date; they do not describe when
          sleep started or ended.
        </p>
        <div class="cpap-table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Session date</th>
                {cpapFields.map(([, metric, label, unit]) => (
                  <th scope="col" key={metric}>
                    {label}
                    <small>{unit}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.slice(0, historyLimit).map((day) => (
                <tr key={day.date}>
                  <th scope="row">{day.date}</th>
                  {cpapFields.map(([, metric]) => (
                    <td key={metric}>
                      {day.values[metric] === undefined ? '—' : Number(day.values[metric].toFixed(2))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {days.length > historyLimit && (
          <button type="button" onClick={onMore}>
            Show more dates
          </button>
        )}
      </section>
    </>
  )
}

export function CPAPImport() {
  const queryClient = useQueryClient()
  const [preview, setPreview] = useState<CPAPPreview | null>(null)
  const [status, setStatus] = useState('')
  const [reading, setReading] = useState(false)
  const [celebration, setCelebration] = useState<CelebrationEvent | null>(null)
  const upload = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error('Select a CSV first.')
      let saved = 0
      try {
        const existing = new Set((await fetchCustomMetrics()).map((d) => d.name))
        for (const definition of cpapMetricDefinitions) {
          if (!existing.has(definition.name)) await addCustomMetric(definition)
        }
        for (let offset = 0; offset < preview.data.length; offset += 10_000) {
          const batch = preview.data.slice(offset, offset + 10_000)
          const result = await bulkAddMetrics({ data: batch, source: CPAP_SOURCE })
          saved += result.inserted ?? 0
          if (!result.success || result.errors?.length || result.inserted !== batch.length) {
            throw new Error(
              `The server did not confirm the full batch. ${result.errors?.length ?? 0} reported errors.`,
            )
          }
        }
      } catch (error) {
        throw new Error(
          `${saved} of ${preview.data.length} metric values confirmed saved. ${error instanceof Error ? error.message : 'Import failed.'} You can retry this file safely; existing values are updated.`,
        )
      }
      return { dates: preview.days.length, values: saved }
    },
    onSuccess: ({ dates, values }) => {
      if (values > 0) setCelebration(nextCelebration('cpap'))
      setStatus(`Imported ${dates} session dates (${values} metric values).`)
      setPreview(null)
    },
    onError: (error: Error) => setStatus(error.message),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cpap-definitions'] })
      await queryClient.invalidateQueries({ queryKey: ['cpap-history'] })
      await queryClient.invalidateQueries({ queryKey: ['custom-metrics'] })
    },
  })

  return (
    <section class="cpap-card">
      {celebration && (
        <Celebration key={celebration.id} {...celebration} onDone={() => setCelebration(null)} />
      )}
      <h2>Import myAir records</h2>
      <p>
        Unzip your myAir data export, then select <strong>SLEEP_RECORD.csv</strong>. Preview it here before
        importing. Upload a new export whenever you want to update your history; there is no automatic sync.
      </p>
      <p>
        Only session dates and metric values are saved. Personal and device identifiers are discarded. Dates
        always use America/Denver, including daylight saving time.
      </p>
      <label class="cpap-file-label">
        SLEEP_RECORD.csv
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={upload.isPending || reading}
          onChange={async (event) => {
            const input = event.currentTarget as HTMLInputElement
            const file = input.files?.[0]
            setPreview(null)
            setStatus('')
            if (!file) return
            setReading(true)
            try {
              if (file.name.toUpperCase() !== 'SLEEP_RECORD.CSV') {
                throw new Error('Select SLEEP_RECORD.csv from the unzipped export.')
              }
              setPreview(parseCPAPCsv(await file.text()))
            } catch (error) {
              setStatus(error instanceof Error ? error.message : 'Could not read the file.')
            } finally {
              setReading(false)
              input.value = ''
            }
          }}
        />
      </label>
      {reading && <p role="status">Reading CSV…</p>}
      {preview && (
        <div class="cpap-preview">
          <strong>
            {preview.days.length} session dates · {preview.days[0].date} through {preview.days.at(-1)?.date}
          </strong>
          <p>
            {preview.data.length} metric values ready. {preview.duplicate_count} duplicate rows resolved;{' '}
            {preview.deleted_count} deleted rows ignored. Reimporting updates existing dates.
          </p>
          <button type="button" disabled={upload.isPending} onClick={() => upload.mutate()}>
            {upload.isPending ? 'Importing…' : 'Import records'}
          </button>
        </div>
      )}
      {status && (
        <p class={upload.isError ? 'cpap-error' : ''} role={celebration ? undefined : 'status'}>
          {status}
        </p>
      )}
    </section>
  )
}

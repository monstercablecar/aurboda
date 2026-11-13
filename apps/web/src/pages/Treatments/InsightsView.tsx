import { useQuery } from '@tanstack/react-query'
import { subDays } from 'date-fns'
import { useState } from 'preact/hooks'

import {
  downloadPharmacologyCsv,
  downloadPharmacologyJson,
  fetchPharmacologyInsights,
  pharmacologyErrorMessage,
  type PharmacologyDownload,
} from '../../state/api'
import { buildChartUrl } from '../../utils/chart-url'
import { localDateKey } from './model'

const saveDownload = ({ blob, filename }: PharmacologyDownload) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function InsightsView({
  notify,
  timezone,
}: {
  notify: (message: string, tone?: 'success' | 'error') => void
  timezone: string
}) {
  const [start, setStart] = useState(() => localDateKey(subDays(new Date(), 89)))
  const [end, setEnd] = useState(localDateKey)
  const [downloading, setDownloading] = useState<'json' | 'csv' | null>(null)
  const validRange = Boolean(start && end && start <= end)
  const query = useQuery({
    enabled: validRange,
    queryFn: () => fetchPharmacologyInsights({ end, start, timezone }),
    queryKey: ['pharmacology', 'insights', start, end, timezone],
  })
  const download = async (format: 'json' | 'csv') => {
    setDownloading(format)
    try {
      saveDownload(await (format === 'json' ? downloadPharmacologyJson() : downloadPharmacologyCsv()))
      notify(`${format.toUpperCase()} export downloaded.`)
    } catch (error) {
      notify(pharmacologyErrorMessage(error, 'Export failed.'), 'error')
    } finally {
      setDownloading(null)
    }
  }
  const insights = query.data
  return (
    <div class="insights-view">
      <section class="insights-toolbar">
        <div class="form-grid date-range-fields">
          <label class="field">
            <span>From</span>
            <input
              type="date"
              value={start}
              onInput={(event) => setStart((event.target as HTMLInputElement).value)}
            />
          </label>
          <label class="field">
            <span>To</span>
            <input
              type="date"
              value={end}
              onInput={(event) => setEnd((event.target as HTMLInputElement).value)}
            />
          </label>
        </div>
        <div class="export-actions">
          <button
            class="btn-secondary"
            type="button"
            disabled={!!downloading}
            onClick={() => void download('json')}
          >
            {downloading === 'json' ? 'Preparing…' : 'Export JSON'}
          </button>
          <button
            class="btn-secondary"
            type="button"
            disabled={!!downloading}
            onClick={() => void download('csv')}
          >
            {downloading === 'csv' ? 'Preparing…' : 'Export CSV'}
          </button>
        </div>
      </section>
      {!validRange ? (
        <p class="form-error" role="alert">
          Choose both dates, with From on or before To.
        </p>
      ) : query.isLoading ? (
        <p class="loading-state">Calculating coverage…</p>
      ) : query.error || !insights ? (
        <div class="empty-state error-state" role="alert">
          <h2>Insights could not load</h2>
          <p>{pharmacologyErrorMessage(query.error)}</p>
          <button class="btn-secondary" type="button" onClick={() => void query.refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <section class="stat-grid" aria-label="Data coverage">
            <article class="stat-card">
              <span>Coverage</span>
              <strong>{insights.coverage_days}</strong>
              <small>days with data</small>
            </article>
            <article class="stat-card">
              <span>Administrations</span>
              <strong>{insights.administration_events}</strong>
              <small>{insights.exposure_events} exposure events</small>
            </article>
            <article class="stat-card">
              <span>Concurrent exposures</span>
              <strong>{insights.concurrent_exposure_days}</strong>
              <small>days</small>
            </article>
            <article class="stat-card">
              <span>Missing check-ins</span>
              <strong>{insights.missing_assessment_days}</strong>
              <small>days</small>
            </article>
            <article class="stat-card">
              <span>Duplicate suspects</span>
              <strong>{insights.duplicate_suspicions}</strong>
              <small>review in journal</small>
            </article>
          </section>
          {insights.warnings.length > 0 && (
            <section class="warning-panel">
              <h2>Data quality</h2>
              <ul>
                {insights.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </section>
          )}
          <section class="view-section">
            <div class="section-heading">
              <div>
                <h2>Projected metrics</h2>
                <p>These are the values actually available to Aurboda’s existing Chart and Analyze tools.</p>
              </div>
              <a class="btn-secondary link-button" href="/correlations">
                Open Analyze
              </a>
            </div>
            {insights.projected_metrics.length === 0 ? (
              <div class="empty-state compact-empty">
                No pharmacology metrics have been projected in this range.
              </div>
            ) : (
              <div class="metrics-table" role="table">
                <div class="metrics-row metrics-header" role="row">
                  <span role="columnheader">Metric</span>
                  <span role="columnheader">Unit</span>
                  <span role="columnheader">Points</span>
                  <span />
                </div>
                {insights.projected_metrics.map((metric) => (
                  <div class="metrics-row" role="row" key={`${metric.metric}:${metric.unit}`}>
                    <strong role="cell">{metric.metric}</strong>
                    <span role="cell">{metric.unit}</span>
                    <span role="cell">{metric.points}</span>
                    <a
                      role="cell"
                      href={buildChartUrl({
                        chart_type: 'trend',
                        pattern: metric.metric,
                        source_type: 'metric',
                      })}
                    >
                      Chart
                    </a>
                  </div>
                ))}
              </div>
            )}
          </section>
          <aside class="safety-callout insights-disclaimer">
            <strong>Observational only</strong>
            <span>{insights.disclaimer}</span>
          </aside>
        </>
      )}
    </div>
  )
}

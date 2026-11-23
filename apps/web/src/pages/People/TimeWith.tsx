import { useQuery } from '@tanstack/react-query'
import { useState } from 'preact/hooks'

import { privateLinks } from '../../state/api/private-links'
export function TimeWith({ personId }: { personId: string }) {
  const today = new Date().toISOString().slice(0, 10),
    [from, setFrom] = useState(new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)),
    [to, setTo] = useState(today),
    [metric, setMetric] = useState('')
  const result = useQuery({
    queryKey: ['private-time-with', personId, from, to, metric],
    queryFn: () =>
      privateLinks.timeWith(personId, {
        from,
        to,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...(metric ? { metric } : {}),
      }),
  })
  const max = Math.max(1, ...(result.data?.days.map((d) => d.minutes) ?? []))
  return (
    <section class="people-panel">
      <h2>Time together</h2>
      <p>
        Linked activities and your existing shared-activity and care records. Overlapping time counts once;
        activities without an end contribute no duration.
      </p>
      <label>
        From <input type="date" value={from} onChange={(e) => setFrom(e.currentTarget.value)} />
      </label>{' '}
      <label>
        To <input type="date" value={to} onChange={(e) => setTo(e.currentTarget.value)} />
      </label>
      <label>
        Compare a metric{' '}
        <input
          placeholder="Metric name, optional"
          value={metric}
          onChange={(e) => setMetric(e.currentTarget.value.trim())}
        />
      </label>
      {result.isError && <p role="alert">Could not load this range. Choose up to 366 days and try again.</p>}
      {result.data && (
        <>
          <p>{Math.round(result.data.total_minutes)} recorded minutes together</p>
          <div
            style={{ display: 'flex', alignItems: 'end', gap: '2px', height: '140px' }}
            role="img"
            aria-label="Daily minutes in linked activities"
          >
            {result.data.days.map((d) => (
              <div
                key={d.date}
                title={`${d.date}: ${Math.round(d.minutes)} minutes`}
                style={{
                  flex: 1,
                  height: `${Math.max(1, (d.minutes / max) * 100)}%`,
                  background: 'var(--color-primary)',
                }}
              />
            ))}
          </div>
          <details>
            <summary>Daily values</summary>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Minutes</th>
                  <th>Metric daily value</th>
                </tr>
              </thead>
              <tbody>
                {result.data.days.map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td>{Math.round(d.minutes)}</td>
                    <td>{d.metric_value ?? 'No observation'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          {metric && (
            <p>
              {result.data.correlation === null
                ? 'Not enough varying observations for a correlation.'
                : `Daily correlation: ${result.data.correlation.toFixed(2)} across ${result.data.paired_days} observed days.`}{' '}
              Missing metric days are excluded. Daily metrics use their existing average or sum rules. Days
              without shared-duration records mean zero recorded minutes, not proof of no contact. This
              association does not show cause.
            </p>
          )}
          <ul>
            {result.data.activities.map((a) => (
              <li key={a.id}>
                <a href={`/detail/activity/${a.id}`}>{a.title}</a> · {new Date(a.start_time).toLocaleString()}
              </li>
            ))}
          </ul>
        </>
      )}
      <a href={`/journal?related_kind=person&related_id=${personId}`}>Related Journal entries</a>
    </section>
  )
}

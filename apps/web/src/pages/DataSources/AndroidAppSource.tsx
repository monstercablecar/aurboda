import { useQuery } from '@tanstack/react-query'

import { fetchRawRecordCount } from '../../state/api'
import { auth } from '../../state/auth'
import './style.css'

const DATA_TYPES = [
  'Heart rate',
  'HRV',
  'Weight',
  'Body composition',
  'Steps',
  'Sleep',
  'Exercise',
  'Blood pressure',
  'Blood glucose',
  'Body temperature',
  'Oxygen saturation',
  'Respiratory rate',
  '40+ Health Connect record types',
]

export function AndroidAppSource() {
  const isLoggedIn = auth.value.token

  const recordsQuery = useQuery({
    enabled: !!isLoggedIn,
    queryFn: () => fetchRawRecordCount({ source: 'health_connect' }),
    queryKey: ['androidApp', 'healthConnectRecords'],
    staleTime: 5 * 60 * 1000,
  })
  const hasData = (recordsQuery.data ?? 0) > 0

  if (!isLoggedIn) {
    return (
      <div class="data-sources-page">
        <p>Please log in to view data source settings.</p>
      </div>
    )
  }

  return (
    <div class="data-sources-page">
      <div class="page-header">
        <h1>Aurboda Android</h1>
      </div>

      <div class="data-source-detail">
        <p class="source-description">
          The Aurboda Android app syncs health data from your phone using{' '}
          <a
            href="https://developer.android.com/health-and-fitness/guides/health-connect"
            target="_blank"
            rel="noopener noreferrer"
          >
            Health Connect
          </a>
          . Any app that writes to Health Connect (Strava, Garmin, Samsung Health, etc.) will have its data
          forwarded to Aurboda. The Android app also supports real-time Bluetooth heart rate monitoring and
          can sync ActivityWatch mobile data.
        </p>

        <p>
          Android is your companion for device integrations, background syncing and quick checks. Use{' '}
          <a href="https://stats.foghouse.org">stats.foghouse.org</a> in your browser for full dashboards,
          detailed history, longer questionnaires, Work, People and bigger forms. These features also remain
          available embedded in Android where supported.
        </p>

        <div class="data-types-section">
          <h2>Data provided</h2>
          <div class="data-types-list">
            {DATA_TYPES.map((dt) => (
              <span key={dt} class="data-type-badge">
                {dt}
              </span>
            ))}
          </div>
        </div>

        <div class={`status-banner ${hasData ? 'connected' : 'not-connected'}`}>
          <span class={`status-dot ${hasData ? 'connected' : 'not-connected'}`} />
          {recordsQuery.isError
            ? 'Health Connect status unavailable'
            : recordsQuery.isPending
              ? 'Checking Health Connect records…'
              : hasData
                ? 'Health Connect records received (including historical data)'
                : 'Waiting for first Health Connect data'}
          {recordsQuery.isError && (
            <button type="button" onClick={() => void recordsQuery.refetch()}>
              Retry
            </button>
          )}
        </div>

        <div class="links-row">
          <a
            href="https://github.com/fiddur/aurboda/releases/latest/download/aurboda.apk"
            class="external-link"
          >
            Download Android APK
          </a>
          <a
            href="https://github.com/fiddur/aurboda/blob/develop/docs/health-connect.md"
            target="_blank"
            rel="noopener noreferrer"
            class="doc-link"
          >
            Health Connect documentation
          </a>
        </div>

        {
          <div class="setup-instructions">
            <h3>Setup</h3>
            <ol>
              <li>Download and install the Aurboda APK on your Android phone.</li>
              <li>
                Set Server URL to <strong>https://stats.foghouse.org</strong>, then sign in with your existing
                Foghouse account. The public APK may default to the upstream server, so enter this address
                yourself.
              </li>
              <li>
                Open Sync and grant Health Connect read permissions. Allow background access and battery
                exemption, then tap Sync Now to verify your first data.
              </li>
              <li>
                For real-time heart rate monitoring, connect a Bluetooth heart rate monitor (e.g. Polar H10)
                from the app&apos;s Live screen.
              </li>
              <li>
                In your other health apps, enable sharing to Health Connect where supported. Aurboda can only
                sync the records those apps share and you allow it to read.
              </li>
            </ol>
          </div>
        }
      </div>
    </div>
  )
}

import type { ActivityWatchSyncStatusResponse } from '@aurboda/api-spec'

import { useQuery } from '@tanstack/react-query'
import axios from 'axios'

import { API_URL } from '../config'
import { auth } from '../state/auth'

export function ActivityWatchStatus({ mobile }: { mobile: boolean }) {
  const token = auth.value.token
  const query = useQuery({
    queryKey: ['activitywatch-status'],
    enabled: !!token,
    queryFn: async ({ signal }) =>
      (
        await axios.get<ActivityWatchSyncStatusResponse>(`${API_URL}/sync/activitywatch/status`, {
          signal,
          headers: { Authorization: `Bearer ${token}` },
        })
      ).data,
    refetchInterval: 30000,
  })
  if (query.isPending) return <p>Checking imported ActivityWatch data…</p>
  if (query.isError) return <p role="alert">Could not check ActivityWatch status. Refresh to retry.</p>
  const devices = (query.data?.devices ?? []).filter((d) => d.is_mobile === mobile)
  return (
    <section aria-label="ActivityWatch import status">
      <p>
        {devices.length
          ? 'Activity events received and stored in Aurboda.'
          : 'No activity events received yet. Use Sync Now in the companion or desktop agent to diagnose the connection.'}
      </p>
      {devices.map((device) => (
        <div key={device.device_name}>
          <strong>{device.device_name || 'Unnamed device'}</strong>
          <p>
            {device.events_total.toLocaleString()} stored events · Earliest: {device.earliest_event} · Latest:{' '}
            {device.latest_event}
          </p>
          <p>Last received: {device.last_received ?? 'Not recorded by the older importer'}</p>
        </div>
      ))}
      <p>
        Stored history confirms an import, not continuous connectivity. Device-side errors and backfill
        progress appear in the companion app or agent log.
      </p>
      <a href="/timeline">View activity timeline</a>
    </section>
  )
}

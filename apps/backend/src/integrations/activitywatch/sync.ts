/**
 * ActivityWatch is a local desktop daemon — it cannot be pulled from a remote server.
 * Instead, a push agent on each device periodically sends batches of events to this endpoint.
 *
 * See docs/activitywatch.md for setup instructions.
 */
import type { ActivityWatchEvent, ActivityWatchSyncResult } from '@aurboda/api-spec'

import type { ProductivityRecord } from '../../db/types.ts'

import { storeActivityWatch } from '../../db/activitywatch.ts'
import { getScreentimeCategories, upsertSyncState } from '../../db/index.ts'
import { rebuildScreentimeSpans } from '../../services/rebuild-screentime-spans.ts'
import { categorizeRecords, compileRules } from '../../services/screentime-categories.ts'

/**
 * @param events - ActivityWatch events from aw-watcher-window or aw-watcher-android
 * @param deviceName - Hostname or user-configured device name (empty string for single-device setup)
 */
export const processActivityWatchEvents = async (
  user: string,
  events: ActivityWatchEvent[],
  deviceName: string,
  isMobile = false,
): Promise<ActivityWatchSyncResult> => {
  try {
    const records: ProductivityRecord[] = events.map((event) => {
      const startTime = new Date(event.timestamp)
      const durationSec = Math.round(event.duration)
      const endTime = new Date(startTime.getTime() + event.duration * 1000)

      return {
        activity: event.app,
        category: event.category,
        device_name: deviceName,
        duration_sec: durationSec,
        end_time: endTime,
        is_mobile: isMobile,
        productivity: undefined,
        source: 'activitywatch',
        start_time: startTime,
        title: event.title || undefined,
      }
    })

    const categories = await getScreentimeCategories(user)
    if (categories.length > 0) {
      const compiledRules = compileRules(categories)
      categorizeRecords(records, compiledRules)
    }

    const coverage = await storeActivityWatch(user, events, records, deviceName, isMobile)

    // Rebuild from persisted records so pagination/replays cannot leave extra spans.
    await rebuildScreentimeSpans(user)

    const dataType = deviceName ? `productivity:${deviceName}` : 'productivity'
    await upsertSyncState(user, {
      data_type: dataType,
      last_sync_time: new Date(),
      provider: 'activitywatch',
      status: 'idle',
    })

    return {
      device_name: deviceName,
      records_stored: records.length,
      status: 'success',
      ...coverage,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      device_name: deviceName,
      error: message,
      records_stored: 0,
      status: 'error',
    }
  }
}

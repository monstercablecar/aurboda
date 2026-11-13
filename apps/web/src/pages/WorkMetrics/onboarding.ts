import type { WorkMetricRow, WorkProfile, WorkSettings } from '@aurboda/api-spec'

import { format } from 'date-fns'

import { resolveActiveWorkProfile, WORK_METRIC_SOURCE } from './settings'

export const createWorkTemplate = (template: 'recruiting' | 'productivity' | 'blank'): WorkSettings => {
  if (template === 'recruiting') {
    const profile = resolveActiveWorkProfile(undefined)
    return { active_profile_id: profile.id, profiles: [profile], version: 1 }
  }

  const identity = crypto.randomUUID().replaceAll('-', '')
  const prefix = `work_${identity}`
  const metricRows: WorkMetricRow[] =
    template === 'productivity'
      ? [
          { key: 'tasks', label: 'Tasks completed' },
          { key: 'focus', label: 'Focus sessions' },
        ].map(({ key, label }) => ({
          hidden: false,
          id: `${prefix}_${key}`,
          kind: 'input',
          label,
          label_history: [],
          meaning_id: `${prefix}_${key}`,
          storage_metric: `${prefix}_${key}`,
        }))
      : []
  const profile: WorkProfile = {
    category_columns: [{ hidden: false, id: `${prefix}_total`, label: 'Total', label_history: [] }],
    goals:
      template === 'productivity'
        ? [
            {
              id: `${prefix}_weekly_tasks`,
              label: 'Weekly tasks',
              metric_id: metricRows[0].id,
              revisions: [
                {
                  effective_from: format(new Date(), 'yyyy-MM-dd'),
                  id: `${prefix}_goal_initial`,
                  target: 20,
                },
              ],
            },
          ]
        : [],
    id: prefix,
    metric_rows: metricRows,
    name: template === 'productivity' ? 'Productivity' : 'My work',
    name_history: [],
    sections: [
      {
        hidden: false,
        id: `${prefix}_activities`,
        label: 'Activities',
        label_history: [],
        metric_ids: metricRows.map((metric) => metric.id),
      },
    ],
    status: 'active',
    storage_contract: { daily_metric_source: WORK_METRIC_SOURCE, day_marker_metric: `${prefix}_day` },
  }
  return { active_profile_id: profile.id, profiles: [profile], version: 1 }
}

const hasConfiguration = (value: unknown): boolean => {
  if (value === null || value === undefined || value === '') return false
  if (typeof value === 'object') return Object.values(value).some(hasConfiguration)
  return true
}

export const needsWorkOnboarding = (work: WorkSettings | null | undefined, hasHistory: boolean): boolean =>
  !hasHistory && !hasConfiguration(work)

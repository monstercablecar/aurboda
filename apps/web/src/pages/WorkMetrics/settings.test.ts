import type { WorkMetricRow, WorkProfile, WorkSettings } from '@aurboda/api-spec'

import { describe, expect, test } from 'vitest'

import {
  addWorkCategoryColumn,
  addWorkMetricRow,
  addWorkProfile,
  addWorkSection,
  archiveWorkCategoryColumn,
  archiveWorkMetricRow,
  archiveWorkProfile,
  archiveWorkSection,
  builtInRecruitingProfile,
  dayMarkerMetric,
  defaultWorkSettings,
  goalTargetForDate,
  hiresMetricId,
  inputMetricNames,
  reorderWorkCategoryColumns,
  reorderWorkProfiles,
  reorderWorkSectionMetrics,
  reorderWorkSections,
  renameWorkCategoryColumn,
  renameWorkMetricRow,
  renameWorkProfile,
  renameWorkSection,
  replaceWorkMetricSemantics,
  resolveActiveWorkProfile,
  resolveWorkSettings,
  setWorkCategoryColumnHidden,
  setWorkMetricRowHidden,
  setWorkSectionHidden,
  weeklyHiresGoalId,
  WORK_METRIC_SOURCE,
  appendWorkGoalRevision,
} from './settings'

const timestamp = '2026-02-01T00:00:00.000Z'

const recruitingProfile = (): WorkProfile => resolveActiveWorkProfile(undefined)

const newMetric = (overrides: Partial<WorkMetricRow> = {}): WorkMetricRow => ({
  hidden: false,
  id: 'phone_screens',
  kind: 'input',
  label: 'Phone screens',
  label_history: [],
  meaning_id: 'phone_screens',
  storage_metric: 'work_phone_screens',
  ...overrides,
})

describe('Work profile settings', () => {
  test('materializes the Recruiting fallback without mutating the template', () => {
    const template = JSON.stringify(builtInRecruitingProfile)

    const profile = resolveActiveWorkProfile(undefined)
    profile.category_columns[0].label = 'Changed elsewhere'

    expect(JSON.stringify(builtInRecruitingProfile)).toBe(template)
    expect(resolveWorkSettings(undefined)).toEqual(defaultWorkSettings)
    expect(profile.storage_contract).toEqual({
      daily_metric_source: WORK_METRIC_SOURCE,
      day_marker_metric: dayMarkerMetric,
    })
    expect(inputMetricNames.invited_to_interview).toBe('work_invited_to_interview')
    expect(goalTargetForDate(resolveActiveWorkProfile(undefined), weeklyHiresGoalId, '2026-11-02')).toBe(10)
  })

  test('applies legacy Recruiting overrides to the fallback', () => {
    const settings: WorkSettings = {
      position_labels: {
        deckhand: 'Deckhand',
        dishwasher: 'Galley',
        housekeeper: 'Rooms',
        server: 'Floor',
      },
      weekly_hire_goal: 12,
    }

    expect(resolveWorkSettings(settings, '2026-11-02')).toEqual({
      position_labels: {
        deckhand: 'Deckhand',
        dishwasher: 'Galley',
        housekeeper: 'Rooms',
        server: 'Floor',
      },
      weekly_hire_goal: 12,
    })
  })

  test('returns generic active profiles for configuration while guarding the Recruiting page view', () => {
    const genericProfile: WorkProfile = {
      ...recruitingProfile(),
      category_columns: recruitingProfile().category_columns.map((column) =>
        column.id === 'server' ? { ...column, label: 'Generic server' } : column,
      ),
      goals: [
        {
          id: weeklyHiresGoalId,
          label: 'Generic weekly target',
          metric_id: 'generic_hires',
          revisions: [{ effective_from: '2026-01-01', id: 'generic_target', target: 99 }],
        },
      ],
      id: 'generic_profile',
      metric_rows: [
        ...recruitingProfile().metric_rows,
        newMetric({ id: 'generic_hires', meaning_id: 'generic_hires' }),
      ],
      name: 'Generic profile',
      storage_contract: { daily_metric_source: 'generic_work', day_marker_metric: 'generic_day_logged' },
    }
    const settings: WorkSettings = {
      active_profile_id: 'generic_profile',
      profiles: [genericProfile],
      version: 1,
    }

    expect(resolveActiveWorkProfile(settings).id).toBe('generic_profile')
    expect(resolveWorkSettings(settings, '2026-11-02')).toEqual(defaultWorkSettings)
  })

  test('adds, renames, reorders, hides, and archives without changing stable identities', () => {
    const base = recruitingProfile()
    const profileSettings = addWorkProfile({}, base)
    expect(profileSettings.active_profile_id).toBe(base.id)
    expect(() => addWorkProfile(profileSettings, base)).toThrow(/Duplicate/)
    expect(() => reorderWorkProfiles(profileSettings, [])).toThrow(/exactly match/)

    const withSection = addWorkSection(base, {
      hidden: false,
      id: 'custom_section',
      label: 'Custom section',
      label_history: [],
      metric_ids: [hiresMetricId],
    })
    expect(() => addWorkSection(withSection, withSection.sections[0])).toThrow(/Duplicate/)

    const withMetric = addWorkMetricRow(withSection, newMetric())
    const withColumn = addWorkCategoryColumn(withMetric, {
      hidden: false,
      id: 'seasonal',
      label: 'Seasonal',
      label_history: [],
    })
    const renamed = renameWorkCategoryColumn(
      renameWorkMetricRow(
        renameWorkSection(
          renameWorkProfile(withColumn, 'Recruiting ops', timestamp),
          'custom_section',
          'Custom ops',
          timestamp,
        ),
        'phone_screens',
        'Phone screens completed',
        timestamp,
      ),
      'seasonal',
      'Seasonal roles',
      timestamp,
    )
    const reordered = reorderWorkCategoryColumns(
      reorderWorkSections(renamed, ['custom_section', ...base.sections.map((section) => section.id)]),
      ['seasonal', ...base.category_columns.map((column) => column.id)],
    )
    const applications = base.sections.find((section) => section.id === 'applications')
    expect(applications).toBeDefined()
    const metricReordered = reorderWorkSectionMetrics(
      reordered,
      'applications',
      [...(applications?.metric_ids ?? [])].reverse(),
    )
    const hidden = setWorkCategoryColumnHidden(
      setWorkMetricRowHidden(
        setWorkSectionHidden(metricReordered, 'custom_section', true),
        'phone_screens',
        true,
      ),
      'seasonal',
      true,
    )
    const archived = archiveWorkCategoryColumn(
      archiveWorkMetricRow(
        archiveWorkSection(archiveWorkProfile(hidden, timestamp), 'custom_section', timestamp),
        'phone_screens',
        timestamp,
      ),
      'seasonal',
      timestamp,
    )

    expect(archived.id).toBe(base.id)
    expect(archived.name_history).toEqual([{ changed_at: timestamp, name: 'Recruiting' }])
    expect(archived.sections[0]).toMatchObject({ archived_at: timestamp, hidden: true, id: 'custom_section' })
    expect(archived.metric_rows.find((metric) => metric.id === 'phone_screens')).toMatchObject({
      archived_at: timestamp,
      hidden: true,
      label_history: [{ changed_at: timestamp, label: 'Phone screens' }],
    })
    expect(archived.category_columns[0]).toMatchObject({
      archived_at: timestamp,
      hidden: true,
      id: 'seasonal',
    })
    expect(base.sections.some((section) => section.id === 'custom_section')).toBe(false)
  })

  test('semantic metric replacement archives the old identity and requires new identities', () => {
    const base = recruitingProfile()
    const replaced = replaceWorkMetricSemantics(base, 'invited_to_interview', newMetric(), timestamp)

    expect(replaced.metric_rows.find((metric) => metric.id === 'invited_to_interview')).toMatchObject({
      archived_at: timestamp,
      meaning_id: 'invited_to_interview',
      storage_metric: 'work_invited_to_interview',
    })
    expect(replaced.metric_rows.find((metric) => metric.id === 'phone_screens')).toMatchObject({
      meaning_id: 'phone_screens',
      storage_metric: 'work_phone_screens',
    })
    expect(
      base.metric_rows.find((metric) => metric.id === 'invited_to_interview')?.archived_at,
    ).toBeUndefined()
    expect(() =>
      replaceWorkMetricSemantics(
        base,
        'invited_to_interview',
        newMetric({ id: 'invited_to_interview' }),
        timestamp,
      ),
    ).toThrow(/Duplicate/)
    expect(() =>
      replaceWorkMetricSemantics(
        base,
        'invited_to_interview',
        newMetric({ meaning_id: 'invited_to_interview', storage_metric: 'work_phone_screens_2' }),
        timestamp,
      ),
    ).toThrow(/Duplicate/)
    expect(() =>
      replaceWorkMetricSemantics(
        base,
        'invited_to_interview',
        newMetric({ id: 'phone_screens_2', storage_metric: 'work_invited_to_interview' }),
        timestamp,
      ),
    ).toThrow(/Duplicate/)
  })

  test('goal revisions do not retroactively change historical target lookups', () => {
    const base = recruitingProfile()
    const updated = appendWorkGoalRevision(base, weeklyHiresGoalId, {
      effective_from: '2026-03-01',
      id: 'weekly_hires_2026_03_01',
      target: 15,
    })

    expect(goalTargetForDate(updated, weeklyHiresGoalId, '2026-02-23')).toBe(10)
    expect(goalTargetForDate(updated, weeklyHiresGoalId, '2026-03-02')).toBe(15)
    expect(updated.goals[0].revisions[0].effective_until).toBe('2026-03-01')
    expect(base.goals[0].revisions[0].effective_until).toBeUndefined()
    expect(() =>
      appendWorkGoalRevision(updated, weeklyHiresGoalId, {
        effective_from: '2026-02-01',
        id: 'weekly_hires_bad',
        target: 20,
      }),
    ).toThrow(/after/)
  })
})

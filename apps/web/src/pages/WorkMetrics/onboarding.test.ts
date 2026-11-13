import { workSettingsSchema } from '@aurboda/api-spec'
import { format } from 'date-fns'
import { describe, expect, test } from 'vitest'

import { createWorkTemplate, needsWorkOnboarding } from './onboarding'
import { builtInRecruitingProfile, resolveActiveWorkProfile } from './settings'

describe('Work onboarding templates', () => {
  test.each(['recruiting', 'productivity', 'blank'] as const)(
    '%s is valid and independently editable',
    (name) => {
      const first = createWorkTemplate(name)
      const second = createWorkTemplate(name)
      expect(workSettingsSchema.safeParse(first).success).toBe(true)
      const snapshot = structuredClone(second)
      if (!first.profiles) throw new Error('Template must contain profiles')
      first.profiles[0].category_columns[0].label = 'Changed'
      first.profiles[0].sections[0].metric_ids.push('new_metric')
      expect(second).toEqual(snapshot)
    },
  )

  test('recruiting keeps the established storage contract without mutating the built-in template', () => {
    const profile = resolveActiveWorkProfile(createWorkTemplate('recruiting'))
    expect(profile).toEqual(builtInRecruitingProfile)
    profile.metric_rows[0].label = 'Changed'
    expect(createWorkTemplate('recruiting').profiles?.[0]).toEqual(builtInRecruitingProfile)
  })

  test('productivity starts with two inputs and a weekly target effective today', () => {
    const profile = resolveActiveWorkProfile(createWorkTemplate('productivity'))
    expect(profile.metric_rows.map((row) => row.label)).toEqual(['Tasks completed', 'Focus sessions'])
    expect(profile.category_columns.map((column) => column.label)).toEqual(['Total'])
    expect(profile.sections[0].metric_ids).toEqual(profile.metric_rows.map((row) => row.id))
    expect(profile.goals[0].metric_id).toBe(profile.metric_rows[0].id)
    expect(profile.goals[0].revisions[0]).toMatchObject({
      effective_from: format(new Date(), 'yyyy-MM-dd'),
      target: 20,
    })
  })

  test('generic templates have separate storage identities on every creation', () => {
    const profiles = ['productivity', 'productivity', 'blank'].map((template) =>
      resolveActiveWorkProfile(createWorkTemplate(template as 'productivity' | 'blank')),
    )
    expect(new Set(profiles.map((profile) => profile.id)).size).toBe(3)
    expect(new Set(profiles.map((profile) => profile.storage_contract.day_marker_metric)).size).toBe(3)
    const metrics = profiles.flatMap((profile) => profile.metric_rows.map((row) => row.storage_metric))
    expect(new Set(metrics).size).toBe(metrics.length)
    for (const profile of profiles) {
      expect(profile.storage_contract.daily_metric_source).toBe('career_tracker')
      expect(profile.storage_contract.day_marker_metric).toMatch(/^work_[a-f0-9]{32}_day$/)
    }
  })

  test('blank starts with an empty Activities section and a Total column', () => {
    const profile = resolveActiveWorkProfile(createWorkTemplate('blank'))
    expect(profile.metric_rows).toEqual([])
    expect(profile.goals).toEqual([])
    expect(profile.sections).toHaveLength(1)
    expect(profile.sections[0]).toMatchObject({ label: 'Activities', metric_ids: [] })
    expect(profile.category_columns.map((column) => column.label)).toEqual(['Total'])
  })
})

describe('needsWorkOnboarding', () => {
  test('only asks when configuration and history are both absent', () => {
    for (const work of [undefined, null, {}, { profiles: [] }]) {
      expect(needsWorkOnboarding(work, false)).toBe(true)
      expect(needsWorkOnboarding(work, true)).toBe(false)
    }
  })

  test('retains legacy, generic, and forward-compatible settings unchanged', () => {
    const settings = [
      { weekly_hire_goal: 12 },
      { position_labels: { server: 'Sales', housekeeper: 'Ops', dishwasher: 'Support', deckhand: 'Crew' } },
      createWorkTemplate('blank'),
      { future_setting: { enabled: false } },
    ]
    for (const work of settings) {
      const before = structuredClone(work)
      expect(needsWorkOnboarding(work, false)).toBe(false)
      expect(work).toEqual(before)
    }
  })
})

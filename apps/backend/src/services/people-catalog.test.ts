import { type PeopleGuidance, type Person, peopleGuidanceSchema, peopleSourceSchema } from '@aurboda/api-spec'
import { describe, expect, it } from 'vitest'

import { peopleCatalog, peopleSources } from './people-catalog.ts'
import { matchGuidance, peopleContext } from './people-rules.ts'

const ageInYears = (value: number, unit: string) =>
  value / (unit === 'months' ? 12 : unit === 'days' ? 365.2425 : 1)
const applicable = (relationship: PeopleGuidance['relationship_types'][number], years: number) =>
  peopleCatalog.filter(
    (r) =>
      r.relationship_types.includes(relationship) &&
      years >= ageInYears(r.min_age, r.age_unit) &&
      years < ageInYears(r.max_age, r.age_unit),
  )

describe('verified local people catalog', () => {
  it('validates all guidance and sources against the shared schema', () => {
    peopleCatalog.forEach((record) =>
      expect(peopleGuidanceSchema.safeParse(record).success, record.id).toBe(true),
    )
    peopleSources.forEach((source) =>
      expect(peopleSourceSchema.safeParse(source).success, source.id).toBe(true),
    )
  })
  it('has stable unique IDs and no duplicate advice', () => {
    for (const list of [peopleCatalog, peopleSources]) {
      expect(new Set(list.map((r) => r.id)).size).toBe(list.length)
      list.forEach((r) => expect(r.id).toMatch(/^[a-z][a-z0-9-]+$/))
    }
    expect(new Set(peopleCatalog.map((r) => `${r.summary}|${r.practical_actions.join('|')}`)).size).toBe(
      peopleCatalog.length,
    )
  })
  it('has valid half-open ages, versions, eligibility and source references', () => {
    const sources = new Set(peopleSources.map((s) => s.id))
    for (const r of peopleCatalog) {
      expect(r.max_age, r.id).toBeGreaterThan(r.min_age)
      expect(r.relationship_types.length, r.id).toBeGreaterThan(0)
      expect(r.evidence_ids.length, r.id).toBeGreaterThan(0)
      r.evidence_ids.forEach((id) => expect(sources.has(id), `${r.id}: ${id}`).toBe(true))
      expect(r.version).toMatch(/^\d+\.\d+\.\d+$/)
      expect(r.last_verified).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(
        r.needs.some((n) => r.contraindications.includes(n)),
        r.id,
      ).toBe(false)
      expect(
        r.statuses.some((n) => r.contraindications.includes(n)),
        r.id,
      ).toBe(false)
    }
    peopleSources.forEach((s) =>
      expect(
        peopleCatalog.some((r) => r.evidence_ids.includes(s.id)),
        s.id,
      ).toBe(true),
    )
  })
  it('covers child life stages and all adult relationships without quantity standing in for quality', () => {
    for (const years of [0, 0.25, 0.75, 1, 2, 3, 4, 5, 6, 9, 12, 16, 18, 35, 68, 100, 150]) {
      expect(
        applicable('child', years).filter((r) => !r.needs.length && !r.statuses.length).length,
        `child ${years}`,
      ).toBeGreaterThan(0)
    }
    for (const relationship of ['parent', 'lover', 'spouse', 'friend'] as const) {
      for (const years of [18, 34, 68, 100, 150]) {
        expect(applicable(relationship, years).length, `${relationship} ${years}`).toBeGreaterThan(0)
      }
    }
  })
  it('provides exact CDC ages and source separation for a three-month-old', () => {
    const checklist = peopleCatalog.filter((r) => r.checklist_age_months !== undefined)
    expect(checklist.map((r) => r.checklist_age_months)).toEqual([2, 4, 6, 9, 12, 15, 18, 24, 30, 36, 48, 60])
    expect(
      applicable('child', 0.25)
        .filter((r) => r.checklist_age_months !== undefined)
        .map((r) => r.checklist_age_months),
    ).toEqual([2])
    expect(checklist.find((r) => r.checklist_age_months === 4)?.min_age).toBe(4)
    const infant = applicable('child', 0.25)
    expect(infant.some((r) => r.evidence_ids.includes('who-ecd'))).toBe(true)
    expect(infant.some((r) => r.evidence_ids.includes('aap-sleep') && r.guidance_type === 'safety')).toBe(
      true,
    )
    expect(infant.some((r) => r.id.startsWith('school-'))).toBe(false)
  })
  it('does not presume caregiving for an independent parent or infant care for adult relationships', () => {
    const baseline = applicable('parent', 68).filter(
      (r) => !r.status_conditions && !r.log_condition && (!r.needs.length || r.needs.includes('independent')),
    )
    expect(baseline.some((r) => r.guidance_type === 'relationship')).toBe(true)
    expect(baseline.some((r) => r.guidance_type === 'care')).toBe(false)
    for (const relationship of ['parent', 'lover', 'spouse', 'friend'] as const) {
      expect(applicable(relationship, 34).some((r) => r.evidence_ids.includes('aap-sleep'))).toBe(false)
    }
  })
  it('keeps the book heuristic optional, adult-only and explicitly qualified', () => {
    const heuristic = peopleCatalog.filter((r) => r.evidence_ids.includes('like-switch'))
    expect(heuristic.length).toBe(5)
    heuristic.forEach((r) => {
      expect(r.evidence_class).toBe('conceptual_heuristic')
      expect(r.min_age).toBeGreaterThanOrEqual(18)
      expect(r.guidance_type).toBe('resource')
    })
    expect(peopleSources.find((s) => s.id === 'like-switch')?.limitations.join(' ')).toContain(
      'not a validated psychometric instrument',
    )
    expect(peopleCatalog.some((r) => /strength\s*=|\d+%.*friendship|diagnoses? delay/i.test(r.summary))).toBe(
      false,
    )
  })
})

describe('catalog through the authoritative matching pipeline', () => {
  const now = new Date('2026-11-11T12:00:00Z')
  const profile = (
    relationship: Person['relationship'],
    age: number,
    unit: 'months' | 'years',
    needs: string[],
    statuses: string[] = [],
  ): Person => ({
    id: '2b463c55-cf70-43ea-9071-0ab9cf43a036',
    name: 'Test person',
    relationship,
    approximate_age: { value: age, unit, as_of: '2026-11-11' },
    corrected_age_weeks: 0,
    needs,
    statuses,
    goals: [],
    interests: [],
    notes: '',
    enabled_metrics: [],
    hidden_modules: [],
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  })
  const matching = (p: Person) => matchGuidance(p, peopleContext(p, now), peopleCatalog, [], now)
  it('selects prior and upcoming CDC context and separates safety from prevention at three months', () => {
    const p = profile('child', 3, 'months', ['typical'])
    const c = peopleContext(p, now)
    expect(c.previous_checklist_months).toBe(2)
    expect(c.next_checklist_months).toBe(4)
    const selected = matching(p)
    expect(selected.some((r) => r.id === 'infant-conversation')).toBe(true)
    expect(selected.some((r) => r.id === 'awake-floor')).toBe(true)
    expect(selected.some((r) => r.id === 'safe-sleep-back' && r.guidance_type === 'safety')).toBe(true)
    expect(selected.some((r) => r.id === 'development-concern' && r.guidance_type === 'prevention')).toBe(
      true,
    )
    expect(selected.some((r) => r.checklist_age_months === 4)).toBe(false)
    expect(selected.some((r) => r.id.startsWith('school-'))).toBe(false)
  })
  it('keeps independent parents and adult children in adult connection contexts', () => {
    expect(
      matching(profile('parent', 68, 'years', ['independent'])).some((r) => r.guidance_type === 'care'),
    ).toBe(false)
    expect(
      matching(profile('parent', 78, 'years', ['regular_caregiving'])).some(
        (r) => r.id === 'care-coordination',
      ),
    ).toBe(true)
    expect(
      matching(profile('child', 34, 'years', ['typical'])).some((r) => r.id === 'adult-child-connection'),
    ).toBe(true)
    expect(
      matching(profile('child', 34, 'years', ['typical'])).some((r) => r.checklist_age_months !== undefined),
    ).toBe(false)
  })
  it('selects all acceptance relationship contexts without borrowing infant advice', () => {
    for (const p of [
      profile('child', 9, 'years', ['typical']),
      profile('child', 16, 'years', ['typical']),
      profile('spouse', 34, 'years', ['relationship_maintenance'], ['established']),
      profile('lover', 28, 'years', ['building_connection'], ['long_distance']),
      profile('friend', 35, 'years', ['maintain_friendship'], ['reconnect']),
    ]) {
      const selected = matching(p)
      expect(selected.length, p.relationship).toBeGreaterThan(0)
      expect(selected.some((r) => r.id.startsWith('safe-sleep-'))).toBe(false)
    }
    expect(matching(profile('child', 9, 'years', ['typical'])).some((r) => r.id === 'school-learning')).toBe(
      true,
    )
    expect(
      matching(profile('child', 16, 'years', ['typical'])).some((r) => r.domains.includes('privacy')),
    ).toBe(true)
    expect(
      matching(profile('lover', 28, 'years', ['building_connection'], ['long_distance'])).some(
        (r) => r.id === 'framework-distance',
      ),
    ).toBe(true)
    expect(
      matching(profile('friend', 35, 'years', ['maintain_friendship'], ['reconnect'])).some(
        (r) => r.id === 'friend-reconnect',
      ),
    ).toBe(true)
  })
})

describe('infant guide evidence and practical coverage', () => {
  const now = new Date('2026-11-12T12:00:00Z')
  const baby = (months: number, correction = 0): Person => ({
    id: '2b463c55-cf70-43ea-9071-0ab9cf43a036',
    name: 'Synthetic baby',
    relationship: 'child',
    approximate_age: { value: months, unit: 'months', as_of: '2026-11-12' },
    corrected_age_weeks: correction,
    needs: [],
    statuses: [],
    goals: [],
    interests: [],
    notes: '',
    enabled_metrics: [],
    hidden_modules: [],
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  })
  const selected = (person: Person) =>
    matchGuidance(person, peopleContext(person, now), peopleCatalog, [], now)
  const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length
  const canonical = (url: string) => {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}`
  }
  it('keeps official excerpts attributed once per canonical source and within copy budgets', () => {
    const quoted = peopleSources.filter((s) => s.official_quote)
    expect(quoted).toHaveLength(15)
    expect(new Set(quoted.map((s) => canonical(s.url))).size).toBe(quoted.length)
    for (const source of quoted) {
      expect(source.official_quote?.section).toBeTruthy()
      expect(words(source.official_quote?.text ?? ''), source.id).toBeLessThanOrEqual(20)
      expect(source.last_verified).toBe('2026-11-12')
      expect(source.publisher).toBeTruthy()
      expect(source.licensing_status).toContain('Short attributed quotation')
      const ids = peopleSources.filter((s) => canonical(s.url) === canonical(source.url)).map((s) => s.id)
      const copy = peopleCatalog
        .filter((g) => g.evidence_ids.some((id) => ids.includes(id)))
        .flatMap((g) => [g.title, g.summary, ...g.practical_actions])
        .join(' ')
      expect(words(copy) + words(source.official_quote?.text ?? ''), source.url).toBeLessThanOrEqual(200)
    }
  })
  it('provides distinct practical activities through each infant and early toddler band', () => {
    const examples = [
      [0, 'newborn-calm-alert'],
      [3, 'infant-sound-search'],
      [5, 'infant-reach-kick'],
      [7, 'infant-roll-reach'],
      [10, 'infant-container-play'],
      [13, 'toddler-expand-words'],
      [16, 'toddler-block-turns'],
    ] as const
    for (const [age, id] of examples) {
      expect(
        selected(baby(age)).some((g) => g.id === id && g.child_section === 'play'),
        `${age}: ${id}`,
      ).toBe(true)
    }
    expect(
      peopleCatalog
        .filter((g) => g.child_section)
        .every((g) => g.relationship_types.length === 1 && g.relationship_types[0] === 'child'),
    ).toBe(true)
  })
  it('keeps newborn play gradual and supervised without the later WHO time target', () => {
    const newborn = selected(baby(0))
    expect(newborn.some((g) => g.id === 'awake-floor')).toBe(false)
    const tummy = newborn.find((g) => g.id === 'newborn-tummy-start')
    expect(tummy?.practical_actions.join(' ')).toMatch(/awake and directly supervised/)
    expect(tummy?.practical_actions.join(' ')).toMatch(/Build gradually/)
    expect(tummy?.practical_actions.join(' ')).not.toMatch(/30.minutes/)
    expect(selected(baby(3)).some((g) => g.id === 'awake-floor')).toBe(true)
  })
  it('aligns developmental play and observations for a preterm baby', () => {
    const corrected = selected(baby(6, 8))
    expect(corrected.some((g) => g.id === 'infant-reach-kick')).toBe(true)
    expect(corrected.some((g) => g.id === 'infant-head-hands')).toBe(true)
    expect(corrected.some((g) => g.id === 'infant-roll-reach')).toBe(false)
    expect(corrected.some((g) => g.id === 'infant-solids-readiness')).toBe(true)
    const younger = selected(baby(2, 8))
    expect(younger.some((g) => g.id === 'newborn-tummy-start')).toBe(true)
    expect(younger.some((g) => g.id === 'infant-sound-search')).toBe(false)
  })
  it('uses chronological safety cutoffs despite a developmental correction', () => {
    const older = selected(baby(12, 8))
    expect(older.some((g) => g.id === 'infant-no-honey')).toBe(false)
    expect(older.some((g) => g.id === 'infant-rear-facing')).toBe(false)
    expect(older.some((g) => g.id === 'toddler-rear-facing-limits')).toBe(true)
    expect(older.some((g) => g.id === 'infant-emergency-signs')).toBe(true)
    expect(selected(baby(11, 8)).some((g) => g.id === 'infant-no-honey')).toBe(true)
  })
  it('preserves existing safety and concern guidance without classifying ordinary comfort as urgent help', () => {
    expect(
      peopleCatalog.filter((g) => g.id.startsWith('safe-sleep-') && g.child_section === 'safety'),
    ).toHaveLength(6)
    expect(peopleCatalog.find((g) => g.id === 'development-concern')?.child_section).toBe('help')
    for (const id of ['newborn-comfort-check', 'infant-predictable-goodbye']) {
      expect(peopleCatalog.find((g) => g.id === id)?.child_section).toBe('play')
    }
    const emergency = peopleCatalog.find((g) => g.id === 'infant-emergency-signs')
    expect(emergency?.practical_actions.join(' ')).toContain('local emergency services')
    expect(emergency?.evidence_ids).toEqual(['nhs-infant-urgent-help'])
    expect(emergency?.guidance_type).toBe('safety')
  })
})

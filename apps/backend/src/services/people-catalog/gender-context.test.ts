import { type Person, personSchema } from '@aurboda/api-spec'
import { describe, expect, it } from 'vitest'

import { peopleCatalog, peopleSources } from '../people-catalog.ts'
import { matchGuidance, peopleContext } from '../people-rules.ts'
import { genderContextGuidance, genderContextSources } from './gender-context.ts'

const now = new Date('2026-11-12T12:00:00Z')
const person = (relationship: Person['relationship'], gender?: Person['gender'], age = 35): Person =>
  personSchema.parse({
    id: 'e95a1c79-f9c5-42fd-9f79-f17f6d4cf9bb',
    name: 'A person',
    relationship,
    gender,
    approximate_age: { value: age, unit: 'years', as_of: '2026-11-12' },
    needs: [relationship === 'child' ? 'typical' : 'independent'],
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  })
const matched = (p: Person) => matchGuidance(p, peopleContext(p, now), peopleCatalog, [], now)

describe('verified optional gender context', () => {
  it('adds independently sourced context while preserving the previous catalog', () => {
    expect(peopleCatalog).toEqual(expect.arrayContaining(genderContextGuidance))
    expect(peopleSources).toEqual(expect.arrayContaining(genderContextSources))
    expect(genderContextGuidance).toHaveLength(6)
    expect(genderContextSources).toHaveLength(4)
    expect(peopleCatalog.find((r) => r.id === 'safe-sleep-back')?.genders).toBeUndefined()
    genderContextGuidance.forEach((r) => {
      expect(r.evidence_ids.every((id) => peopleSources.some((s) => s.id === id))).toBe(true)
      expect(r.version).toBe('1.1.0')
    })
  })
  it('uses explicit identities across all five adult relationships and leaves general guidance unchanged', () => {
    for (const relationship of ['child', 'parent', 'lover', 'spouse', 'friend'] as const) {
      const general = matched(person(relationship))
        .filter((r) => !r.genders?.length)
        .map((r) => r.id)
      for (const [identity, expected] of [
        ['woman', 'women-unpaid-work-context'],
        ['man', 'men-mental-health-resource'],
        ['nonbinary', 'nonbinary-language-preferences'],
      ] as const) {
        const selected = matched(person(relationship, { identity }))
        expect(
          selected.some((r) => r.id === expected),
          `${relationship}/${identity}`,
        ).toBe(true)
        expect(selected.filter((r) => !r.genders?.length).map((r) => r.id)).toEqual(general)
        expect(selected.filter((r) => r.genders?.length).every((r) => r.genders?.includes(identity))).toBe(
          true,
        )
        expect(selected.find((r) => r.id === expected)?.reasons.join(' ')).toContain(identity)
      }
    }
  })
  it('never classifies missing, private or free-text identities', () => {
    for (const gender of [
      undefined,
      null,
      { identity: 'prefer_not_to_say' as const },
      { identity: 'self_described' as const, description: 'woman man nonbinary' },
    ]) {
      expect(matched(person('friend', gender)).some((r) => r.genders?.length)).toBe(false)
    }
    const original = person('friend', { identity: 'man' })
    const cleared = { ...original, gender: null }
    expect(matched(original).some((r) => r.id === 'men-mental-health-resource')).toBe(true)
    expect(matched(cleared).some((r) => r.id === 'men-mental-health-resource')).toBe(false)
  })
  it('does not alter developmental expectations or safe sleep by gender', () => {
    const infant = {
      ...person('child'),
      approximate_age: { value: 3, unit: 'months' as const, as_of: '2026-11-12' },
    }
    const ids = (p: Person) =>
      matched(p)
        .filter((r) => r.guidance_type === 'development' || r.guidance_type === 'safety')
        .map((r) => r.id)
    for (const identity of ['woman', 'man', 'nonbinary'] as const) {
      expect(ids({ ...infant, gender: { identity } })).toEqual(ids(infant))
    }
    expect(
      genderContextGuidance.filter((r) => r.genders?.length).every((r) => r.guidance_type === 'resource'),
    ).toBe(true)
    expect(
      genderContextGuidance
        .filter((r) => r.genders?.length)
        .every((r) => r.checklist_age_months === undefined),
    ).toBe(true)
  })
  it('keeps universal parenting advice universal and avoids adult resources for children', () => {
    const child = person('child', undefined, 9)
    expect(matched(child).some((r) => r.id === 'child-play-without-stereotypes')).toBe(true)
    expect(
      matched({ ...child, gender: { identity: 'man' } }).some((r) => r.id === 'men-mental-health-resource'),
    ).toBe(false)
    expect(
      matched({ ...child, gender: { identity: 'woman' } }).some((r) => r.id === 'women-unpaid-work-context'),
    ).toBe(false)
    expect(
      matched({ ...child, gender: { identity: 'nonbinary' } }).some(
        (r) => r.id === 'nonbinary-language-preferences',
      ),
    ).toBe(true)
  })
})

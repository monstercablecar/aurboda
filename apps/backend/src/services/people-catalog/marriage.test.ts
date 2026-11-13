import { personSchema, updatePersonBodySchema } from '@aurboda/api-spec'
import { describe, expect, it } from 'vitest'

import { peopleCatalog } from '../people-catalog.ts'
import { matchGuidance, peopleContext, evaluatePeopleGuidance } from '../people-rules.ts'
import { marriageContexts, marriageGuidance } from './marriage.ts'

const now = new Date('2026-11-12T12:00:00Z')
const profile = (statuses: string[], relationship = 'spouse') =>
  personSchema.parse({
    id: '2b463c55-cf70-43ea-9071-0ab9cf43a036',
    name: 'Partner',
    needs: ['relationship_maintenance'],
    relationship,
    approximate_age: { value: 35, unit: 'years', as_of: '2026-11-12' },
    statuses,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  })
const matches = (statuses: string[], relationship = 'spouse') => {
  const person = profile(statuses, relationship)
  return matchGuidance(person, peopleContext(person, now), peopleCatalog, [], now)
}
describe('optional marriage contexts', () => {
  it('matches every explicit context only for a spouse', () => {
    for (const context of marriageContexts) {
      expect(
        matches([context.value]).some((g) => g.id.startsWith('marriage-')),
        context.value,
      ).toBe(true)
      expect(matches([context.value], 'friend').some((g) => g.id.startsWith('marriage-'))).toBe(false)
    }
    expect(matches([]).some((g) => g.id.startsWith('marriage-'))).toBe(false)
  })
  it('preserves serialization and distinguishes omitted from cleared context', () => {
    expect(updatePersonBodySchema.parse({ name: 'New name' }).statuses).toBeUndefined()
    expect(updatePersonBodySchema.parse({ statuses: [] }).statuses).toEqual([])
    expect(profile(['marriage_close', 'long_distance']).statuses).toEqual(['marriage_close', 'long_distance'])
  })
  it('puts individual safety before ordinary couples exercises even with overlapping contexts', () => {
    const matched = matches(marriageContexts.map((c) => c.value))
    expect(matched.some((g) => g.id === 'marriage-safety-individual')).toBe(true)
    expect(
      matched.filter((g) => g.id.startsWith('marriage-')).every((g) => g.guidance_type === 'safety'),
    ).toBe(true)
    expect(
      matched.some((g) => g.guidance_type === 'relationship' && g.review?.claim_type !== 'ethical'),
    ).toBe(false)
  })
  it('uses one applicability pipeline for catalog evaluation', () => {
    const p = profile(['marriage_repairing'])
    const c = peopleContext(p, now)
    for (const g of marriageGuidance) {
      const evaluated = evaluatePeopleGuidance(p, c, [g], [], now)[0]
      expect(evaluated?.applicable).toBe(matches(['marriage_repairing']).some((m) => m.id === g.id))
    }
  })
})

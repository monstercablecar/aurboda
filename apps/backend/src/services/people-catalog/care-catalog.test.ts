import {
  peopleCareMilestoneDefinitionSchema,
  peopleGuidanceSchema,
  peopleSourceSchema,
} from '@aurboda/api-spec'
import { describe, expect, it } from 'vitest'

import { peopleCatalog, peopleSources, peopleMilestones, peopleCareEthics } from '../people-catalog.ts'
import { careGuidance } from './care.ts'
import { pregnancyGuidance, pregnancySources } from './pregnancy.ts'

describe('temporary care catalog', () => {
  it('validates all records and resolves unique source references', () => {
    const ids = peopleSources.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(peopleCatalog.map((g) => g.id)).size).toBe(peopleCatalog.length)
    for (const source of peopleSources) {
      expect(peopleSourceSchema.safeParse(source).success, source.id).toBe(true)
    }
    for (const record of peopleCatalog) {
      expect(peopleGuidanceSchema.safeParse(record).success, record.id).toBe(true)
      for (const id of record.evidence_ids) expect(ids, record.id).toContain(id)
    }
    for (const milestone of peopleMilestones) {
      expect(peopleCareMilestoneDefinitionSchema.safeParse(milestone).success, milestone.id).toBe(true)
      for (const id of milestone.evidence_ids) expect(ids).toContain(id)
    }
  })
  it('covers all eight explicit statuses with reviewed content', () => {
    const records = [...careGuidance, ...pregnancyGuidance]
    for (const kind of [
      'sick',
      'depressed',
      'anxious',
      'surgery_outpatient',
      'surgery_hospitalization',
      'pregnant',
      'mourning',
      'postpartum',
    ]) {
      expect(
        records.some(
          (g) =>
            g.status_conditions?.episode?.kind === kind || g.status_conditions?.any?.includes(kind as never),
        ),
        kind,
      ).toBe(true)
    }
    for (const g of records) {
      expect(g.review?.reviewed_on).toBe('2026-11-12')
      expect(g.review?.empathy_review.notes.length).toBeGreaterThan(40)
    }
  })
  it('keeps gestational windows source-specific and birth preparation open-ended', () => {
    const get = (id: string) => {
      const record = pregnancyGuidance.find((g) => g.id === id)
      if (!record) throw new Error(id)
      return record
    }
    expect(get('pregnancy-gbs-discussion').status_conditions?.episode).toMatchObject({
      min_gestational_days: 252,
      max_gestational_days: 266,
    })
    expect(get('pregnancy-rsv-discussion').status_conditions?.episode).toMatchObject({
      min_gestational_days: 224,
      max_gestational_days: 259,
    })
    expect(get('pregnancy-nausea-comfort').status_conditions?.episode?.phases).toEqual(['first_trimester'])
    expect(
      get('pregnancy-labor-contact-plan').status_conditions?.episode?.max_gestational_days,
    ).toBeUndefined()
    expect(get('pregnancy-labor-contact-plan').status_conditions?.episode?.phases).toContain(
      'birth_preparation',
    )
  })
  it('requires explicit loss support and keeps infant feeding out of it', () => {
    const loss = pregnancyGuidance.find((g) => g.id === 'pregnancy-loss-support')
    const feeding = pregnancyGuidance.find((g) => g.id === 'postpartum-feeding-support')
    expect(loss?.status_conditions?.episode).toEqual({ kind: 'postpartum', phases: ['loss_support'] })
    expect(feeding?.status_conditions?.episode?.phases).not.toContain('loss_support')
  })
  it('does not infer gender and separates adult and younger child support', () => {
    expect(pregnancyGuidance.every((g) => !g.genders?.length)).toBe(true)
    const adult = pregnancyGuidance.find((g) => g.id === 'pregnancy-adult-child-support')
    const younger = pregnancyGuidance.find((g) => g.id === 'pregnancy-younger-child-support')
    expect(adult?.relationship_types).toEqual(['child'])
    expect(adult?.min_age).toBe(18)
    expect(younger?.max_age).toBe(18)
    expect(adult?.practical_actions.join(' ')).toContain('Your adult child')
  })
  it('labels ACOG excerpt verification honestly', () => {
    for (const s of pregnancySources.filter((source) => source.publisher === 'ACOG')) {
      expect(s.verification_method).toBe('official_indexed_excerpt')
      expect(s.limitations.join(' ')).toContain('402')
    }
  })
  it('keeps displayed source-derived copy within the canonical URL budget', () => {
    const counts = new Map<string, number>()
    for (const source of peopleSources) {
      const url = source.url.replace(/^https:\/\/www\./, 'https://').replace(/\/$/, '')
      const records = peopleCatalog.filter((g) => g.evidence_ids.includes(source.id))
      const milestones = peopleMilestones.filter((m) => m.evidence_ids.includes(source.id))
      const copy = [
        ...records.flatMap((g) => [g.title, g.summary, ...g.practical_actions]),
        ...milestones.flatMap((m) => [m.title, m.description]),
        ...(peopleCareEthics.evidence_ids.includes(source.id)
          ? [peopleCareEthics.title, peopleCareEthics.summary, ...peopleCareEthics.principles]
          : []),
      ].join(' ')
      counts.set(url, (counts.get(url) ?? 0) + copy.split(/\s+/).length)
    }
    for (const [url, words] of counts) expect(words, url).toBeLessThanOrEqual(200)
  })
})

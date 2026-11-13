import { journalWorkbookDefinitionSchema } from '@aurboda/api-spec'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { JOURNAL_CATALOG } from './journal-catalog.ts'

const contentLicenses = JSON.parse(
  readFileSync(new URL('./journal-content/licenses.json', import.meta.url), 'utf8'),
) as { entries: { id: string; content_license: string; content_license_url: string; source_url: string }[] }

const get = (id: string) => {
  const definition = JOURNAL_CATALOG.find((item) => item.id === id)
  if (!definition) throw new Error(`Missing catalog definition: ${id}`)
  return definition
}

describe('journal catalog', () => {
  it('ships the thirty complete options, including ten creative companions', () => {
    expect(JOURNAL_CATALOG).toHaveLength(30)
    expect(JOURNAL_CATALOG.filter((item) => item.category === 'creative_play')).toHaveLength(10)
    expect(new Set(JOURNAL_CATALOG.map((item) => item.id)).size).toBe(30)
    for (const item of JOURNAL_CATALOG) {
      expect(journalWorkbookDefinitionSchema.safeParse(item).success).toBe(true)
      expect(item.sections.length).toBeGreaterThanOrEqual(2)
      expect(item.sections.flatMap((section) => section.prompts).length).toBeGreaterThanOrEqual(6)
      expect(item.format).toBe('mini_workbook')
    }
  })

  it('has stable unique identifiers and optional, distinct, usable prompts', () => {
    const allLabels: string[] = []
    for (const item of JOURNAL_CATALOG) {
      expect(item.version).toBe('1.0.0')
      expect(new Set(item.sections.map((section) => section.id)).size).toBe(item.sections.length)
      const prompts = item.sections.flatMap((section) => section.prompts)
      expect(new Set(prompts.map((prompt) => prompt.id)).size).toBe(prompts.length)
      for (const section of item.sections) {
        expect(section.introduction.length).toBeGreaterThan(30)
        for (const prompt of section.prompts) {
          expect(prompt.optional).toBe(true)
          expect(prompt.id).toMatch(/^[a-z][a-z0-9-]+$/)
          expect(prompt.label.length).toBeGreaterThan(35)
          allLabels.push(prompt.label)
        }
      }
    }
    expect(new Set(allLabels).size).toBe(allLabels.length)
  })

  it('retains attribution, license links and a separate content license for every entry', () => {
    expect(contentLicenses.entries).toHaveLength(JOURNAL_CATALOG.length)
    for (const item of JOURNAL_CATALOG) {
      expect(item.source.author.length).toBeGreaterThan(5)
      expect(item.source.title.length).toBeGreaterThan(5)
      expect(item.source.license.length).toBeGreaterThan(5)
      expect(item.source.reviewed_at).toBe('2026-11-13')
      expect(item.source.exclusions.length).toBeGreaterThan(20)
      expect(new URL(item.source.url).protocol).toBe('https:')
      expect(new URL(item.source.license_url).protocol).toBe('https:')
      const license = contentLicenses.entries.find((entry) => entry.id === item.id)
      expect(license?.source_url).toBe(item.source.url)
      expect(license?.content_license).toMatch(/^CC BY/)
      expect(license?.content_license_url).toMatch(/^https:\/\/creativecommons.org\/licenses\//)
    }
  })

  it('preserves source-specific exclusions and honest adaptation limits', () => {
    expect(get('character-laboratory').source.exclusions).toContain('Novakovich')
    expect(get('memory-postcards').source.exclusions).toContain('Glaister')
    expect(get('poetry-playground').source.exclusions).toContain('third-party poems')
    expect(get('anger').source.exclusions).toContain('fee')
    expect(get('anger').source.exclusions).toContain('written authorization')
    expect(get('who').source.exclusions).toContain('WHO does not endorse')
    expect(get('writing-adventure').source.adaptation).toContain('not copied or adapted')
    expect(get('writing-adventure').source.adaptation).toContain('membership')
    expect(get('ggsc').source.adaptation).toContain('practitioners')
    expect(get('heart').source.adaptation).toContain('not inspected')
    expect(get('student').audience).toContain('6–12')
  })

  it('does not embed executable HTML, external assets or substitute daily tracking', () => {
    for (const item of JOURNAL_CATALOG) {
      const prose = JSON.stringify(item.sections)
      expect(prose).not.toMatch(/<script|<iframe|<img|https?:\/\//i)
      expect(prose).not.toMatch(/rate your mood|medication dose|diagnostic score/i)
    }
  })
})

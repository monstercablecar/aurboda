import type { TaskBoardColumn } from '@aurboda/api-spec'

import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

import { onboardingCatalog } from './task-onboarding-catalog.ts'

const columns: TaskBoardColumn[] = [
  { id: 'queue', title: 'My queue', status: 'todo', color: '#123456', wip_limit: null },
  { id: 'working', title: 'Doing this week', status: 'in_progress', color: '#123456', wip_limit: 2 },
  { id: 'finished', title: 'Finished work', status: 'done', color: '#123456', wip_limit: null },
]

const cards = onboardingCatalog(columns)

describe('optional onboarding catalog', () => {
  test('keeps stable distinct actions, concise titles and removable guidance', () => {
    expect(new Set(cards.map((card) => card.key)).size).toBe(cards.length)
    expect(cards.length).toBeLessThanOrEqual(35)
    expect(cards[0].key).toBe('feature_control')
    expect(cards[1].key).toBe('kanban')
    for (const card of cards) {
      expect(card.title.length).toBeLessThanOrEqual(65)
      expect(card.description).toContain('Done when:')
      expect(card.description).toContain('complete or delete this card')
      expect(card.description).toContain('If you already did this, move the card to a Done-category column')
      expect(card.description).toContain('[Settings](/settings)')
      expect(card.description).not.toMatch(/\/admin|PHQ-9|GAD-7/)
    }
  })

  test('teaches the existing customized workflow without modifying it', () => {
    const before = structuredClone(columns)
    const guidance = onboardingCatalog(columns).find((card) => card.key === 'kanban')?.description
    expect(columns).toEqual(before)
    expect(guidance).toContain('“Doing this week”')
    expect(guidance).toContain('“Finished work”')
    expect(guidance).toContain('including archived tasks')
    expect(guidance).toContain('Board settings')
    expect(guidance).toContain('checkmark')
    expect(guidance).not.toContain('“In progress”')
    const fallback = onboardingCatalog([]).find((card) => card.key === 'kanban')?.description
    expect(fallback).toContain('“In progress”')
    expect(fallback).toContain('“Done”')
  })

  test('covers distinct assessment purposes and preserves the supported score formats', () => {
    expect(cards.map((card) => card.key)).toEqual(
      expect.arrayContaining([
        'pss14',
        'swls',
        'who5',
        'big_five',
        'mensa',
        'benchmark_reaction',
        'benchmark_visual_memory',
        'benchmark_number_memory',
        'benchmark_sequence_memory',
        'benchmark_verbal_memory',
        'testmybrain',
        'foghouse_memory',
        'foghouse_reaction',
      ]),
    )
    expect(cards.find((card) => card.key === 'big_five')?.description).toContain('24–120')
    expect(cards.find((card) => card.key === 'big_five')?.description).toContain('60–300')
    expect(cards.find((card) => card.key === 'who5')?.description).toContain('multiples of four')
    expect(cards.find((card) => card.key === 'pss14')?.description).toContain('0–56')
    expect(cards.find((card) => card.key === 'swls')?.description).toContain('5–35')
    expect(cards.find((card) => card.key === 'testmybrain')?.description).toContain(
      'does not create a pooled numeric chart series',
    )
  })

  test('keeps nutrition and condition-specific responses separate, without recurring daily checklist cards', () => {
    const nutrition = cards.filter((card) => ['reaps', 'nutrition_intake'].includes(card.key))
    expect(nutrition.map((card) => card.key)).toEqual(['reaps', 'nutrition_intake'])
    const ketamine = cards.filter((card) => card.key.startsWith('ketamine_'))
    expect(ketamine).toHaveLength(3)
    for (const card of ketamine) {
      expect(card.description).toContain('Only relevant if ketamine treatment is already part of your care')
      expect(card.description).toContain('Do not create a treatment or invent answers')
    }
    for (const key of ['morning', 'midday', 'evening', 'simple_food_daily_check']) {
      expect(cards.map((card) => card.key)).not.toContain(key)
    }
  })

  test('links only to registered existing routes and explains hidden-page recovery', () => {
    const router = readFileSync(new URL('../../../web/src/index.tsx', import.meta.url), 'utf8')
    const registered = new Set([...router.matchAll(/<Route path="([^"]+)"/g)].map((match) => match[1]))
    for (const card of cards) {
      const urls = [...card.description.matchAll(/\]\((\/[^)]*)\)/g)].map((match) => match[1])
      expect(urls.length).toBeGreaterThan(0)
      for (const url of urls) expect(registered.has(url), `${card.key}: ${url}`).toBe(true)
      expect(card.description).toContain('Feature Control')
      expect(card.description).toContain('visibility only')
    }
  })
})

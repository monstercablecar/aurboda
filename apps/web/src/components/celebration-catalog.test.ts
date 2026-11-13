import { describe, expect, it } from 'vitest'

import {
  assessmentCelebrationFamily,
  celebrationFamilies,
  createCelebrationPicker,
} from './celebration-catalog'
describe('celebration catalog', () => {
  it.each([
    ['mental_ipip120', 'big-five'],
    ['mental_ipip300', 'big-five'],
    ['mental_hb_reaction', 'quick'],
    ['mental_hb_memory', 'quick'],
    ['mental_mensa', 'reasoning'],
    ['mental_testmybrain', 'reasoning'],
    ['unknown', 'check-in'],
  ])('maps %s to %s', (key, family) => expect(assessmentCelebrationFamily(key)).toBe(family))
  it('rotates every family without consecutive repetition and uses new IDs', () => {
    const pick = createCelebrationPicker()
    for (const family of Object.keys(celebrationFamilies) as (keyof typeof celebrationFamilies)[]) {
      const entries = Array.from({ length: 5 }, () => pick(family))
      expect(new Set(entries.slice(0, 4).map((entry) => entry.title + entry.message)).size).toBe(4)
      expect(entries[4].title).toBe(entries[0].title)
      expect(new Set(entries.map((entry) => entry.id)).size).toBe(5)
    }
  })
})

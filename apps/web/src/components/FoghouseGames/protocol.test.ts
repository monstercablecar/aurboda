import { describe, expect, test } from 'vitest'

import { instruments } from '../../pages/Assessments/catalog'
import {
  advanceMemory,
  blocks,
  foreperiod,
  memoryMetrics,
  randomSequence,
  reactionMetrics,
  reactionOutcome,
  serializeResult,
  type MemoryTrial,
  type ReactionTrial,
  type GameResult,
} from './protocol'
const memory = (length: number, correct: boolean, practice = false): MemoryTrial => ({
  sequence: Array.from({ length }, (_, i) => i),
  response: [],
  rt: [],
  correct,
  practice,
})
const reaction = (rt: number | null, outcome: ReactionTrial['outcome']): ReactionTrial => ({
  start_ms: 0,
  foreperiod_ms: 1000,
  stimulus_ms: 1000,
  rt_ms: rt,
  anticipations_ms: [],
  outcome,
})
describe('Foghouse protocols', () => {
  test('randomizes without replacement, preserves fixed geometry, bounds waits', () => {
    const a = randomSequence(9, () => 0)
    const b = randomSequence(9, () => 0.999)
    expect(new Set(a).size).toBe(9)
    expect(a).not.toEqual(b)
    expect(randomSequence(2)).toHaveLength(2)
    expect(blocks).toHaveLength(9)
    expect(foreperiod(() => 0)).toBe(1000)
    expect(foreperiod(() => 0.999999)).toBe(4000)
  })
  test('practice never inflates span; two attempts and one success advance, two failures stop', () => {
    const trials = [memory(9, true, true), memory(2, false)]
    expect(advanceMemory(trials, 2)).toBe(2)
    trials.push(memory(2, true))
    expect(advanceMemory(trials, 2)).toBe(3)
    trials.push(memory(3, false), memory(3, false))
    expect(advanceMemory(trials, 3)).toBeNull()
    expect(memoryMetrics(trials)).toEqual({ span: 2, correct: 1, total: 4 })
    expect(advanceMemory([memory(9, true), memory(9, true)], 9)).toBeNull()
    expect(memoryMetrics([memory(2, false)]).span).toBe(0)
  })
  test('100ms boundary, omissions and shortened deadline trials remain distinct', () => {
    expect(reactionOutcome(99, 2000, 2000)).toBe('anticipation')
    expect(reactionOutcome(100, 2000, 2000)).toBe('valid')
    expect(reactionOutcome(null, 5000, 2000)).toBe('omission')
    expect(reactionOutcome(null, 180000, 500)).toBe('boundary')
    expect(reactionOutcome(200, 179900, 500)).toBe('valid')
    expect(reactionOutcome(500, 180001, 500)).toBe('boundary')
    expect(reactionOutcome(200, 180001, 500)).toBe('valid')
    expect(reactionOutcome(2001, 3000, 2000)).toBe('omission')
  })
  test('summaries exclude anticipation, omission, boundary and absent data stays absent', () => {
    const early = reaction(99, 'anticipation')
    early.anticipations_ms = [10, 50]
    expect(
      reactionMetrics([
        reaction(200, 'valid'),
        reaction(400, 'valid'),
        early,
        reaction(null, 'omission'),
        reaction(null, 'boundary'),
      ]),
    ).toEqual({
      median: 300,
      variability: 100,
      speed: 3.75,
      valid: 2,
      anticipations: 3,
      omissions: 1,
      total: 5,
      duration: 180,
    })
    expect(reactionMetrics([])).not.toHaveProperty('median')
  })
  test('separate templates and metric namespaces leave external catalog positions intact', () => {
    expect(instruments[0].key).toBe('mental_ipip120_v1')
    expect(instruments[1].key).toBe('mental_mensa_v1')
    const games = instruments.filter((item) => item.key.startsWith('mental_foghouse_'))
    expect(games.map((item) => item.key)).toEqual([
      'mental_foghouse_memory_test_v1',
      'mental_foghouse_reaction_test_v1',
    ])
    const metrics = games.flatMap((item) => item.fields.map((field) => field.metric_name))
    expect(metrics.every((name) => name?.startsWith('foghouse_'))).toBe(true)
    expect(new Set(metrics).size).toBe(metrics.length)
  })
  test('raw data serialization refuses oversize instead of truncating', () => {
    const result = { device: 'x'.repeat(100001) } as GameResult
    expect(() => serializeResult(result)).toThrow('not been truncated')
  })
})

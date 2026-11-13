import { expect, test } from 'vitest'

import { goalsUrl } from '../../components/goal-history-range'
import { showHealthGoals } from './goal-tabs'
test('plain web goals opens tasks while explicit health and legacy links remain health', () => {
  expect(showHealthGoals({})).toBe(false)
  expect(showHealthGoals({ tab: 'tasks' })).toBe(false)
  for (const query of [
    { tab: 'health' },
    { history: 'goal-id' },
    { new: '1' },
    { embed: '1' },
    { range: '30d' },
  ]) {
    expect(showHealthGoals(query)).toBe(true)
  }
})
test('closing goal history keeps the health tab', () => {
  const url = new URL(goalsUrl({ range: '30d' }), 'https://example.org')
  expect(showHealthGoals(Object.fromEntries(url.searchParams))).toBe(true)
})

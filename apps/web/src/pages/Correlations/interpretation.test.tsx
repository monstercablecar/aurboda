// @vitest-environment jsdom
import type { ContinuousCorrelationData, GenericCorrelationData } from '@aurboda/api-spec'

import { render } from 'preact'
import { act } from 'preact/test-utils'
import { expect, test, vi } from 'vitest'
vi.mock('../../state/auth', () => ({ auth: { value: {} } }))
import { ContinuousResults, EventOutcomeResults } from './Explore'

test.each([0, 5, 10000])(
  'continuous results with n=%s retain interpretation limits and denominators',
  (n) => {
    const root = document.createElement('div')
    const data = {
      n,
      n_complete: null,
      lag_days: 0,
      pearson: n ? 0.9 : null,
      spearman: null,
      group_comparison: null,
      trigger: { kind: 'metric', metric: 'weight' },
      outcome: { kind: 'metric', metric: 'sleep_score' },
      series: [],
    } as unknown as ContinuousCorrelationData
    act(() => render(<ContinuousResults data={data} selectors={undefined} />, root))
    expect(root.textContent).toContain('do not show what caused a change')
    expect(root.textContent).toContain(`n=${n}`)
    if (n >= 30) expect(root.textContent).toContain('a larger sample does not establish causation')
    act(() => render(null, root))
  },
)

test('event results retain onset/known-day coverage beside noncausal interpretation', () => {
  const root = document.createElement('div')
  const data = {
    event_outcome: {
      onsets: 2,
      outcome_days: 3,
      trigger_days: 4,
      known_days: 9,
      denominator: 'known',
      comparisons: 1,
      per_lag: [],
    },
  } as unknown as GenericCorrelationData
  act(() => render(<EventOutcomeResults data={data} />, root))
  expect(root.textContent).toContain('2 onsets')
  expect(root.textContent).toContain('9 known days')
  expect(root.textContent).toContain('do not show what caused a change')
  act(() => render(null, root))
})

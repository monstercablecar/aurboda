// @vitest-environment jsdom
import type { TrainingLoadResult } from '@aurboda/api-spec'

import { render } from 'preact'
import { act } from 'preact/test-utils'
import { expect, test, vi } from 'vitest'

import { LoadOverview } from './index'
vi.mock('./TrainingLoadChart', () => ({ TrainingLoadChart: () => <div>Chart</div> }))
vi.mock('../../state/auth', () => ({ auth: { value: {} } }))

test.each([10, -10])('populated load difference %s describes estimates and missing coverage', (tsb) => {
  const root = document.createElement('div')
  const data = {
    points: [
      { time: '2026-11-24T10:00:00Z', ctl: 30, atl: 30 - tsb, tsb, training_impulse: 5, activity_impulse: 0 },
    ],
    bootstrapping: true,
    // A cached legacy response must not reintroduce readiness bands.
    zones: { balanced_min: 10, balanced_max: 20, strained_max: 30 },
    estimated_impulse: { estimated_workouts: 1, workouts: 1, estimated_share: 1 },
  } as TrainingLoadResult
  act(() => render(<LoadOverview data={data} />, root))
  expect(root.textContent).toContain('Source coverage is unknown')
  expect(root.textContent).toContain('a gap does not show rest or recovery')
  expect(root.textContent).toContain('estimated from duration')
  expect(root.textContent).toContain('Load difference (TSB)')
  expect(root.textContent).not.toMatch(/hard session|overtraining|Optimal|Undertrained|Fresh|Fatigued/)
  act(() => render(null, root))
})

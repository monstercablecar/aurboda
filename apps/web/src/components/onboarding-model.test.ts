import { expect, it } from 'vitest'

import { onboardingCounts, onboardingSteps } from './onboarding-model'

it('keeps durable and legacy completion without live signals, with explicit overrides', () => {
  const steps = onboardingSteps({ wearable: 'completed', ask_ai: 'pending', android_app: 'skipped' }, [
    'ask_ai',
    'computer_time',
  ])
  expect(steps.find((s) => s.id === 'wearable')?.status).toBe('completed')
  expect(steps.find((s) => s.id === 'computer_time')?.status).toBe('completed')
  expect(steps.find((s) => s.id === 'ask_ai')?.status).toBe('pending')
  expect(onboardingCounts(steps)).toEqual({ completed: 2, skipped: 1, remaining: 9 })
})
it('does not turn connected or detected status text into completion', () => {
  expect(
    onboardingSteps({}, [], { wearable: 'Connected — waiting for first data' }).find(
      (s) => s.id === 'wearable',
    )?.status,
  ).toBe('pending')
})
it('links feature tours to their actual workspaces and labels them as exploration', () => {
  const tours = onboardingSteps().filter((s) => s.manualLabel === "I've explored this")
  expect(tours.map((s) => s.action?.href)).toEqual([
    '/treatments',
    '/cpap',
    '/assessments',
    '/simple-food',
    '/work',
    '/people',
  ])
  expect(onboardingSteps().map((s) => s.id)).toHaveLength(12)
})

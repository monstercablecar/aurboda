// @vitest-environment jsdom
import type { TreatmentCheckin, TreatmentSession } from '@aurboda/api-spec'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { BriefCheckinForm } from './BriefCheckinForm'
import { CheckinPlanEditor, defaultCheckinPlan } from './CheckinPlanEditor'
import { TreatmentCheckins } from './TreatmentCheckins'

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  list: vi.fn(),
  action: vi.fn(),
  add: vi.fn(),
  settings: vi.fn(),
  generation: 0,
}))
vi.mock('../../state/api/treatment-checkins', () => ({
  saveTreatmentCheckin: mocks.save,
  fetchTreatmentCheckins: mocks.list,
  actOnTreatmentCheckin: mocks.action,
  addTreatmentReflection: mocks.add,
  changeTreatmentCheckinSettings: mocks.settings,
}))
vi.mock('../../state/api/pharmacology', () => ({ pharmacologyErrorMessage: (e: Error) => e.message }))
vi.mock('../../state/api', () => ({
  pharmacologyErrorMessage: (e: Error) => e.message,
  submitAssessment: vi.fn(),
}))
vi.mock('../../state/sessionBoundary', () => ({ currentSessionGeneration: () => mocks.generation }))
const entry: TreatmentCheckin = {
  id: 'entry',
  treatment_session_id: 'session',
  kind: 'current',
  status: 'due',
  due_at: null,
  expires_at: null,
  snoozed_until: null,
  observed_at: null,
  draft: {},
  draft_responses: [],
  questionnaire: null,
  revision: 0,
  assessment: null,
  personal_goal: '',
  answer_labels: {},
  created_at: '2026-11-18T12:00:00Z',
}
let container: HTMLDivElement
let client: QueryClient
beforeEach(() => {
  vi.clearAllMocks()
  mocks.generation = 0
  mocks.list.mockResolvedValue({ success: true, data: [entry], plan: null, scheduler_ready: true })
  mocks.save.mockImplementation(async (_id, body) => ({ ...entry, revision: body.revision + 1 }))
  container = document.createElement('div')
  document.body.append(container)
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})
afterEach(() => {
  act(() => render(null, container))
  container.remove()
  client.clear()
  vi.useRealTimers()
})
const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 15))
  })
}
const click = (label: string) => {
  const button = [...container.querySelectorAll('button')].find((b) => b.textContent === label)!
  act(() => button.click())
}

test('late windows offer honest current/reflection paths and cannot be completed as next-day', async () => {
  mocks.list.mockResolvedValue({
    data: [{ ...entry, kind: 'next_day', status: 'window_passed' }],
    plan: null,
  })
  act(() =>
    render(
      <QueryClientProvider client={client}>
        <TreatmentCheckins session={{ id: 'session', status: 'completed' } as TreatmentSession} />
      </QueryClientProvider>,
      container,
    ),
  )
  await flush()
  expect(container.textContent).toContain('Window passed · not recorded')
  expect(container.textContent).toContain('Add a later reflection')
  expect(container.textContent).toContain('Check in about now')
  expect([...container.querySelectorAll('button')].some((b) => b.textContent === 'Complete')).toBe(false)
})
test('short form saves a draft before closing and uses the latest revision for completion', async () => {
  const close = vi.fn()
  const saved = vi.fn()
  act(() => render(<BriefCheckinForm entry={entry} onClose={close} onSaved={saved} />, container))
  const textarea = container.querySelector('textarea')!
  act(() => {
    textarea.value = 'An honest observation'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
  click('Save draft and close')
  await flush()
  expect(mocks.save).toHaveBeenCalledWith(
    'entry',
    expect.objectContaining({ answers: { notes: 'An honest observation' }, revision: 0 }),
    false,
  )
  expect(close).toHaveBeenCalledOnce()
})
test('queued drafts never write after an account change', async () => {
  vi.useFakeTimers()
  act(() => render(<BriefCheckinForm entry={entry} onClose={() => {}} onSaved={() => {}} />, container))
  const textarea = container.querySelector('textarea')!
  act(() => {
    textarea.value = 'private'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
  mocks.generation++
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(mocks.save).not.toHaveBeenCalled()
})
test('brief reflection never asks for guessed historical ratings', () => {
  act(() =>
    render(
      <BriefCheckinForm entry={{ ...entry, kind: 'reflection' }} onClose={() => {}} onSaved={() => {}} />,
      container,
    ),
  )
  expect(container.textContent).toContain('will not fill a missed next-day check-in')
  expect(container.textContent).not.toContain('How is your mood?')
  expect(container.textContent).toContain('It is okay to say you do not remember')
})
test('plan editor supports custom questionnaire timing without assigning anything by default', () => {
  const change = vi.fn()
  act(() =>
    render(
      <CheckinPlanEditor
        value={defaultCheckinPlan()}
        onChange={change}
        questionnaires={[
          { id: 'custom', enabled: true, stable_key: 'personal', display_name: 'My question' } as never,
        ]}
      />,
      container,
    ),
  )
  click('Add questionnaire')
  expect(change).toHaveBeenCalledWith(
    expect.objectContaining({
      additional: [{ template_id: 'custom', offset_hours: 24, window_hours: 24 }],
      reminders_enabled: false,
    }),
  )
})

test('validation failure can be corrected and resubmitted without losing answers', async () => {
  mocks.save.mockRejectedValueOnce(new Error('Answer the required questions.'))
  const saved = vi.fn()
  act(() => render(<BriefCheckinForm entry={entry} onClose={() => {}} onSaved={saved} />, container))
  act(() => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  await flush()
  const textarea = container.querySelector('textarea')!
  act(() => {
    textarea.value = 'Corrected answer'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(container.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(false)
  act(() => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  await flush()
  expect(saved).toHaveBeenCalledOnce()
  expect(mocks.save).toHaveBeenLastCalledWith(
    'entry',
    expect.objectContaining({ answers: { notes: 'Corrected answer' }, revision: 0 }),
    true,
  )
})
test('custom datetime draft displays local time while preserving the stored instant', () => {
  const instant = '2026-11-18T10:30:00-07:00'
  const question = {
    id: 'date-q',
    version: 1,
    enabled: true,
    prompt: 'When?',
    response_type: 'datetime',
    config: {},
    anchors: {},
  }
  const custom = {
    ...entry,
    kind: 'custom',
    questionnaire: { questions: [question] },
    draft_responses: [{ question_id: 'date-q', question_version: 1, value: instant }],
  } as TreatmentCheckin
  act(() => render(<BriefCheckinForm entry={custom} onClose={() => {}} onSaved={() => {}} />, container))
  const field = container.querySelectorAll<HTMLInputElement>('input[type=datetime-local]')[1]!
  expect(field.value).not.toBe('')
  expect(new Date(field.value).toISOString()).toBe(new Date(instant).toISOString())
})

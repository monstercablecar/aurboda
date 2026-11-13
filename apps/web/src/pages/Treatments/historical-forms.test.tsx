// @vitest-environment jsdom
import type {
  ContextEventType,
  QuestionnaireTemplate,
  Substance,
  TreatmentSession,
  TreatmentType,
} from '@aurboda/api-spec'
import type { ComponentChildren } from 'preact'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { AssessmentForm } from './AssessmentForm'
import { ContextEventForm } from './ContextEventForm'
import { PrnForm } from './PrnForm'
import { TreatmentSessionForm } from './TreatmentJournal'
const mocks = vi.hoisted(() => ({
  administration: vi.fn().mockResolvedValue({}),
  assessment: vi.fn().mockResolvedValue({}),
  context: vi.fn().mockResolvedValue({}),
  update: vi.fn().mockResolvedValue({}),
  create: vi.fn().mockResolvedValue({}),
}))
vi.mock('../../state/api', () => ({
  createAdministration: mocks.administration,
  submitAssessment: mocks.assessment,
  createContextEvent: mocks.context,
  updateTreatmentSession: mocks.update,
  createTreatmentSession: mocks.create,
  pharmacologyErrorMessage: (e: Error) => e.message,
}))
const substance = {
  id: 's',
  display_name: 'Example',
  status: 'active',
  default_dose: 10,
  dose_unit: 'mg',
} as Substance
const context = { id: 'c', display_name: 'Context', active: true } as ContextEventType
const template = {
  id: 'q',
  display_name: 'Check-in',
  questions: [
    {
      id: 'answer',
      version: 1,
      enabled: true,
      required: false,
      sort_order: 0,
      response_type: 'long_text',
      prompt: 'Notes',
      config: {},
    },
  ],
} as unknown as QuestionnaireTemplate
const treatment = {
  id: 't',
  display_name: 'Treatment',
  active: true,
  default_follow_up_hours: [],
} as unknown as TreatmentType
const props = { timezone: 'America/Denver', onCancel: () => {}, onSaved: () => {} }
let container: HTMLDivElement
let client: QueryClient
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-13T02:00:00Z'))
  container = document.createElement('div')
  document.body.append(container)
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
})
afterEach(() => {
  act(() => render(null, container))
  client.clear()
  container.remove()
  vi.useRealTimers()
})
const mount = (child: ComponentChildren) =>
  act(() => render(<QueryClientProvider client={client}>{child}</QueryClientProvider>, container))
const input = (selector: string) => {
  const e = container.querySelector<HTMLInputElement>(selector)
  if (!e) throw new Error(selector)
  return e
}
const fill = (selector: string, value: string) =>
  act(() => {
    const e = input(selector)
    e.value = value
    e.dispatchEvent(new Event('input', { bubbles: true }))
  })
const submit = async () => {
  await act(async () => {
    const f = container.querySelector('form')
    if (!f) throw new Error('Missing form')
    f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await new Promise((r) => setTimeout(r, 0))
  })
}

test.each(['prn', 'assessment', 'context'])(
  '%s historical entry requires explicit actual time',
  async (kind) => {
    const date = '2026-11-11'
    if (kind === 'prn') mount(<PrnForm {...props} date={date} substances={[substance]} />)
    if (kind === 'context') mount(<ContextEventForm {...props} date={date} contextTypes={[context]} />)
    if (kind === 'assessment') {
      mount(<AssessmentForm {...props} date={date} template={template} />)
      fill('textarea', 'Feeling fine')
    }
    expect(input('input[type="datetime-local"]').value).toBe('')
    expect(input('input[type="datetime-local"]').required).toBe(true)
    await submit()
    const mock = kind === 'prn' ? mocks.administration : kind === 'context' ? mocks.context : mocks.assessment
    expect(mock).not.toHaveBeenCalled()
    fill('input[type="datetime-local"]', '2026-11-11T08:15')
    await submit()
    const field = kind === 'prn' ? 'administered_at' : kind === 'context' ? 'started_at' : 'assessed_at'
    expect(mock).toHaveBeenCalledWith(
      expect.objectContaining({ [field]: new Date('2026-11-11T08:15').toISOString() }),
    )
  },
)
test('today in selected timezone retains current-time convenience', () => {
  mount(<PrnForm {...props} date="2026-11-12" substances={[substance]} />)
  expect(input('input[type="datetime-local"]').value).not.toBe('')
})
test('context rejects an end before its start', async () => {
  mount(<ContextEventForm {...props} contextTypes={[context]} />)
  fill('input[type="datetime-local"]', '2026-11-12T10:00')
  fill('label:nth-child(3) input', '2026-11-12T09:00')
  await submit()
  expect(mocks.context).not.toHaveBeenCalled()
  expect(container.textContent).toContain('End time cannot be before start time.')
})
test('editing a session clears removed timestamps with null', async () => {
  const session = {
    id: 'session',
    treatment_type: treatment,
    planned_at: '2026-11-11T10:00:00Z',
    actual_start: '2026-11-11T10:00:00Z',
    actual_end: '2026-11-11T11:00:00Z',
    status: 'planned',
  } as TreatmentSession
  mount(<TreatmentSessionForm {...props} session={session} treatmentTypes={[treatment]} />)
  for (const e of container.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]')) {
    act(() => {
      e.value = ''
      e.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  await submit()
  expect(mocks.update).toHaveBeenCalledWith(
    'session',
    expect.objectContaining({ planned_at: null, actual_start: null, actual_end: null }),
  )
})
test.each(['missing', 'reversed'])('session rejects %s start relative to end', async (kind) => {
  mount(<TreatmentSessionForm {...props} treatmentTypes={[treatment]} />)
  const fields = [...container.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]')]
  act(() => {
    if (kind === 'reversed') {
      fields[1].value = '2026-11-12T10:00'
      fields[1].dispatchEvent(new Event('input', { bubbles: true }))
    }
    fields[2].value = '2026-11-12T09:00'
    fields[2].dispatchEvent(new Event('input', { bubbles: true }))
  })
  await submit()
  expect(mocks.create).not.toHaveBeenCalled()
  expect(container.querySelector('[role="alert"]')).not.toBeNull()
})

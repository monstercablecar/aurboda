// @vitest-environment jsdom
import type { Assessment, QuestionnaireTemplate, TreatmentSession, TreatmentType } from '@aurboda/api-spec'
import type { ComponentChildren } from 'preact'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { TreatmentJournal, TreatmentSessionForm } from './TreatmentJournal'

const mocks = vi.hoisted(() => ({ create: vi.fn().mockResolvedValue({}), query: { treatment: 'saved' } }))
vi.mock('preact-iso', () => ({ useLocation: () => ({ query: mocks.query, route: vi.fn() }) }))
vi.mock('../../state/api', () => ({
  createTreatmentSession: mocks.create,
  updateTreatmentSession: vi.fn(),
  pharmacologyErrorMessage: (error: Error) => error.message,
}))
const type = (key: string, active = true): TreatmentType => ({
  id: key,
  key,
  display_name: key === 'custom' ? 'A custom session' : key[0].toUpperCase() + key.slice(1),
  category: 'wellness',
  active,
  default_follow_up_hours: [],
  created_at: '2026-11-13T00:00:00Z',
  updated_at: '2026-11-13T00:00:00Z',
})
const session = (treatment: TreatmentType) =>
  ({
    id: 'saved',
    treatment_type: treatment,
    status: 'planned',
    created_at: '2026-11-13T00:00:00Z',
  }) as TreatmentSession
const formProps = { timezone: 'UTC', onCancel: () => {}, onSaved: () => {} }
let container: HTMLDivElement
let client: QueryClient
beforeEach(() => {
  vi.clearAllMocks()
  container = document.createElement('div')
  document.body.append(container)
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
})
afterEach(() => {
  act(() => render(null, container))
  client.clear()
  container.remove()
})
const mount = (child: ComponentChildren) =>
  act(() => render(<QueryClientProvider client={client}>{child}</QueryClientProvider>, container))
const treatmentSelect = () => container.querySelector<HTMLSelectElement>('select')!

test('new sessions default to chamomile and list meditation before custom types and ketamine', async () => {
  mount(
    <TreatmentSessionForm
      {...formProps}
      treatmentTypes={[type('ketamine'), type('custom'), type('meditation'), type('chamomile')]}
    />,
  )
  expect(treatmentSelect().value).toBe('chamomile')
  expect([...treatmentSelect().options].map((option) => option.text)).toEqual([
    'Choose…',
    'Chamomile',
    'Meditation',
    'A custom session',
    'Ketamine',
  ])
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  expect(mocks.create).toHaveBeenCalledWith(
    expect.objectContaining({ treatment_type_id: 'chamomile', follow_up_hours: [] }),
  )
})

test.each([{ chamomile: [] }, { chamomile: [type('chamomile', false)] }])(
  'requires an explicit choice when chamomile is unavailable (%j)',
  ({ chamomile }) => {
    mount(
      <TreatmentSessionForm
        {...formProps}
        treatmentTypes={[type('ketamine'), type('meditation'), ...chamomile]}
      />,
    )
    expect(treatmentSelect().value).toBe('')
    expect([...treatmentSelect().options].some((option) => option.value === 'chamomile')).toBe(false)
  },
)

test('editing an inactive ketamine session retains its type', () => {
  const ketamine = type('ketamine', false)
  mount(
    <TreatmentSessionForm
      {...formProps}
      treatmentTypes={[type('chamomile'), type('meditation'), ketamine]}
      session={session(ketamine)}
    />,
  )
  expect(treatmentSelect().value).toBe('ketamine')
  expect(treatmentSelect().disabled).toBe(true)
})

const templates: QuestionnaireTemplate[] = (
  [
    ['session_preparation', 'Session preparation', 'pre_treatment'],
    ['session_reflection', 'Session reflection', 'post_treatment'],
    ['session_follow_up', 'Next-day reflection', 'follow_up'],
    ['ketamine_pre_session', 'Ketamine pre-session', 'pre_treatment'],
    ['ketamine_post_session', 'Ketamine post-session', 'post_treatment'],
    ['ketamine_next_day', 'Ketamine next-day integration', 'follow_up'],
    ['custom_reflection', 'My custom reflection', 'custom'],
  ] as const
).map(([stable_key, display_name, moment]) => ({
  id: stable_key,
  stable_key,
  display_name,
  moment,
  enabled: true,
  questions: [],
  version: 1,
  created_at: '2026-11-13T00:00:00Z',
  updated_at: '2026-11-13T00:00:00Z',
}))

test.each(['chamomile', 'meditation', 'custom'])(
  '%s sessions show neutral and custom prompts without ketamine questionnaires',
  (key) => {
    mount(
      <TreatmentJournal
        administrations={[]}
        assessments={[]}
        notify={() => {}}
        onRefresh={async () => {}}
        questionnaires={templates}
        sessions={[session(type(key))]}
        substances={[]}
        timezone="UTC"
        treatmentTypes={[type(key)]}
      />,
    )
    expect(container.textContent).toContain('Session preparation')
    expect(container.textContent).toContain('Session reflection')
    expect(container.textContent).toContain('Next-day reflection')
    expect(container.textContent).toContain('My custom reflection')
    expect(container.textContent).not.toContain('Ketamine')
    expect(container.textContent).toContain('Substance record (optional)')
    expect(container.textContent).not.toContain('Not recorded')
  },
)

test('ketamine sessions retain their dedicated and custom questionnaires', () => {
  mount(
    <TreatmentJournal
      administrations={[]}
      assessments={[]}
      notify={() => {}}
      onRefresh={async () => {}}
      questionnaires={templates}
      sessions={[session(type('ketamine'))]}
      substances={[]}
      timezone="UTC"
      treatmentTypes={[type('ketamine')]}
    />,
  )
  expect(container.textContent).toContain('Ketamine pre-session')
  expect(container.textContent).toContain('Ketamine post-session')
  expect(container.textContent).toContain('Ketamine next-day integration')
  expect(container.textContent).toContain('My custom reflection')
  expect(container.textContent).not.toContain('Session preparation')
})

test.each([
  { key: 'chamomile', template: 'ketamine_post_session', label: 'Ketamine post-session' },
  { key: 'ketamine', template: 'session_reflection', label: 'Session reflection' },
])('keeps previously used $template accessible on a $key session', ({ key, template, label }) => {
  mount(
    <TreatmentJournal
      administrations={[]}
      assessments={[{ id: 'answer', treatment_session_id: 'saved', template_id: template } as Assessment]}
      notify={() => {}}
      onRefresh={async () => {}}
      questionnaires={templates}
      sessions={[session(type(key))]}
      substances={[]}
      timezone="UTC"
      treatmentTypes={[type(key)]}
    />,
  )
  expect(container.textContent).toContain(label)
  expect(container.textContent).toContain('1 completed')
})

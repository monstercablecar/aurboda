// @vitest-environment jsdom
import type { QuestionnaireTemplate } from '@aurboda/api-spec'
import type { ComponentChildren } from 'preact'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type * as Api from '../../state/api'

import { dailyQuestionnaireDefinition, managedSimpleFoodTemplates } from '../SimpleFood/model'
import { AssessmentForm, QuestionField } from './AssessmentForm'
import { LibraryView } from './LibraryView'
import { configuredChoices } from './questionnaire-choices'
import { nutritionQuestionnaireIds, treatmentQuestionnaires } from './questionnaire-scope'
import { QuestionnaireForm } from './QuestionnaireForm'
import { TodayView } from './TodayView'

const mocks = vi.hoisted(() => ({
  submit: vi.fn<typeof Api.submitAssessment>(),
  update: vi.fn<typeof Api.updateQuestionnaire>(),
  query: {} as Record<string, string>,
  templates: [] as QuestionnaireTemplate[],
}))
vi.mock('../../state/auth', async () => {
  const { signal } = await import('@preact/signals')
  return { auth: signal({ user: 'questionnaire-test', token: 'token' }) }
})
vi.mock('preact-iso', () => ({ useLocation: () => ({ query: mocks.query, route: vi.fn() }) }))
vi.mock('../../state/api', async () => ({
  ...(await vi.importActual<typeof Api>('../../state/api')),
  submitAssessment: mocks.submit,
  updateQuestionnaire: mocks.update,
  pharmacologyErrorMessage: (error: Error) => error.message,
  fetchQuestionnaires: async () => mocks.templates,
  fetchSubstances: async () => [],
  fetchContextTypes: async () => [],
  fetchRegimens: async () => [],
  fetchTreatmentTypes: async () => [],
  fetchPharmacologyToday: async () => ({
    due_regimens: [],
    assessment_completion: [],
    upcoming_treatments: [],
    recent_administrations: [],
    incomplete_items: [],
  }),
}))
const template = (definition = dailyQuestionnaireDefinition): QuestionnaireTemplate => ({
  ...definition,
  id: '90913729-9aa7-4b4b-83f5-998a855f6079',
  version: 1,
  created_at: '2026-11-11T12:00:00Z',
  updated_at: '2026-11-11T12:00:00Z',
  questions: definition.questions.map((question, index) => ({
    ...question,
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    version: 1,
  })),
})
let container: HTMLDivElement
let client: QueryClient
beforeEach(() => {
  vi.clearAllMocks()
  mocks.query = {}
  mocks.templates = [template()]
  container = document.createElement('div')
  document.body.append(container)
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})
afterEach(() => {
  act(() => render(null, container))
  client.clear()
  container.remove()
})
const mount = (children: ComponentChildren) =>
  act(() => render(<QueryClientProvider client={client}>{children}</QueryClientProvider>, container))
const button = (text: string) => {
  const found = [...container.querySelectorAll('button')].find((b) => b.textContent === text)
  if (!found) throw new Error(`Missing button: ${text}`)
  return found
}
const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
}
const submit = async () => {
  await act(async () => {
    container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
}

describe('configured questionnaire choices', () => {
  test('renders the real daily nutrition options and submits their stable values', async () => {
    mount(<AssessmentForm template={template()} timezone="UTC" onCancel={() => {}} onSaved={() => {}} />)
    expect(container.querySelectorAll('.choice-chips button')).toHaveLength(16)
    expect(container.textContent).toContain('Exclude juice and fried potatoes')
    expect(container.querySelector('[aria-pressed="true"]')).toBeNull()
    act(() => button('Twice or more').click())
    expect(button('Twice or more').getAttribute('aria-pressed')).toBe('true')
    const unknowns = [...container.querySelectorAll('button')].filter((b) => b.textContent === 'Not sure')
    act(() => unknowns.slice(1).forEach((b) => b.click()))
    await submit()
    expect(mocks.submit).toHaveBeenCalledOnce()
    expect(mocks.submit.mock.calls[0]?.[0].responses.map((r: { value: unknown }) => r.value)).toEqual([
      'twice_or_more',
      'unknown',
      'unknown',
      'unknown',
    ])
  })
  test('restores a stable selected value and displays structured option detail', () => {
    const q = {
      ...template().questions[0],
      config: { options: [{ value: 'machine', label: 'Readable', detail: 'More information' }, 'Legacy'] },
    }
    const onChange = vi.fn()
    mount(<QuestionField question={q} value="machine" onChange={onChange} />)
    expect(container.textContent).toContain('More information')
    expect(container.querySelector('[aria-pressed="true"]')?.textContent).toContain('Readable')
    act(() => button('Legacy').click())
    expect(onChange).toHaveBeenCalledWith('Legacy')
  })
  test('multiple choices toggle machine values while preserving other selections', () => {
    const q = {
      ...template().questions[0],
      response_type: 'multiple_choice' as const,
      config: { choices: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }, 'Legacy'] },
    }
    const onChange = vi.fn()
    mount(<QuestionField question={q} value={['a']} onChange={onChange} />)
    expect(button('Alpha').getAttribute('aria-pressed')).toBe('true')
    act(() => button('Beta').click())
    expect(onChange).toHaveBeenLastCalledWith(['a', 'b'])
    act(() => button('Alpha').click())
    expect(onChange).toHaveBeenLastCalledWith([])
  })
  test('ignores malformed options without turning missing into unknown', () => {
    expect(
      configuredChoices({ config: { options: [null, {}, 42, { value: 'unknown', label: 'Not sure' }] } }),
    ).toEqual([{ value: 'unknown', label: 'Not sure' }])
  })
  test('editing a template name preserves structured choices and scoring metadata', async () => {
    const original = template()
    mount(<QuestionnaireForm template={original} onCancel={() => {}} onSaved={() => {}} />)
    const name = container.querySelector('input')
    if (!name) throw new Error('Missing name input')
    act(() => {
      name.value = 'New display name'
      name.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(container.querySelectorAll('input[readonly]')).toHaveLength(4)
    await submit()
    expect(mocks.update).toHaveBeenCalledOnce()
    expect(mocks.update.mock.calls[0]?.[1].questions?.map((q: { config: unknown }) => q.config)).toEqual(
      original.questions.map((q) => q.config),
    )
    expect(mocks.update.mock.calls[0]?.[1].display_name).toBe('New display name')
  })
})

describe('nutrition questionnaires belong on Simple Food', () => {
  const regular = () => ({
    ...template(),
    id: 'regular',
    stable_key: 'personal_daily_check',
    display_name: 'My regular check-in',
  })
  test('filters only exact managed nutrition keys and preserves custom questionnaires and IDs', () => {
    const nutrition = managedSimpleFoodTemplates.map((definition, index) => ({
      ...template(definition),
      id: `nutrition-${index}`,
    }))
    const custom = { ...regular(), stable_key: 'simple_food_my_custom_check' }
    expect(treatmentQuestionnaires([...nutrition, custom])).toEqual([custom])
    expect([...nutritionQuestionnaireIds([...nutrition, custom])]).toEqual([
      'nutrition-0',
      'nutrition-1',
      'nutrition-2',
    ])
  })
  test('Today and Library hide managed nutrition but retain ordinary check-ins', async () => {
    mocks.templates = [template(), regular()]
    mount(<TodayView date="2026-11-11" timezone="UTC" notify={() => {}} />)
    await flush()
    expect(container.textContent).toContain('My regular check-in')
    expect(container.textContent).not.toContain('Daily nutrition check')
    mount(<LibraryView notify={() => {}} />)
    await flush()
    expect(container.textContent).toContain('My regular check-in')
    expect(container.textContent).not.toContain('Daily nutrition check')
  })
  test.each(['simple_food_daily_check', '90913729-9aa7-4b4b-83f5-998a855f6079'])(
    'old assessment link %s points to Simple Food',
    async (assessment) => {
      mocks.query = { action: 'assessment', assessment }
      mount(<TodayView date="2026-11-11" timezone="UTC" notify={() => {}} />)
      await flush()
      expect(container.textContent).toContain('This nutrition check is on Simple Food')
      expect(container.querySelector('a[href="/simple-food"]')?.textContent).toBe('Open Simple Food')
      expect(container.querySelector('.assessment-form')).toBeNull()
    },
  )
})

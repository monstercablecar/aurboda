// @vitest-environment jsdom
import type { Assessment, QuestionnaireTemplate } from '@aurboda/api-spec'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'

import { AssessmentEditor, DailyNutritionCard } from './index'
const api = vi.hoisted(() => ({
  submitAssessment: vi.fn(),
  correctAssessment: vi.fn(),
  pharmacologyErrorMessage: (e: Error) => e.message,
}))
vi.mock('../../state/api/pharmacology', () => api)
vi.mock('../../state/auth', () => ({ auth: { value: { token: 'test' } } }))
let root: HTMLDivElement
let client: QueryClient
const template = { id: 'food', version: 1, questions: [] } as unknown as QuestionnaireTemplate
const entry = (stage = 'completed') =>
  ({
    id: 'existing',
    template_id: 'food',
    template_version: 1,
    created_at: new Date().toISOString(),
    stage,
    assessed_at: new Date().toISOString(),
    timezone: 'UTC',
    notes: 'Existing note',
    responses: [],
    updated_at: new Date().toISOString(),
  }) as Assessment
beforeEach(() => {
  vi.resetAllMocks()
  api.submitAssessment.mockResolvedValue({ id: 'new' })
  api.correctAssessment.mockResolvedValue({ id: 'existing' })
  root = document.createElement('div')
  document.body.append(root)
  client = new QueryClient()
})
afterEach(() => {
  act(() => render(null, root))
  root.remove()
  client.clear()
})
const mount = (kind: 'daily' | 'assessment', entries: Assessment[] = []) =>
  act(() =>
    render(
      <QueryClientProvider client={client}>
        {kind === 'daily' ? (
          <DailyNutritionCard
            assessments={entries}
            template={template}
            timezone="UTC"
            onRefresh={async () => {}}
          />
        ) : (
          <AssessmentEditor
            assessments={entries}
            template={template}
            timezone="UTC"
            onRefresh={async () => {}}
            intro="Nutrition"
            title="Detailed"
          />
        )}
      </QueryClientProvider>,
      root,
    ),
  )
function note() {
  act(() => {
    const input = root.querySelector('textarea')!
    input.value = 'A note'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function click(label: string) {
  await act(async () => {
    ;[...root.querySelectorAll('button')].find((b) => b.textContent === label)!.click()
    await new Promise((resolve) => setTimeout(resolve, 15))
  })
}
test('new nonempty daily check celebrates, repeat save and existing edit do not', async () => {
  mount('daily')
  note()
  await click('Save daily check')
  expect(root.querySelector('.celebration-nutrition-daily')).not.toBeNull()
  act(() => root.querySelector<HTMLButtonElement>('.celebration-dismiss')!.click())
  await click('Save daily check')
  expect(root.querySelector('.celebration-overlay')).toBeNull()
  mount('daily', [entry()])
  note()
  await click('Save daily check')
  expect(root.querySelector('.celebration-overlay')).toBeNull()
})
test('empty and failed daily saves stay ordinary', async () => {
  mount('daily')
  await click('Save daily check')
  expect(api.submitAssessment).not.toHaveBeenCalled()
  note()
  api.submitAssessment.mockRejectedValue(new Error('Failed'))
  await click('Save daily check')
  expect(root.querySelector('.celebration-overlay')).toBeNull()
  expect(root.textContent).toContain('Failed')
})
test('draft save is silent; completing a draft celebrates', async () => {
  mount('assessment', [entry('draft')])
  note()
  await click('Save draft')
  expect(root.querySelector('.celebration-overlay')).toBeNull()
  await click('Complete assessment')
  expect(root.querySelector('.celebration-nutrition-assessment')).not.toBeNull()
})
test('failed assessment completion never celebrates', async () => {
  mount('assessment')
  note()
  api.submitAssessment.mockRejectedValue(new Error('Failed'))
  await click('Complete assessment')
  expect(root.querySelector('.celebration-overlay')).toBeNull()
})

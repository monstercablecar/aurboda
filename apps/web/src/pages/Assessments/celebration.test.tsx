// @vitest-environment jsdom
vi.mock('../../state/auth', () => ({ auth: { value: { token: 'test' } } }))
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { instruments } from './catalog'
import { AssessmentCard } from './index'
import { templateBody } from './model'
const api = vi.hoisted(() => ({
  submitAssessment: vi.fn(),
  fetchQuestionnaires: vi.fn(),
  createQuestionnaire: vi.fn(),
  pharmacologyErrorMessage: (error: Error) => error.message,
}))
vi.mock('../../state/api/pharmacology', () => api)
const instrument = instruments.find((item) => item.key.startsWith('mental_hb_reaction'))!
let container: HTMLDivElement
let onSaved = vi.fn<(key: string) => void>()
let refresh = vi.fn<() => Promise<unknown>>()
beforeEach(() => {
  api.submitAssessment.mockReset()
  const body = templateBody(instrument)
  api.fetchQuestionnaires.mockResolvedValue([
    {
      ...body,
      id: 'template',
      version: 1,
      questions: body.questions.map((question, index) => ({ ...question, id: String(index), version: 1 })),
    },
  ])
  container = document.createElement('div')
  document.body.append(container)
  onSaved = vi.fn()
  refresh = vi.fn().mockResolvedValue(undefined)
  act(() =>
    render(
      <AssessmentCard instrument={instrument} entries={[]} refresh={refresh} onSaved={onSaved} />,
      container,
    ),
  )
})
afterEach(() => {
  act(() => render(null, container))
  container.remove()
})
function score() {
  act(() => {
    const input = container.querySelector<HTMLInputElement>('input[type=number]')!
    input.value = '250'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function save() {
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}
it('only celebrates after a successful save, even if history refresh fails', async () => {
  score()
  api.submitAssessment.mockResolvedValue({})
  refresh.mockRejectedValue(new Error('Refresh failed'))
  await save()
  expect(onSaved).toHaveBeenCalledExactlyOnceWith(instrument.key)
  expect(container.textContent).toContain('History could not refresh')
})
it('does not celebrate validation or save failures', async () => {
  await save()
  expect(api.submitAssessment).not.toHaveBeenCalled()
  expect(onSaved).not.toHaveBeenCalled()
  score()
  api.submitAssessment.mockRejectedValue(new Error('Save failed'))
  await save()
  expect(onSaved).not.toHaveBeenCalled()
  expect(container.textContent).toContain('Save failed')
})

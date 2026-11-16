// @vitest-environment jsdom
import type { Assessment, QuestionnaireTemplate } from '@aurboda/api-spec'

import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, expect, test, vi } from 'vitest'

import { memoryInstrument, reactionInstrument } from '../../components/FoghouseGames/instruments'
import { voidAssessment } from '../../state/api/pharmacology'
import { AssessmentCard } from './index'
import { templateBody } from './model'

vi.mock('../../state/auth', () => ({ auth: { value: { token: 'test' } } }))
vi.mock('../../state/api/pharmacology', () => ({
  voidAssessment: vi.fn(),
  pharmacologyErrorMessage: (error: Error) => error.message,
}))
const container = document.createElement('div')
document.body.append(container)
afterEach(() => {
  act(() => render(null, container))
  vi.restoreAllMocks()
  vi.resetAllMocks()
})

test.each([memoryInstrument, reactionInstrument])(
  '$title result can be deleted from saved history',
  async (instrument) => {
    const body = templateBody(instrument)
    const template = {
      ...body,
      id: 'template',
      version: 1,
      questions: [],
    } as unknown as QuestionnaireTemplate
    const entry: Assessment = {
      id: 'result',
      template_id: template.id,
      template_version: 1,
      assessed_at: '2026-11-16T12:00:00Z',
      created_at: '2026-11-16T12:00:00Z',
      updated_at: '2026-11-16T12:00:00Z',
      timezone: 'UTC',
      responses: [],
    }
    const refresh = vi.fn(async () => draw([]))
    const draw = (entries: Assessment[]) =>
      render(
        <AssessmentCard
          instrument={instrument}
          template={template}
          entries={entries}
          refresh={refresh}
          onSaved={vi.fn()}
        />,
        container,
      )
    act(() => draw([entry]))
    const remove = () =>
      [...container.querySelectorAll('button')].find((button) => button.textContent === 'Delete result')!
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await act(async () => {
      remove().click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(voidAssessment).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    vi.mocked(voidAssessment).mockRejectedValueOnce(new Error('Could not delete'))
    await act(async () => {
      remove().click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(container.textContent).toContain('Could not delete')
    expect(remove()).toBeDefined()
    vi.mocked(voidAssessment).mockResolvedValueOnce(undefined)
    await act(async () => {
      remove().click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(voidAssessment).toHaveBeenLastCalledWith('result')
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Result deleted.')
    expect(remove()).toBeUndefined()
  },
)

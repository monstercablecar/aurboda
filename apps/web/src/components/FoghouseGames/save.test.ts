// @vitest-environment jsdom
import type { Assessment, QuestionnaireTemplate, SubmitAssessmentBody } from '@aurboda/api-spec'

import { describe, expect, test, vi } from 'vitest'

import type { GameResult } from './protocol'

import { templateBody } from '../../pages/Assessments/model'
import { advanceSessionGeneration, currentSessionGeneration } from '../../state/sessionBoundary'
import { memoryInstrument } from './instruments'
import { saveGameResult } from './save'
const template = {
  ...templateBody(memoryInstrument),
  id: 'template',
  version: 1,
  created_at: '',
  updated_at: '',
  questions: templateBody(memoryInstrument).questions.map((q, i) => ({ ...q, id: `q${i}`, version: 1 })),
} as QuestionnaireTemplate
const result: GameResult = {
  game: 'memory',
  protocol: 'foghouse-memory-forward-v1',
  completed_at: '2026-11-12T10:00:00.000Z',
  duration_ms: 50000,
  input_mode: 'pointer',
  device: 'test device',
  trials: [],
  metrics: { span: 0, correct: 0, total: 2 },
}
const api = () => ({
  list: vi.fn(async () => [template]),
  create: vi.fn(async () => template),
  submit: vi.fn(async (_body: SubmitAssessmentBody) => ({ id: 'saved' }) as Assessment),
})
describe('explicit result save', () => {
  test('uses completion timestamp and preserves complete report; retries retain same result', async () => {
    const calls = api()
    calls.submit.mockRejectedValueOnce(new Error('offline'))
    await expect(
      saveGameResult(result, 'tired', currentSessionGeneration(), () => true, calls),
    ).rejects.toThrow('offline')
    await saveGameResult(result, 'tired', currentSessionGeneration(), () => true, calls)
    const body = calls.submit.mock.calls[1][0]
    expect(body.assessed_at).toBe(result.completed_at)
    expect(body.responses.some((answer) => answer.value === JSON.stringify(result))).toBe(true)
    expect(body.responses.some((answer) => answer.value === 'tired')).toBe(true)
  })
  test('account switch after list prevents create and submit', async () => {
    const calls = api()
    calls.list.mockImplementation(async () => {
      advanceSessionGeneration()
      return []
    })
    await expect(saveGameResult(result, '', currentSessionGeneration(), () => true, calls)).rejects.toThrow(
      'Session changed',
    )
    expect(calls.create).not.toHaveBeenCalled()
    expect(calls.submit).not.toHaveBeenCalled()
    expect(calls.list).toHaveBeenCalledTimes(1)
  })
  test('account switch after create prevents race-recovery list and submit', async () => {
    const calls = api()
    calls.list.mockResolvedValue([])
    calls.create.mockImplementation(async () => {
      advanceSessionGeneration()
      throw new Error('late create')
    })
    await expect(saveGameResult(result, '', currentSessionGeneration(), () => true, calls)).rejects.toThrow(
      'Session changed',
    )
    expect(calls.list).toHaveBeenCalledTimes(1)
    expect(calls.submit).not.toHaveBeenCalled()
  })
  test('switch after successful create and unmount after list prevent submit', async () => {
    const calls = api()
    calls.list.mockResolvedValue([])
    calls.create.mockImplementation(async () => {
      advanceSessionGeneration()
      return template
    })
    await expect(saveGameResult(result, '', currentSessionGeneration(), () => true, calls)).rejects.toThrow(
      'Session changed',
    )
    expect(calls.submit).not.toHaveBeenCalled()
    const second = api()
    let mounted = true
    second.list.mockImplementation(async () => {
      mounted = false
      return [template]
    })
    await expect(
      saveGameResult(result, '', currentSessionGeneration(), () => mounted, second),
    ).rejects.toThrow('Session changed')
    expect(second.submit).not.toHaveBeenCalled()
  })
})

vi.mock('../../state/api/pharmacology', () => ({
  createQuestionnaire: vi.fn(),
  fetchQuestionnaires: vi.fn(),
  submitAssessment: vi.fn(),
  pharmacologyErrorMessage: (error: Error) => error.message,
}))

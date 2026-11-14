// @vitest-environment jsdom
import type * as ReactQuery from '@tanstack/react-query'

import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, expect, test, vi } from 'vitest'

import { FoghouseGames } from './index'
import { saveGameResult } from './save'
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactQuery>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('./save', () => ({ saveGameResult: vi.fn() }))
const container = document.createElement('div')
document.body.append(container)
afterEach(() => {
  act(() => render(null, container))
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})
const button = (label: string) =>
  [...container.querySelectorAll('button')].find(
    (node) => node.textContent === label || node.getAttribute('aria-label') === label,
  ) as HTMLButtonElement
function start() {
  act(() => render(<FoghouseGames />, container))
  act(() => button('Start test').click())
  const frame = container.querySelector('iframe')
  if (!frame) throw new Error('Expected active game frame')
  return frame
}
function finish(frame: HTMLIFrameElement) {
  const token = new URLSearchParams(new URL(frame.src).hash.slice(1)).get('token')
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: location.origin,
        source: frame.contentWindow,
        data: {
          type: 'complete',
          token,
          result: {
            game: 'memory',
            completed_at: '2026-11-12T10:00:00Z',
            input_mode: 'pointer',
            metrics: { span: 2, correct: 1, total: 4 },
            trials: [],
          },
        },
      }),
    )
  })
}
test.each(['memory', 'reaction'])('starts %s when randomUUID is unavailable', (game) => {
  vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
  act(() => render(<FoghouseGames />, container))
  if (game === 'reaction') {
    act(() => container.querySelectorAll<HTMLButtonElement>('.foghouse-game-tabs button')[1].click())
  }
  act(() => button('Start test').click())
  const frame = container.querySelector('iframe')
  if (!frame) throw new Error('Expected active game frame')
  const params = new URLSearchParams(new URL(frame.src).hash.slice(1))
  expect(params.get('game')).toBe(game)
  expect(params.get('token')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})
test('opt-in only, interruption removes isolated frame and cannot save late completion', () => {
  act(() => render(<FoghouseGames />, container))
  expect(container.querySelector('iframe')).toBeNull()
  act(() => button('Start test').click())
  const frame = container.querySelector('iframe')
  if (!frame) throw new Error('Expected active game frame')
  act(() => button('Cancel run').click())
  finish(frame)
  expect(container.querySelector('iframe')).toBeNull()
  expect(button('Save result')).toBeUndefined()
  expect(saveGameResult).not.toHaveBeenCalled()
})
test('explains a launch failure instead of leaving an unresponsive button', () => {
  vi.stubGlobal('crypto', {
    getRandomValues: () => {
      throw new Error('Unavailable')
    },
  })
  act(() => render(<FoghouseGames />, container))
  act(() => button('Start test').click())
  expect(container.querySelector('iframe')).toBeNull()
  expect(container.querySelector('[role="status"]')?.textContent).toContain('The game could not start')
  expect(saveGameResult).not.toHaveBeenCalled()
})
test('visibility interruption and unmount remove frame', () => {
  start()
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(container.querySelector('iframe')).toBeNull()
  hidden.mockRestore()
  act(() => button('Start test').click())
  act(() => render(null, container))
  expect(container.querySelector('iframe')).toBeNull()
})
test('only explicit save writes, duplicate clicks lock, retry retains result and success disables save', async () => {
  const frame = start()
  finish(frame)
  expect(saveGameResult).not.toHaveBeenCalled()
  let reject!: (reason: Error) => void
  vi.mocked(saveGameResult).mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail
      }),
  )
  act(() => {
    button('Save result').click()
    button('Save result')?.click()
  })
  expect(saveGameResult).toHaveBeenCalledTimes(1)
  await act(async () => {
    reject(new Error('offline'))
    await Promise.resolve()
  })
  expect(button('Save result')).toBeDefined()
  vi.mocked(saveGameResult).mockResolvedValueOnce({} as Awaited<ReturnType<typeof saveGameResult>>)
  await act(async () => button('Save result').click())
  expect(saveGameResult).toHaveBeenCalledTimes(2)
  expect(button('Saved ✓').disabled).toBe(true)
})

vi.mock('../../state/api/pharmacology', () => ({
  createQuestionnaire: vi.fn(),
  fetchQuestionnaires: vi.fn(),
  submitAssessment: vi.fn(),
  pharmacologyErrorMessage: (error: Error) => error.message,
}))

test('completion wins over focus changes while the iframe is being removed', () => {
  const frame = start()
  act(() => {
    finish(frame)
    window.dispatchEvent(new Event('blur'))
  })
  expect(button('Save result')).toBeDefined()
  expect(container.textContent).not.toContain('Run canceled')
})

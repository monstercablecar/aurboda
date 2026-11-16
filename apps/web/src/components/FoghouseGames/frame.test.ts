// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'

const messages = vi.fn()
async function launch(embedded = true, game = 'reaction') {
  vi.resetModules()
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'performance',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  })
  document.body.innerHTML = '<div id="clock"></div><main id="experiment"></main>'
  window.history.replaceState({}, '', `#game=${game}&mode=keyboard&token=test-run`)
  vi.spyOn(window, 'focus').mockImplementation(() => {})
  if (embedded) vi.stubGlobal('parent', { postMessage: messages })
  await import('./frame')
}
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  messages.mockClear()
  document.body.innerHTML = ''
  window.history.replaceState({}, '', '#')
})
test('actual jsPsych timeline completes at three minutes with omissions and boundary, without focus cancellation', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  await launch()
  await vi.advanceTimersByTimeAsync(3000)
  expect(document.querySelector('.go')).not.toBeNull()
  document
    .querySelector('#experiment')
    ?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }))
  await vi.advanceTimersByTimeAsync(177_100)
  const completion = messages.mock.calls.find(([message]) => message.type === 'complete')?.[0]
  expect(completion).toBeDefined()
  expect(completion.result.metrics.duration).toBe(180)
  expect(completion.result.metrics.valid).toBe(1)
  expect(completion.result.metrics.median).toBe(500)
  expect(completion.result.metrics.omissions).toBeGreaterThan(0)
  expect(completion.result.trials.at(-1).outcome).toBe('boundary')
  expect(completion.result.duration_ms).toBeGreaterThanOrEqual(180_000)
  window.dispatchEvent(new Event('blur'))
  expect(messages.mock.calls.map(([message]) => message.type)).toEqual(['complete'])
})
test('standalone frame navigation never starts a test', async () => {
  await launch(false)
  await vi.advanceTimersByTimeAsync(200_000)
  expect(document.body.textContent).toContain('Start this test from Home.')
  expect(messages).not.toHaveBeenCalled()
})

test('actual timeline interruption discards the entire run', async () => {
  await launch()
  await vi.advanceTimersByTimeAsync(3000)
  window.dispatchEvent(new Event('blur'))
  await vi.advanceTimersByTimeAsync(180_000)
  expect(messages.mock.calls.map(([message]) => message.type)).toEqual(['canceled'])
})

test('actual memory timeline completes after two failed scored rounds with zero span', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  // jsdom has no Web Animations implementation.
  const animate = vi.fn(() => ({ finished: Promise.resolve() }))
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate })
  try {
    await launch(true, 'memory')
    for (let round = 0; round < 3; round++) {
      await vi.advanceTimersByTimeAsync(4000)
      const blocks = [...document.querySelectorAll<HTMLElement>('.jspsych-corsi-block')]
      expect(blocks.length).toBe(9)
      expect(document.body.textContent).toContain('YOUR TURN')
      // The fixed sequence starts with block zero; block one fails immediately.
      blocks.find((block) => block.dataset.id === '1')!.click()
      await vi.advanceTimersByTimeAsync(1300)
    }
    const completion = messages.mock.calls.find(([message]) => message.type === 'complete')?.[0]
    expect(completion).toBeDefined()
    expect(completion.result.metrics).toEqual({ span: 0, correct: 0, total: 2 })
    expect(
      completion.result.trials.map((trial: { practice: boolean; correct: boolean }) => [
        trial.practice,
        trial.correct,
      ]),
    ).toEqual([
      [true, false],
      [false, false],
      [false, false],
    ])
  } finally {
    Reflect.deleteProperty(Element.prototype, 'animate')
  }
})

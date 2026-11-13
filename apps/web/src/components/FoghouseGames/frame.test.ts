// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'

const messages = vi.fn()
async function launch(embedded = true) {
  vi.resetModules()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] })
  document.body.innerHTML = '<div id="clock"></div><main id="experiment"></main>'
  window.history.replaceState({}, '', '#game=reaction&mode=keyboard&token=test-run')
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

// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
const streams = vi.hoisted(() => ({
  open: vi.fn(),
  close: vi.fn(),
  generation: 1,
  ping: undefined as undefined | (() => void),
}))
vi.mock('./api/feed', () => ({
  openTimelineStream: (ping: () => void) => {
    streams.open()
    streams.ping = ping
    return streams.close
  },
}))
vi.mock('./sessionBoundary', () => ({ currentSessionGeneration: () => streams.generation }))
import { subscribeLiveEvents } from './live-events'
afterEach(() => {
  vi.useRealTimers()
  streams.open.mockClear()
  streams.close.mockClear()
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})
test('bell and feed share one stream, hidden tabs close it, and retired sessions cannot update', () => {
  vi.useFakeTimers()
  const a = vi.fn(),
    b = vi.fn(),
    removeA = subscribeLiveEvents(a),
    removeB = subscribeLiveEvents(b)
  expect(streams.open).toHaveBeenCalledTimes(1)
  streams.ping!()
  expect(a).toHaveBeenCalledTimes(1)
  expect(b).toHaveBeenCalledTimes(1)
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
  expect(streams.close).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(120000)
  expect(a).toHaveBeenCalledTimes(1)
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
  expect(streams.open).toHaveBeenCalledTimes(2)
  streams.generation++
  streams.ping!()
  expect(a).toHaveBeenCalledTimes(1)
  expect(b).toHaveBeenCalledTimes(1)
  removeA()
  removeB()
  expect(streams.close).toHaveBeenCalledTimes(2)
})

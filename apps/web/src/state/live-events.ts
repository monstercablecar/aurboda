import { openTimelineStream } from './api/feed'
import { currentSessionGeneration } from './sessionBoundary'

const listeners = new Map<() => void, number>()
let close: (() => void) | undefined, timer: ReturnType<typeof setInterval> | undefined
let streamGeneration: number | undefined
const notify = () => {
  for (const listener of listeners.keys()) listener()
}
const reconcile = () => {
  if (close && streamGeneration !== currentSessionGeneration()) {
    close()
    close = undefined
  }
  const visible = typeof document === 'undefined' || document.visibilityState !== 'hidden'
  if (![...listeners.values()].includes(currentSessionGeneration()) || !visible) {
    close?.()
    close = undefined
    if (timer) clearInterval(timer)
    timer = undefined
    return
  }
  if (!timer) {
    timer = setInterval(() => {
      notify()
      reconcile()
    }, 60000)
  }
  if (!close) {
    const generation = currentSessionGeneration()
    streamGeneration = generation
    const shutdown = openTimelineStream(
      () => {
        if (generation === currentSessionGeneration()) notify()
      },
      () => {
        if (close === shutdown) close = undefined
      },
    )
    close = shutdown
  }
}
export const subscribeLiveEvents = (listener: () => void) => {
  const generation = currentSessionGeneration(),
    guarded = () => {
      if (generation === currentSessionGeneration()) listener()
    }
  listeners.set(guarded, generation)
  if (listeners.size === 1) document.addEventListener('visibilitychange', reconcile)
  reconcile()
  return () => {
    listeners.delete(guarded)
    reconcile()
    if (!listeners.size) document.removeEventListener('visibilitychange', reconcile)
  }
}

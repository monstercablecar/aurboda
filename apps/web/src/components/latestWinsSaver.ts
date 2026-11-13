export interface LatestWinsSaver<T> {
  submit: (value: T) => void
  isBusy: () => boolean
}

/**
 * Saves whole values one at a time: a value submitted while a save is in flight waits, replacing any value
 * already waiting, since only the latest one matters. `onIdle` gets the last save's result once nothing is
 * left to save; a failed save drops what waits and reports through `onError`.
 */
export const createLatestWinsSaver = <T, R>(
  save: (value: T) => Promise<R>,
  handlers: { onIdle: (last: R) => void; onError: (error: unknown) => void },
  isActive: () => boolean = () => true,
): LatestWinsSaver<T> => {
  let busy = false
  let queued: { value: T } | null = null

  const canContinue = () => {
    if (isActive()) return true
    queued = null
    busy = false
    return false
  }

  const run = (value: T) => {
    if (!canContinue()) return
    busy = true
    new Promise<R>((resolve) => resolve(save(value))).then(
      (result) => {
        if (!canContinue()) return
        if (queued) {
          const next = queued.value
          queued = null
          run(next)
          return
        }
        busy = false
        handlers.onIdle(result)
      },
      (error: unknown) => {
        if (!canContinue()) return
        queued = null
        busy = false
        handlers.onError(error)
      },
    )
  }

  return {
    isBusy: () => busy,
    submit: (value) => {
      if (!canContinue()) return
      if (busy) queued = { value }
      else run(value)
    },
  }
}

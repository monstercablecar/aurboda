import { signal } from '@preact/signals'
import { focusManager, QueryClient } from '@tanstack/react-query'
import { CanceledError } from 'axios'

import { advanceSessionGeneration } from './sessionBoundary'

// TanStack Query's default focusManager only listens to `visibilitychange`,
// which fires when switching browser tabs but NOT when alt-tabbing between
// applications (e.g. terminal ↔ browser on Linux). Add a `focus` listener
// so stale queries also refetch when the browser window regains OS-level focus.
focusManager.setEventListener((handleFocus) => {
  const onVisibilityChange = () => handleFocus()
  const onFocus = () => handleFocus()

  window.addEventListener('visibilitychange', onVisibilityChange, false)
  window.addEventListener('focus', onFocus, false)

  return () => {
    window.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('focus', onFocus)
  }
})

export function createSessionQueryClient() {
  let active = true
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: true,
        retry: 2,
        staleTime: 5 * 60 * 1000,
      },
    },
  })
  const observers = new Set<{ reset: () => void }>()
  const unsubscribe = client.getMutationCache().subscribe((event) => {
    if (event.type === 'observerAdded') observers.add(event.observer)
    if (event.type === 'observerRemoved') observers.delete(event.observer)
  })
  const defaultMutationOptions = client.defaultMutationOptions.bind(client)
  const wrapped = new WeakSet<object>()
  client.defaultMutationOptions = (options) => {
    const defaults = defaultMutationOptions(options)
    if (wrapped.has(defaults)) return defaults
    const guarded = {
      ...defaults,
      mutationFn: defaults.mutationFn
        ? async (...args: Parameters<NonNullable<typeof defaults.mutationFn>>) => {
            if (!active) throw new CanceledError('Session changed')
            const result = await defaults.mutationFn?.(...args)
            if (!active) throw new CanceledError('Session changed')
            return result
          }
        : undefined,
      onMutate: (...args: Parameters<NonNullable<typeof defaults.onMutate>>) =>
        active ? defaults.onMutate?.(...args) : undefined,
      onSuccess: (...args: Parameters<NonNullable<typeof defaults.onSuccess>>) =>
        active ? defaults.onSuccess?.(...args) : undefined,
      onError: (...args: Parameters<NonNullable<typeof defaults.onError>>) =>
        active ? defaults.onError?.(...args) : undefined,
      onSettled: (...args: Parameters<NonNullable<typeof defaults.onSettled>>) =>
        active ? defaults.onSettled?.(...args) : undefined,
    }
    wrapped.add(guarded)
    return guarded as typeof defaults
  }
  return {
    client,
    retire: () => {
      active = false
      for (const observer of observers) observer.reset()
      observers.clear()
      unsubscribe()
      void client.cancelQueries()
      client.clear()
    },
  }
}

let session = createSessionQueryClient()
export let queryClient = session.client
export const querySession = signal({ client: queryClient, generation: 0 })
export function resetQuerySession() {
  const generation = advanceSessionGeneration()
  session.retire()
  session = createSessionQueryClient()
  queryClient = session.client
  querySession.value = { client: queryClient, generation }
}

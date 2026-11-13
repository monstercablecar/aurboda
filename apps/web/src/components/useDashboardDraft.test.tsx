// @vitest-environment jsdom
import type { DashboardConfig } from '@aurboda/api-spec'

import { render } from 'preact'
import { act } from 'preact/test-utils'
import { expect, test, vi } from 'vitest'

import { advanceSessionGeneration } from '../state/sessionBoundary'
import { type DashboardDraft, useDashboardDraft } from './useDashboardDraft'

test.each(['resolve', 'reject'] as const)(
  'an old session cannot dispatch queued dashboard saves or callbacks after %s',
  async (outcome) => {
    const container = document.createElement('div')
    let draft!: DashboardDraft
    let resolve!: (value: string) => void
    let reject!: (error: unknown) => void
    const pending = new Promise<string>((done, fail) => {
      resolve = done
      reject = fail
    })
    let user = 'alice'
    const dispatched: string[] = []
    const save = vi.fn(() => {
      dispatched.push(user)
      return pending
    })
    const handlers = { onError: vi.fn(), onSaved: vi.fn() }
    function Editor() {
      draft = useDashboardDraft('home', save, handlers)
      return null
    }
    const config: DashboardConfig = { sections: [], version: 1 }
    act(() => render(<Editor />, container))
    act(() => {
      draft.submit(config)
      draft.submit({ ...config, sections: [] })
    })
    expect(dispatched).toEqual(['alice'])

    user = 'bob'
    advanceSessionGeneration()
    await act(async () => {
      if (outcome === 'resolve') resolve('old result')
      else reject(new Error('Session changed'))
      await Promise.resolve()
    })
    act(() => draft.submit(config))
    expect(dispatched).toEqual(['alice'])
    expect(handlers.onSaved).not.toHaveBeenCalled()
    expect(handlers.onError).not.toHaveBeenCalled()
    act(() => render(null, container))
  },
)

test('an asynchronous saved callback cannot report an error into a new session', async () => {
  const container = document.createElement('div')
  let draft!: DashboardDraft
  let reject!: (error: unknown) => void
  const onSaved = vi.fn(
    () =>
      new Promise<void>((_resolve, fail) => {
        reject = fail
      }),
  )
  const onError = vi.fn()
  function Editor() {
    draft = useDashboardDraft('home', async () => 'saved', { onError, onSaved })
    return null
  }
  act(() => render(<Editor />, container))
  await act(async () => {
    draft.submit({ sections: [], version: 1 })
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  expect(onSaved).toHaveBeenCalledTimes(1)
  advanceSessionGeneration()
  await act(async () => reject(new Error('late cache update failure')))
  expect(onError).not.toHaveBeenCalled()
  act(() => render(null, container))
})

// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { advanceSessionGeneration } from '../state/sessionBoundary'
import { DataExportSettings } from './DataExportSettings'

const requestExportDumpLink = vi.hoisted(() => vi.fn())
vi.mock('../state/api', () => ({
  requestExportDumpLink,
  apiErrorMessage: (error: Error) => error.message,
}))

let container: HTMLDivElement
beforeEach(() => {
  vi.clearAllMocks()
  window.location.hash = ''
  container = document.createElement('div')
  document.body.append(container)
  act(() => render(<DataExportSettings />, container))
})
afterEach(() => {
  act(() => render(null, container))
  container.remove()
})
const button = () => {
  const element = container.querySelector('button')
  if (!element) throw new Error('Missing export button')
  return element
}
const deferred = () => {
  let resolve!: (value: { url: string }) => void
  let reject!: (error: Error) => void
  const promise = new Promise<{ url: string }>((yes, no) => {
    resolve = yes
    reject = no
  })
  requestExportDumpLink.mockReturnValueOnce(promise)
  return { resolve, reject }
}

test('requests once while pending and navigates to the returned download URL', async () => {
  const pending = deferred()
  act(() => {
    button().click()
    button().click()
  })
  expect(requestExportDumpLink).toHaveBeenCalledTimes(1)
  expect(button().disabled).toBe(true)
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Preparing')
  // A same-document URL lets jsdom observe actual location navigation.
  const url = `${window.location.href}#export-download`
  await act(async () => pending.resolve({ url }))
  expect(window.location.href).toBe(url)
  expect(button().disabled).toBe(false)
})

test('shows a failure and allows a fresh retry', async () => {
  const pending = deferred()
  act(() => button().click())
  await act(async () => pending.reject(new Error('Export is temporarily unavailable')))
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('Export is temporarily unavailable')
  expect(button().disabled).toBe(false)
  const retry = deferred()
  act(() => button().click())
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(requestExportDumpLink).toHaveBeenCalledTimes(2)
  await act(async () => retry.resolve({ url: '#retry-download' }))
  expect(window.location.hash).toBe('#retry-download')
})

test('does not navigate after leaving the export settings', async () => {
  const pending = deferred()
  act(() => button().click())
  act(() => render(null, container))
  await act(async () => pending.resolve({ url: '#stale-download' }))
  expect(window.location.hash).toBe('')
})

test('does not navigate when the session changes before a delayed result', async () => {
  const pending = deferred()
  act(() => button().click())
  advanceSessionGeneration()
  await act(async () => pending.resolve({ url: '#previous-account' }))
  expect(window.location.hash).toBe('')
})

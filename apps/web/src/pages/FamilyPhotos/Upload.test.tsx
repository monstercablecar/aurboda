// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { uploadFamily } from '../../state/api/family-photos'
import { currentSessionGeneration } from '../../state/sessionBoundary'
import { FamilyUpload } from './Upload'
vi.mock('../../state/api/family-photos', () => ({
  uploadFamily: vi.fn(),
  familyError: () => 'Please try again',
}))
vi.mock('../../state/sessionBoundary', () => ({ currentSessionGeneration: vi.fn(() => 0) }))
let container: HTMLDivElement
const uploaded = vi.fn()
const busy = vi.fn()
const button = () => container.querySelector('.family-upload-footer button') as HTMLButtonElement
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(currentSessionGeneration).mockReturnValue(0)
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() }),
  )
  container = document.createElement('div')
  document.body.append(container)
  act(() =>
    render(
      <FamilyUpload maxBytes={1024} onUploaded={uploaded} onBusyChange={busy} onDone={() => undefined} />,
      container,
    ),
  )
})
afterEach(() => {
  act(() => render(null, container))
  container.remove()
  vi.unstubAllGlobals()
})
function choose() {
  const input = container.querySelector('input[type=file]') as HTMLInputElement
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [
      new File(['one'], 'one.jpg', { type: 'image/jpeg' }),
      new File(['two'], 'two.jpg', { type: 'image/jpeg' }),
    ],
  })
  act(() => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
test('retains failed files and their own captions, retrying only failures', async () => {
  choose()
  const caption = container.querySelector('input[placeholder]') as HTMLInputElement
  act(() => {
    caption.value = 'Our afternoon'
    caption.dispatchEvent(new Event('input', { bubbles: true }))
  })
  vi.mocked(uploadFamily)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ id: 'two' } as never)
    .mockResolvedValueOnce({ id: 'one' } as never)
  await act(async () => {
    button().click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  expect(container.textContent).toContain('Please try again')
  expect(container.querySelectorAll('.family-upload-row')).toHaveLength(2)
  await act(async () => {
    button().click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  expect(uploadFamily).toHaveBeenCalledTimes(3)
  expect(vi.mocked(uploadFamily).mock.calls[2]?.[1]).toBe('Our afternoon')
  expect(button().textContent).toBe('Back to the album')
  act(() => render(null, container))
  expect(URL.revokeObjectURL).toHaveBeenCalled()
})
test('account change stops remaining uploads and stale completion callbacks', async () => {
  choose()
  let resolve: () => void = () => undefined
  vi.mocked(uploadFamily).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = () => done({ id: 'one' } as never)
      }),
  )
  act(() => button().click())
  vi.mocked(currentSessionGeneration).mockReturnValue(1)
  await act(async () => {
    resolve()
    await new Promise((done) => setTimeout(done, 0))
  })
  expect(uploadFamily).toHaveBeenCalledTimes(1)
  expect(uploaded).not.toHaveBeenCalled()
})
test('leaving the page stops the remaining queue and releases local previews', async () => {
  choose()
  let resolve: () => void = () => undefined
  vi.mocked(uploadFamily).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = () => done({ id: 'one' } as never)
      }),
  )
  act(() => button().click())
  act(() => render(null, container))
  await act(async () => {
    resolve()
    await new Promise((done) => setTimeout(done, 0))
  })
  expect(uploadFamily).toHaveBeenCalledTimes(1)
  expect(uploaded).not.toHaveBeenCalled()
  expect(URL.revokeObjectURL).toHaveBeenCalled()
})

test('a removed destination keeps staged files and offers an explicit unfiled recovery', async () => {
  act(() => render(null, container))
  act(() =>
    render(
      <FamilyUpload
        maxBytes={1024}
        folders={[{ id: 'folder', name: 'Summer', count: 0 }]}
        folderId="folder"
        onUploaded={uploaded}
        onBusyChange={busy}
        onDone={() => undefined}
      />,
      container,
    ),
  )
  choose()
  act(() =>
    render(
      <FamilyUpload
        maxBytes={1024}
        folders={[]}
        folderId="folder"
        onUploaded={uploaded}
        onBusyChange={busy}
        onDone={() => undefined}
      />,
      container,
    ),
  )
  expect(container.textContent).toContain('This folder was removed')
  expect(button().disabled).toBe(true)
  expect(container.querySelectorAll('.family-upload-row')).toHaveLength(2)
  const folder = container.querySelector('select') as HTMLSelectElement
  act(() => {
    folder.value = ''
    folder.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(button().disabled).toBe(false)
  vi.mocked(uploadFamily).mockResolvedValue({ id: 'recovered' } as never)
  await act(async () => {
    button().click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  expect(uploadFamily).toHaveBeenCalledTimes(2)
  expect(vi.mocked(uploadFamily).mock.calls.every((call) => call[3] === undefined)).toBe(true)
})

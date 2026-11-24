// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { isEmbedded } from '../../embed'
import * as api from '../../state/api/family-photos'
import { FamilyPhotos } from './index'
vi.mock('../../embed', () => ({ isEmbedded: vi.fn(() => false) }))
vi.mock('../../state/api/family-photos', () => ({
  useFamilyAccess: vi.fn(),
  fetchFamily: vi.fn(),
  refreshFamilySession: vi.fn(),
  editFamily: vi.fn(),
  trashFamily: vi.fn(),
  restoreFamily: vi.fn(),
  retryFamily: vi.fn(),
  uploadFamily: vi.fn(),
  downloadFamilyOriginal: vi.fn(),
  familyMediaUrl: (id: string, variant: string) => `/api/family-photos/media/${id}/${variant}`,
  familyError: () => 'Request failed',
}))
const button = (name: string) => {
  const found = Array.from(container.querySelectorAll('button')).find(
    (element) => element.getAttribute('aria-label') === name || element.textContent?.trim() === name,
  )
  if (!found) throw new Error(`Missing button: ${name}`)
  return found
}
let container: HTMLDivElement
let query: QueryClient
const access = (is_admin = false, allowed = true) =>
  vi.mocked(api.useFamilyAccess).mockReturnValue({
    data: { enabled: true, allowed, is_admin, originals_enabled: false, max_upload_bytes: 1024 * 1024 },
    isLoading: false,
  } as ReturnType<typeof api.useFamilyAccess>)
const mount = async () => {
  await act(async () => {
    render(
      <QueryClientProvider client={query}>
        <FamilyPhotos />
      </QueryClientProvider>,
      container,
    )
    await new Promise((resolve) => setTimeout(resolve, 25))
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isEmbedded).mockReturnValue(false)
  container = document.createElement('div')
  document.body.append(container)
  query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  vi.mocked(api.refreshFamilySession).mockResolvedValue(undefined)
  vi.mocked(api.fetchFamily).mockResolvedValue({
    success: true,
    next_cursor: null,
    items: [
      {
        id: 'photo',
        kind: 'photo',
        caption: 'A memory',
        original_filename: 'phone.jpg',
        original_bytes: 100,
        created_at: '2026-01-02T12:00:00Z',
        captured_at: null,
        deleted_at: null,
        status: 'ready',
        album_id: null,
      },
    ],
  })
})
afterEach(() => {
  render(null, container)
  container.remove()
  query.clear()
})
test('regular accounts never request library metadata or mount media', async () => {
  access(false, false)
  await mount()
  expect(api.fetchFamily).not.toHaveBeenCalled()
  expect(container.querySelector('img')).toBeNull()
  expect(container.querySelector('input[type=file]')).toBeNull()
})
test('family members get lazy gallery/download/fullscreen and no administrator controls', async () => {
  access()
  await mount()
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25))
  })
  expect(container.querySelector('img')?.getAttribute('loading')).toBe('lazy')
  expect(container.textContent).toContain('Marcroft Family')
  expect(container.querySelector('[aria-label=Download]')).toBeNull()
  expect(container.textContent).not.toContain('Download original')
  expect(container.textContent).not.toContain('Edit caption')
  act(() => (container.querySelector('.family-open') as HTMLButtonElement).click())
  expect(container.querySelector('dialog')).not.toBeNull()
  act(() => button('Photo details').click())
  expect(container.textContent).not.toContain('Download original')
  expect(container.textContent).not.toContain('Move to trash')
  expect(container.querySelector('textarea')).toBeNull()
})
test('administrators get upload, caption editing, original download and trash controls', async () => {
  access(true)
  await mount()
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25))
  })
  expect(container.querySelector('input[type=file]')).toBeNull()
  act(() => button('Add photos & videos').click())
  expect(container.querySelector('input[type=file]')?.hasAttribute('multiple')).toBe(true)
  act(() => button('Close upload').click())
  act(() => button('A memory').click())
  act(() => button('Photo details').click())
  expect(container.textContent).toContain('Download original')
  expect(container.textContent).toContain('Move to trash')
})
test('family filters are sent to the private gallery endpoint', async () => {
  access()
  await mount()
  await act(async () => {
    button('Videos').click()
    await new Promise((resolve) => setTimeout(resolve, 25))
  })
  expect(api.fetchFamily).toHaveBeenCalledWith(expect.objectContaining({ kind: 'video' }))
})

test('embedded users see a usable browser handoff instead of unsupported authenticated download links', async () => {
  access(true)
  vi.mocked(isEmbedded).mockReturnValue(true)
  await mount()
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25))
  })
  expect(container.textContent).toContain('Downloads are available in your browser')
  const link = container.querySelector('input[readonly]') as HTMLInputElement
  expect(link.value).toMatch(/\/family-photos$/)
  expect(link.value).not.toMatch(/token|embed/)
  act(() => button('A memory').click())
  act(() => button('Photo details').click())
  expect(container.querySelector('a[download]')).toBeNull()
  expect(container.textContent).not.toContain('Download original')
})

test('viewer navigates memories, zooms, and edits captions inline without hijacking text arrows', async () => {
  access(true)
  const response = await api.fetchFamily({})
  vi.mocked(api.fetchFamily).mockResolvedValue({
    ...response,
    items: [...response.items, { ...response.items[0]!, id: 'second', caption: 'Another memory' }],
  })
  await mount()
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25))
  })
  act(() => button('A memory').click())
  act(() => button('Next photo').click())
  expect(container.querySelector('.family-viewer-caption')?.textContent).toBe('Another memory')
  act(() => button('Zoom in').click())
  expect(container.querySelector('.is-zoomed')).not.toBeNull()
  act(() => button('Photo details').click())
  const caption = container.querySelector('textarea')!
  act(() => {
    caption.value = 'A lovely afternoon'
    caption.dispatchEvent(new Event('input', { bubbles: true }))
    caption.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
  })
  expect(container.querySelector('.family-viewer-caption')?.textContent).toBe('Another memory')
  await act(async () => {
    button('Save caption').click()
    await Promise.resolve()
  })
  expect(api.editFamily).toHaveBeenCalledWith('second', { caption: 'A lovely afternoon' })
  act(() => {
    container
      .querySelector('dialog')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
  })
  expect(container.querySelector('.family-viewer-caption')?.textContent).toBe('A memory')
})

test('library failures do not invite adding the first photos', async () => {
  access(true)
  vi.mocked(api.fetchFamily).mockRejectedValue(new Error('offline'))
  await mount()
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25))
  })
  expect(container.querySelector('[role=alert]')?.textContent).toBe('Request failed')
  expect(container.textContent).not.toContain('The beginning of our album')
})
test('horizontal video control gestures do not advance the viewer', async () => {
  access()
  const response = await api.fetchFamily({})
  vi.mocked(api.fetchFamily).mockResolvedValue({
    ...response,
    items: [
      { ...response.items[0]!, kind: 'video', caption: 'Our video' },
      { ...response.items[0]!, id: 'second' },
    ],
  })
  await mount()
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25))
  })
  act(() => button('Our video').click())
  const video = container.querySelector('video')!
  const start = new Event('touchstart', { bubbles: true })
  Object.defineProperty(start, 'touches', { value: [{ clientX: 200, clientY: 100 }] })
  const end = new Event('touchend', { bubbles: true })
  Object.defineProperty(end, 'changedTouches', { value: [{ clientX: 50, clientY: 100 }] })
  act(() => {
    video.dispatchEvent(start)
    video.dispatchEvent(end)
  })
  expect(container.querySelector('.family-viewer-caption')?.textContent).toBe('Our video')
})

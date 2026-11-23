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
  expect(container.textContent).toContain('Download')
  expect(container.textContent).not.toContain('Download original')
  expect(container.textContent).not.toContain('Edit caption')
  act(() => (container.querySelector('.family-open') as HTMLButtonElement).click())
  expect(container.querySelector('dialog')).not.toBeNull()
})
test('administrators get upload, caption editing, original download and trash controls', async () => {
  access(true)
  await mount()
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25))
  })
  expect(container.querySelector('input[type=file]')?.hasAttribute('multiple')).toBe(true)
  expect(container.textContent).toContain('Upload Photo / Video')
  expect(container.textContent).toContain('Download original')
  expect(container.textContent).toContain('Move to trash')
})
test('family filters are sent to the private gallery endpoint', async () => {
  access()
  await mount()
  await act(async () => {
    const select = container.querySelector('select')!
    select.value = 'video'
    select.dispatchEvent(new Event('change', { bubbles: true }))
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
  expect(container.querySelector('a[download]')).toBeNull()
})

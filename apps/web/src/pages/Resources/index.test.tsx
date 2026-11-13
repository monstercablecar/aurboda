// @vitest-environment jsdom
import type { ResourceFolder, ResourceItem } from '@aurboda/api-spec'

import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import * as api from '../../state/api/resources'
import { Resources, folderTrail, safeResourceLink } from './index'
vi.mock('../../state/api/resources', () => ({
  fetchResources: vi.fn(),
  createResourceFolder: vi.fn(),
  updateResourceFolder: vi.fn(),
  createResourceLink: vi.fn(),
  updateResource: vi.fn(),
  deleteResource: vi.fn(),
  uploadResource: vi.fn(),
  prepareResourceMedia: vi.fn(),
  refreshResourceSession: vi.fn(),
  resourceContentUrl: (id: string, download: boolean) =>
    `/resources/items/${id}/content${download ? '?download=1' : ''}`,
  resourceError: (e: Error) => e.message,
}))
const folder: ResourceFolder = {
  id: 'folder',
  title: 'Guides',
  parent_id: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
}
const item: ResourceItem = {
  id: 'pdf',
  title: 'Welcome guide',
  description: 'Getting started',
  parent_id: null,
  kind: 'pdf',
  original_filename: 'welcome.pdf',
  external_url: null,
  mime_type: 'application/pdf',
  file_size: 1024,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  created_by: 'admin',
}
let container: HTMLDivElement
beforeEach(() => {
  vi.clearAllMocks()
  container = document.createElement('div')
  document.body.append(container)
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  vi.mocked(api.fetchResources).mockResolvedValue({
    success: true,
    folders: [folder],
    resources: [
      item,
      { ...item, id: 'link', kind: 'link', title: 'Helpful website', external_url: 'https://example.com' },
    ],
    can_manage: false,
  })
  vi.mocked(api.prepareResourceMedia).mockResolvedValue(undefined)
})
afterEach(() => {
  act(() => render(null, container))
  container.remove()
})
const mount = async () => {
  await act(async () => {
    render(<Resources />, container)
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}
const click = async (text: string) => {
  const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === text)
  expect(button).toBeTruthy()
  await act(async () => {
    button?.click()
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}
test('read-only library separates links from file previews and hides mutations', async () => {
  await mount()
  expect(container.textContent).toContain('Welcome guide')
  expect(container.textContent).not.toContain('Upload files')
  expect(container.querySelector('a[href="https://example.com/"]')?.textContent).toBe('Open link ↗')
  expect(container.querySelector('[aria-label="Edit Welcome guide"]')).toBeNull()
  await click('View & download')
  expect(api.prepareResourceMedia).toHaveBeenCalledWith('pdf')
  expect(container.querySelector('iframe')?.getAttribute('src')).toBe('/resources/items/pdf/content')
  expect(container.querySelector('.resource-download')?.getAttribute('href')).toContain('download=1')
})
test('search spans all folders and descriptions, type filtering keeps only matching files', async () => {
  vi.mocked(api.fetchResources).mockResolvedValue({
    success: true,
    folders: [folder],
    resources: [{ ...item, parent_id: folder.id }],
    can_manage: false,
  })
  await mount()
  expect(container.textContent).not.toContain('Welcome guide')
  const search = container.querySelector('input[type="search"]') as HTMLInputElement
  await act(async () => {
    search.value = 'getting'
    search.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(container.textContent).toContain('Welcome guide')
  await act(async () => {
    const filter = container.querySelector('[aria-label="Resource type"]') as HTMLSelectElement
    filter.value = 'video'
    filter.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(container.textContent).toContain('Nothing matches yet')
  expect(container.textContent).not.toContain('Welcome guide')
})
test('folder navigation and breadcrumb return to library', async () => {
  await mount()
  await act(async () => {
    ;(container.querySelector('.resource-card-open') as HTMLButtonElement).click()
  })
  expect(container.textContent).not.toContain('Welcome guide')
  await click('Library')
  expect(container.textContent).toContain('Welcome guide')
})
test('admin creates folder through labeled dialog and gets visible mutation error', async () => {
  vi.mocked(api.fetchResources).mockResolvedValue({
    success: true,
    folders: [folder],
    resources: [item],
    can_manage: true,
  })
  vi.mocked(api.createResourceFolder).mockRejectedValue(new Error('Permission changed.'))
  await mount()
  await click('＋ Folder')
  expect(container.querySelector('dialog')?.getAttribute('aria-label')).toBe('New folder')
  await act(async () => {
    const input = container.querySelector('dialog input') as HTMLInputElement
    input.value = 'New guides'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => {
    container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  expect(api.createResourceFolder).toHaveBeenCalledWith({ title: 'New guides', parent_id: null })
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Permission changed.')
})
test('admin multi upload is sequential and retains per-file errors', async () => {
  vi.mocked(api.fetchResources).mockResolvedValue({
    success: true,
    folders: [],
    resources: [],
    can_manage: true,
  })
  vi.mocked(api.uploadResource).mockRejectedValueOnce(new Error('Too large')).mockResolvedValueOnce(undefined)
  await mount()
  await act(async () => {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [new File(['a'], 'a.pdf'), new File(['b'], 'b.pdf')] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  expect(api.uploadResource).toHaveBeenCalledTimes(2)
  expect(container.textContent).toContain('a.pdf: Too large')
  expect(container.textContent).toContain('1 of 2 files uploaded.')
})
test('preview failures show retry and download fallback', async () => {
  vi.mocked(api.prepareResourceMedia).mockRejectedValue(new Error('File unavailable'))
  await mount()
  await click('View & download')
  expect(container.textContent).toContain('File unavailable')
  expect(container.querySelector('iframe')).toBeNull()
  expect(container.querySelector('.resource-download')).toBeTruthy()
})
test('safe links reject active schemes and folder trail tolerates invalid cycles', () => {
  expect(safeResourceLink('javascript:alert(1)')).toBeUndefined()
  expect(safeResourceLink('https://example.com')).toBe('https://example.com/')
  expect(folderTrail([{ ...folder, parent_id: folder.id }], folder.id)).toEqual([
    { ...folder, parent_id: folder.id },
  ])
})

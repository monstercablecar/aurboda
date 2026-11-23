// @vitest-environment jsdom
import { expect, test, vi } from 'vitest'

import { journalImageIds, privateJournalHtml } from './PrivatePreview'
vi.mock('../../state/api/journal', () => ({ journalApi: { attachmentBlob: vi.fn() } }))
const id = '00000000-0000-4000-8000-000000000001'
test('only explicitly referenced authenticated images can render, with no HTML or external media execution', () => {
  const html = privateJournalHtml(
    `![Private](journal-attachment:${id}) ![tracker](https://example.org/pixel) <img src="https://example.org/hidden" onerror="alert(1)"><form><input></form><script>alert(1)</script>`,
    new Map([[id, 'blob:synthetic-private-image']]),
  )
  expect(html).toContain('blob:synthetic-private-image')
  expect(html).not.toContain('example.org')
  expect(html).not.toContain('onerror')
  expect(html).not.toContain('<script')
  expect(html).not.toContain('<input')
  expect(privateJournalHtml(`![Missing](journal-attachment:${id})`, new Map())).not.toContain('<img')
  expect(journalImageIds(`journal-attachment:${id} journal-attachment:${id}`)).toEqual([id])
})

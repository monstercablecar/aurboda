// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, expect, test, vi } from 'vitest'

vi.mock('../../state/api/journal', () => ({ journalApi: { attachmentBlob: vi.fn() } }))
import { journalApi } from '../../state/api/journal'
import { AttachmentView, AudioRecorder, validJournalFile } from './Audio'

const container = document.createElement('div')
afterEach(() => {
  act(() => render(null, container))
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('rejects unsafe, empty, and oversized uploads', () => {
  expect(validJournalFile(new File(['x'], 'x.svg', { type: 'image/svg+xml' }))).toBe(false)
  expect(validJournalFile(new File([], 'x.mp3', { type: 'audio/mpeg' }))).toBe(false)
  expect(validJournalFile(new File(['x'], 'x.webm', { type: 'audio/webm;codecs=opus' }))).toBe(true)
  expect(
    validJournalFile(new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'x.png', { type: 'image/png' })),
  ).toBe(false)
})

test('offers upload fallback when recording is unavailable', async () => {
  vi.stubGlobal('isSecureContext', false)
  act(() => render(<AudioRecorder onSave={vi.fn()} />, container))
  await act(async () => container.querySelector('button')?.click())
  expect(container.textContent).toContain('secure HTTPS connection')
  expect(container.querySelector('input[type=file]')).not.toBeNull()
})

test('stops microphone obtained after the recorder unmounts', async () => {
  vi.stubGlobal('isSecureContext', true)
  const stop = vi.fn()
  let resolve!: (stream: MediaStream) => void
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: () =>
        new Promise<MediaStream>((done) => {
          resolve = done
        }),
    },
  })
  vi.stubGlobal('MediaRecorder', class {})
  act(() => render(<AudioRecorder onSave={vi.fn()} />, container))
  act(() => container.querySelector('button')?.click())
  act(() => render(null, container))
  await act(async () => resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream))
  expect(stop).toHaveBeenCalledOnce()
})

test('revokes authenticated attachment preview URLs on unmount', async () => {
  const create = vi.fn(() => 'blob:test')
  const revoke = vi.fn()
  URL.createObjectURL = create
  URL.revokeObjectURL = revoke
  vi.mocked(journalApi.attachmentBlob).mockResolvedValue(new Blob(['sound']))
  await act(async () =>
    render(
      <AttachmentView
        attachment={{
          id: 'a',
          entry_id: 'e',
          filename: 'voice.webm',
          mime_type: 'audio/webm',
          size: 5,
          prompt_id: null,
          created_at: new Date().toISOString(),
        }}
        onDelete={vi.fn()}
      />,
      container,
    ),
  )
  await act(async () => {
    await Promise.resolve()
  })
  expect(container.querySelector('audio')?.src).toBe('blob:test')
  act(() => render(null, container))
  expect(revoke).toHaveBeenCalledWith('blob:test')
})

test('failed upload retains a downloadable file for retry', async () => {
  URL.createObjectURL = vi.fn(() => 'blob:recovery')
  URL.revokeObjectURL = vi.fn()
  const save = vi.fn().mockRejectedValue(new Error('offline'))
  act(() => render(<AudioRecorder onSave={save} promptId="reflection" />, container))
  const input = container.querySelector('input')
  if (!input) throw new Error('Missing upload input')
  const file = new File(['sound'], 'voice.webm', { type: 'audio/webm' })
  Object.defineProperty(input, 'files', { value: [file] })
  act(() => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await act(async () => {
    await Promise.resolve()
  })
  await act(async () =>
    Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'Save attachment')
      ?.click(),
  )
  expect(save).toHaveBeenCalledWith(file, 'reflection')
  expect(container.textContent).toContain('Your file is still here')
  expect(container.querySelector('a[download]')?.getAttribute('href')).toBe('blob:recovery')
})

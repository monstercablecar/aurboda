// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from 'preact'
import { useState } from 'preact/hooks'
import { act } from 'preact/test-utils'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'

import { ImportCelebrationProvider } from '../../components/ImportCelebrationProvider'
import { FitUpload } from './index'
const upload = vi.hoisted(() => vi.fn())
vi.mock('../../state/api', () => ({ uploadFitFile: upload }))
vi.mock('../../components/ActivityTypePicker', () => ({ ActivityTypePicker: () => null }))
vi.mock('../../components/MetricPicker', () => ({ MetricPicker: () => null }))
let root: HTMLDivElement
let client: QueryClient
beforeEach(() => {
  upload.mockReset()
  root = document.createElement('div')
  document.body.append(root)
  client = new QueryClient()
})
afterEach(() => {
  act(() => render(null, root))
  root.remove()
  client.clear()
})
function Flow() {
  const [away, setAway] = useState(false)
  return away ? (
    <p>Activity details</p>
  ) : (
    <FitUpload
      onCreated={() => {
        setAway(true)
        return true
      }}
    />
  )
}
const mount = (generation = 1) =>
  act(() =>
    render(
      <QueryClientProvider client={client}>
        <ImportCelebrationProvider key={generation}>
          <Flow />
        </ImportCelebrationProvider>
      </QueryClientProvider>,
      root,
    ),
  )
async function files(count = 1) {
  await act(async () => {
    const input = root.querySelector('input')!
    Object.defineProperty(input, 'files', {
      value: Array.from({ length: count }, () => ({ name: 'sample.fit' })),
    })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}
test('confirmed single import survives navigation, and session remount clears it', async () => {
  upload.mockResolvedValue({ success: true, data: { id: 'saved' } })
  mount()
  await files()
  expect(root.textContent).toContain('Activity details')
  expect(root.querySelector('.celebration-import')).not.toBeNull()
  mount(2)
  expect(root.querySelector('.celebration-import')).toBeNull()
})
test('confirmed batch celebrates once', async () => {
  upload.mockResolvedValue({ success: true, data: { id: 'saved' } })
  mount()
  await files(2)
  expect(root.querySelectorAll('.celebration-import')).toHaveLength(1)
  expect(root.textContent).toContain('Imported 2 files')
})
test.each([{ success: false, data: { id: 'x' } }, { success: true, data: [] }, null])(
  'failed or empty confirmation does not celebrate',
  async (result) => {
    if (result) upload.mockResolvedValue(result)
    else upload.mockRejectedValue(new Error('Failed'))
    mount()
    await files()
    expect(root.querySelector('.celebration-import')).toBeNull()
  },
)
test('partial batch does not celebrate', async () => {
  upload
    .mockResolvedValueOnce({ success: true, data: { id: 'saved' } })
    .mockRejectedValueOnce(new Error('Failed'))
  mount()
  await files(2)
  expect(root.querySelector('.celebration-import')).toBeNull()
})

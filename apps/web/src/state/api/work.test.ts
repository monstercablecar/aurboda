import type { WorkDayBody } from '@aurboda/api-spec'
// @vitest-environment jsdom
import type * as AxiosModule from 'axios'

import axios from 'axios'
import { beforeEach, expect, test, vi } from 'vitest'

import { saveWorkDay } from './work'
vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof AxiosModule>('axios')
  return { default: { ...actual.default, post: vi.fn() } }
})
vi.mock('../auth', () => ({ auth: { value: { token: 'session-token' } } }))
const body: WorkDayBody = {
  profile_id: 'recruiting',
  work_date: '2026-03-08',
  timestamp: '2026-03-08T18:00:00Z',
  values: {},
  totals: { work_day_logged: 1 },
  note: 'Draft',
}
beforeEach(() => vi.clearAllMocks())
test('Work saving makes one authenticated request and returns committed identity', async () => {
  vi.mocked(axios.post).mockResolvedValue({ data: { success: true, data: { activity_id: 'saved' } } })
  expect(await saveWorkDay(body)).toEqual({ activity_id: 'saved' })
  expect(axios.post).toHaveBeenCalledTimes(1)
  expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/work/days'), body, {
    headers: { Authorization: 'Bearer session-token' },
  })
})
test('server conflict is exposed with retained-draft guidance', async () => {
  vi.mocked(axios.post).mockRejectedValue({
    isAxiosError: true,
    response: { data: { error: 'Review historical timestamps.' } },
  })
  await expect(saveWorkDay(body)).rejects.toThrow('Review historical timestamps. Your draft is retained.')
})

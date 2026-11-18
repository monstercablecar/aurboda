// @vitest-environment jsdom
import { signal } from '@preact/signals'
import axios from 'axios'
import { afterEach, expect, it, vi } from 'vitest'

import { auth } from '../auth'
import { advanceSessionGeneration } from '../sessionBoundary'
import { createRemindersClient } from './reminders'

vi.mock('../auth', () => ({ auth: signal({ user: 'first', token: 'first-token' }) }))
afterEach(() => vi.restoreAllMocks())
it('rejects an old client before dispatch when the session changes', async () => {
  const post = vi.spyOn(axios, 'post')
  const api = createRemindersClient()
  advanceSessionGeneration()
  auth.value = { user: 'second', token: 'second-token' }
  await expect(api.test('some-id')).rejects.toThrow('session changed')
  expect(post).not.toHaveBeenCalled()
})
it('uses the captured session token and requires success from the test response', async () => {
  vi.spyOn(axios, 'post').mockResolvedValue({ data: { success: false, queued: false } })
  const api = createRemindersClient()
  await expect(api.test('some-id')).rejects.toThrow('could not be queued')
  expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/reminders/some-id/test'), undefined, {
    headers: { Authorization: `Bearer ${auth.value.token}` },
  })
})

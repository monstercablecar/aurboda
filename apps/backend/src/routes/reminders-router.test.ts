import type { Reminder } from '@aurboda/api-spec'
import type { RequestHandler } from 'express'

import express from 'express'
import supertest from 'supertest'
import { describe, expect, test, vi } from 'vitest'

import type { reminderActions } from '../services/reminders.ts'

import { httpError } from '../http-error.ts'
import { createRemindersRouter } from './reminders-router.ts'

const id = '11111111-1111-4111-8111-111111111111'
const body = {
  title: 'Evening',
  time_of_day: '20:00',
  timezone: 'America/Denver',
  recurrence: 'daily' as const,
  start_date: '2026-11-17',
  enabled: true,
  link: null,
}
const reminder: Reminder = {
  ...body,
  id,
  next_due_at: '2026-11-18T03:00:00Z',
  created_at: '2026-11-17T22:00:00Z',
  updated_at: '2026-11-17T22:00:00Z',
}
const setup = () => {
  const actions = {
    list: vi.fn(async () => [reminder]),
    add: vi.fn(async () => reminder),
    change: vi.fn(async () => reminder),
    remove: vi.fn(async () => {}),
    test: vi.fn(async () => true),
    ready: () => false,
  } satisfies typeof reminderActions
  const auth: RequestHandler = (req, _res, next) => {
    req.user = 'authenticated-user'
    next()
  }
  const app = express().use(express.json()).use('/reminders', createRemindersRouter(auth, actions))
  return { actions, request: supertest(app) }
}

describe('reminder API', () => {
  test('lists readiness and derives owner from auth', async () => {
    const { actions, request } = setup()
    const response = await request.get('/reminders?user=other')
    expect(response.status).toBe(200)
    expect(response.body.scheduler_ready).toBe(false)
    expect(actions.list).toHaveBeenCalledWith('authenticated-user')
  })
  test('creates, patches and deletes only through authenticated account', async () => {
    const { actions, request } = setup()
    expect((await request.post('/reminders').send(body)).status).toBe(200)
    expect(actions.add).toHaveBeenCalledWith('authenticated-user', body)
    expect((await request.patch(`/reminders/${id}`).send({ enabled: false })).status).toBe(200)
    expect(actions.change).toHaveBeenCalledWith('authenticated-user', id, { enabled: false })
    expect((await request.delete(`/reminders/${id}`)).status).toBe(200)
    expect(actions.remove).toHaveBeenCalledWith('authenticated-user', id)
  })
  test('rejects invalid values, owner injection, empty patches and bad ids', async () => {
    const { actions, request } = setup()
    for (const patch of [
      { title: ' ' },
      { time_of_day: '24:00' },
      { start_date: '2026-02-30' },
      { link: '//evil.example' },
      { user: 'other' },
    ]) {
      expect((await request.post('/reminders').send({ ...body, ...patch })).status).toBe(400)
    }
    expect((await request.patch(`/reminders/${id}`).send({})).status).toBe(400)
    expect((await request.delete('/reminders/not-a-uuid')).status).toBe(404)
    expect(actions.add).not.toHaveBeenCalled()
    expect(actions.remove).not.toHaveBeenCalled()
  })
  test('test reports suppression and rate-limit errors without pretending delivery', async () => {
    const { actions, request } = setup()
    actions.test.mockResolvedValueOnce(false)
    expect((await request.post(`/reminders/${id}/test`)).body).toEqual({ success: true, queued: false })
    actions.test.mockRejectedValueOnce(httpError(409, 'Wait one minute before sending another test.'))
    const result = await request.post(`/reminders/${id}/test`)
    expect(result.status).toBe(409)
    expect(result.body.queued).toBe(false)
  })
})

import type { TreatmentCheckin } from '@aurboda/api-spec'
import type { RequestHandler } from 'express'

import express from 'express'
import supertest from 'supertest'
import { expect, test, vi } from 'vitest'

import { treatmentCheckinActions } from '../services/treatment-checkins.ts'
import { createTreatmentCheckinsRouter } from './treatment-checkins-router.ts'

const id = '11111111-1111-4111-8111-111111111111'
const setup = () => {
  const entry = { id } as TreatmentCheckin
  const actions = {
    ...treatmentCheckinActions,
    list: vi.fn(async () => ({ data: [entry], plan: null, scheduler_ready: false })),
    add: vi.fn(async () => entry),
    draft: vi.fn(async () => entry),
    complete: vi.fn(async () => entry),
    action: vi.fn(async () => entry),
    settings: vi.fn(async () => {}),
  }
  const auth: RequestHandler = (req, res, next) => {
    if (!req.headers.authorization) {
      res.sendStatus(401)
      return
    }
    req.user = 'owner'
    next()
  }
  return {
    actions,
    request: supertest(
      express().use(express.json()).use('/treatment-checkins', createTreatmentCheckinsRouter(auth, actions)),
    ),
  }
}
test('check-in routes require authentication and bind writes to the signed-in owner', async () => {
  const { actions, request } = setup()
  expect((await request.get('/treatment-checkins')).status).toBe(401)
  expect(
    (await request.post('/treatment-checkins').send({ treatment_session_id: id, kind: 'reflection' })).status,
  ).toBe(401)
  expect(
    (
      await request
        .post('/treatment-checkins')
        .set('Authorization', 'test')
        .send({ treatment_session_id: id, kind: 'reflection' })
    ).status,
  ).toBe(201)
  expect(actions.add).toHaveBeenCalledWith('owner', { treatment_session_id: id, kind: 'reflection' })
  await request.post(`/treatment-checkins/${id}/action`).set('Authorization', 'test').send({ action: 'skip' })
  expect(actions.action).toHaveBeenCalledWith('owner', id, { action: 'skip' })
})
test('settings preserve omitted switches and entry validation rejects out-of-range values', async () => {
  const { actions, request } = setup()
  expect(
    (
      await request
        .patch(`/treatment-checkins/plans/${id}`)
        .set('Authorization', 'test')
        .send({ quiet_start: '22:00' })
    ).status,
  ).toBe(200)
  expect(actions.settings).toHaveBeenCalledWith('owner', id, { quiet_start: '22:00' })
  expect(
    (
      await request
        .post(`/treatment-checkins/${id}/complete`)
        .set('Authorization', 'test')
        .send({ answers: { mood: 8 }, observed_at: '2026-11-18T12:00:00Z', revision: 0 })
    ).status,
  ).toBe(400)
  expect(actions.complete).not.toHaveBeenCalled()
})

test('reflection creation rejects custom entries without a saved plan', async () => {
  const { actions, request } = setup()
  expect(
    (
      await request
        .post('/treatment-checkins')
        .set('Authorization', 'test')
        .send({ treatment_session_id: id, kind: 'custom' })
    ).status,
  ).toBe(400)
  expect(actions.add).not.toHaveBeenCalled()
})

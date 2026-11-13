import { builtInRecruitingProfile, computeWorkDayTotals } from '@aurboda/api-spec'
import express from 'express'
import supertest from 'supertest'
import { expect, test, vi } from 'vitest'

import { saveWorkDay } from '../services/work-day.ts'
import { createWorkRouter } from './work-router.ts'
vi.mock('../services/work-day.ts', () => ({
  saveWorkDay: vi.fn().mockResolvedValue({ activity_id: '00000000-0000-4000-8000-000000000000' }),
}))
test('Work save authenticates, validates and binds only the session owner', async () => {
  const app = express()
  app.use(express.json())
  app.use(
    '/work',
    createWorkRouter((req, res, next) => {
      if (!req.headers.authorization) {
        res.sendStatus(401)
        return
      }
      req.user = 'owner'
      next()
    }),
  )
  expect((await supertest(app).post('/work/days').send({})).status).toBe(401)
  expect((await supertest(app).post('/work/days').set('Authorization', 'Bearer test').send({})).status).toBe(
    400,
  )
  const body = {
    profile_id: 'recruiting',
    work_date: '2026-03-08',
    timestamp: '2026-03-08T18:00:00Z',
    values: {},
    totals: computeWorkDayTotals(builtInRecruitingProfile, {}),
    note: '',
  }
  expect(
    (
      await supertest(app)
        .post('/work/days')
        .set('Authorization', 'Bearer test')
        .send({ ...body, user: 'attacker' })
    ).status,
  ).toBe(200)
  expect(saveWorkDay).toHaveBeenCalledWith('owner', body, undefined)
})

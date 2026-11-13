import express from 'express'
import supertest from 'supertest'
import { beforeEach, expect, test, vi } from 'vitest'

import * as service from '../services/people.ts'
import { createPeopleRouter } from './people-router.ts'
vi.mock('../services/people.ts', () => ({
  getPeopleHelpTree: vi.fn().mockResolvedValue({ guidance: [] }),
  getPeopleCalendar: vi.fn().mockResolvedValue([]),
  listPeople: vi.fn(),
  createPerson: vi.fn(),
  requirePerson: vi.fn(),
  updatePerson: vi.fn(),
  deletePerson: vi.fn(),
  getDashboard: vi.fn(),
  getGuidance: vi.fn(),
  getMetrics: vi.fn(),
  listEvents: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  setFeedback: vi.fn(),
  peopleOptions: { relationships: [] },
  peopleSources: [],
}))
const app = () => {
  const a = express()
  a.use(express.json())
  a.use(
    createPeopleRouter((req, res, next) => {
      if (req.headers.authorization !== 'Bearer owner') {
        res.sendStatus(401)
        return
      }
      req.user = 'owner'
      next()
    }) as unknown as express.RequestHandler,
  )
  return a
}
const id = '49d44eb3-f7d7-4ae9-9847-67420dd7da69'
beforeEach(() => vi.clearAllMocks())
test('all person reads require authentication', async () => {
  for (const path of [
    '/help-tree',
    '/calendar',
    '/',
    '/options',
    '/catalog/sources',
    `/${id}`,
    `/${id}/events`,
    `/${id}/dashboard`,
  ]) {
    expect((await supertest(app()).get(path)).status).toBe(401)
  }
  expect(service.listPeople).not.toHaveBeenCalled()
})
test('fresh owner gets empty list using authenticated owner only', async () => {
  vi.mocked(service.listPeople).mockResolvedValue([])
  const r = await supertest(app()).get('/').set('authorization', 'Bearer owner').query({ user: 'attacker' })
  expect(r.body).toEqual({ success: true, data: [] })
  expect(service.listPeople).toHaveBeenCalledWith('owner')
})
test('rejects missing age and malformed event body before service', async () => {
  expect(
    (
      await supertest(app())
        .post('/')
        .set('authorization', 'Bearer owner')
        .send({ name: 'A', relationship: 'child', needs: ['typical'] })
    ).status,
  ).toBe(400)
  expect(service.createPerson).not.toHaveBeenCalled()
  expect(
    (
      await supertest(app())
        .post(`/${id}/events`)
        .set('authorization', 'Bearer owner')
        .send({ type: 'feeding', timestamp: 'invalid' })
    ).status,
  ).toBe(400)
  expect(service.createEvent).not.toHaveBeenCalled()
})
test('guidance filters forwarded to authoritative service', async () => {
  vi.mocked(service.getGuidance).mockResolvedValue([])
  const r = await supertest(app())
    .get(`/${id}/guidance`)
    .set('authorization', 'Bearer owner')
    .query({ topic: 'sleep', guidance_type: 'safety' })
  expect(r.status).toBe(200)
  expect(service.getGuidance).toHaveBeenCalledWith('owner', id, { topic: 'sleep', guidance_type: 'safety' })
})

test('private calendar route precedes person ID route and binds authenticated owner', async () => {
  const result = await supertest(app())
    .get('/calendar')
    .set('authorization', 'Bearer owner')
    .query({ from: '2026-01-01', to: '2026-12-31', user: 'attacker' })
  expect(result.status).toBe(200)
  expect(service.getPeopleCalendar).toHaveBeenCalledWith(
    'owner',
    expect.objectContaining({ from: '2026-01-01', to: '2026-12-31' }),
  )
  expect(service.requirePerson).not.toHaveBeenCalled()
})
test.each([
  { from: '2026-02-30', to: '2026-03-01' },
  { from: '2026-02-01', to: '2026-01-01' },
  { from: '2026-01-01', to: '2037-01-01' },
])('calendar rejects malformed or excessive date range %j', async (range) => {
  expect(
    (await supertest(app()).get('/calendar').set('authorization', 'Bearer owner').query(range)).status,
  ).toBe(400)
  expect(service.getPeopleCalendar).not.toHaveBeenCalled()
})

test('help tree validates private evaluation and uses authenticated owner', async () => {
  expect(
    (
      await supertest(app())
        .get('/help-tree')
        .query({ person_id: 'wrong' })
        .set('authorization', 'Bearer owner')
    ).status,
  ).toBe(400)
  expect(
    (await supertest(app()).get('/help-tree').query({ person_id: id }).set('authorization', 'Bearer owner'))
      .status,
  ).toBe(200)
  expect(service.getPeopleHelpTree).toHaveBeenCalledWith('owner', { person_id: id })
})

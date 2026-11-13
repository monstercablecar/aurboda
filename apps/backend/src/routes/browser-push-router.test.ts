import express, { type RequestHandler } from 'express'
import supertest from 'supertest'
import { describe, expect, test, vi } from 'vitest'

import { httpError } from '../http-error.ts'
import { createBrowserPushRouter } from './browser-push-router.ts'

const id = '5d5aca82-dcdf-4608-a621-6c269c7c3ef5'
const setup = () => {
  const service = {
    publicKey: vi.fn(() => 'public'),
    register: vi.fn(async () => id),
    remove: vi.fn(async () => {}),
    test: vi.fn(async () => ({ accepted: true as const })),
  }
  const auth: RequestHandler = (req, _res, next) => {
    if (req.headers.authorization === 'Bearer alice') req.user = 'alice'
    next()
  }
  const app = express()
  app.use(express.json())
  app.use('/notifications/web-push', createBrowserPushRouter(auth, service))
  app.get('/public', (_req, res) => res.json({ public: true }))
  return { service, request: supertest(app) }
}

describe('browser push routes', () => {
  test('requires authentication and leaves unrelated public routes accessible', async () => {
    const { request, service } = setup()
    expect((await request.get('/notifications/web-push/public-key')).status).toBe(401)
    expect((await request.post('/notifications/web-push/test').send({ subscription_id: id })).status).toBe(
      401,
    )
    expect((await request.get('/public')).status).toBe(200)
    expect(service.test).not.toHaveBeenCalled()
  })
  test('passes only caller identity and target id; rejects unowned subscriptions', async () => {
    const { request, service } = setup()
    service.test.mockRejectedValueOnce(httpError(404, 'Browser subscription not found.'))
    const res = await request
      .post('/notifications/web-push/test')
      .set('Authorization', 'Bearer alice')
      .send({ subscription_id: id })
    expect(res.status).toBe(404)
    expect(service.test).toHaveBeenCalledWith('alice', id)
  })
  test('returns acceptance without claiming delivery', async () => {
    const { request } = setup()
    const res = await request
      .post('/notifications/web-push/test')
      .set('Authorization', 'Bearer alice')
      .send({ subscription_id: id })
    expect(res.body).toEqual({ success: true, accepted: true })
  })
  test('rejects arbitrary endpoints, extra fields and malformed targets before service calls', async () => {
    const { request, service } = setup()
    expect(
      (
        await request
          .post('/notifications/web-push/subscription')
          .set('Authorization', 'Bearer alice')
          .send({ endpoint: 'http://localhost', keys: {} })
      ).status,
    ).toBe(400)
    expect(
      (
        await request
          .post('/notifications/web-push/test')
          .set('Authorization', 'Bearer alice')
          .send({ subscription_id: id, user: 'bob' })
      ).status,
    ).toBe(400)
    expect(
      (
        await request
          .delete('/notifications/web-push/subscription')
          .set('Authorization', 'Bearer alice')
          .send({ subscription_id: 'invalid' })
      ).status,
    ).toBe(400)
    expect(service.register).not.toHaveBeenCalled()
    expect(service.test).not.toHaveBeenCalled()
    expect(service.remove).not.toHaveBeenCalled()
  })
})

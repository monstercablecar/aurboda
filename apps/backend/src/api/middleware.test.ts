/**
 * What the auth middleware does on the way through: resolve the token to a
 * user, make sure that user's schema is current before the handler runs, and
 * kick off the one-shot screentime backfill and legacy retype.
 *
 * The schema check is gated by the schema fingerprint (#1125), so it is
 * normally one `SELECT` — but the middleware must still go through
 * `migrateSchemaIfNeeded`, never the unconditional sweep, and still only once
 * per user per instance.
 */
import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import type { Auth } from '../auth.ts'
import type { AccountGate } from '../services/account-gate.ts'

import { httpError } from '../http-error.ts'

vi.mock('../db/index.ts', () => ({ migrateSchemaIfNeeded: vi.fn(async () => {}) }))
vi.mock('../services/audit-log.ts', () => ({
  auditError: vi.fn(),
  auditInfo: vi.fn(),
  auditWarn: vi.fn(),
}))
vi.mock('../services/backfill-screentime-activities.ts', () => ({
  backfillScreentimeActivities: vi.fn(async () => ({ created: 0, skipped: true })),
}))

vi.mock('../services/retype-legacy-screentime.ts', () => ({
  retypeLegacyScreentime: vi.fn(async () => ({ deduplicated: 0, retyped: 0, skipped: true })),
}))
vi.mock('../services/redact-garmin-login-audit.ts', () => ({
  redactGarminLoginAudit: vi.fn(async () => ({ redacted: 0, skipped: true })),
}))

const db = await import('../db/index.ts')
const backfill = await import('../services/backfill-screentime-activities.ts')
const retype = await import('../services/retype-legacy-screentime.ts')
const redact = await import('../services/redact-garmin-login-audit.ts')
const audit = await import('../services/audit-log.ts')
const { createAuthMiddleware, createAuditLogMiddleware } = await import('./middleware.ts')

/** Tokens are `token-<user>`; anything else is rejected, as a bad token is. */
const auth: Auth = {
  createToken: (user) => `token-${user}`,
  getUsernameFromToken: (token) => {
    if (!token.startsWith('token-')) throw new Error('unauthenticated')
    return token.slice('token-'.length)
  },
}

/** One app per test, so the middleware's per-instance map starts empty. */
const buildApp = (isDeletedUser?: (user: string) => boolean) => {
  const httpd = express()
  httpd.use(createAuthMiddleware(auth, httpError(401, 'Unauthorized'), isDeletedUser))
  httpd.get('/who', (req, res) => {
    res.json({ user: req.user })
  })
  httpd.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status('status' in err ? Number(err.status) : 500).json({ error: err.message })
  })
  return httpd
}

const get = (httpd: express.Express, user: string) =>
  supertest(httpd).get('/who').set('Authorization', `Bearer token-${user}`)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.migrateSchemaIfNeeded).mockResolvedValue(undefined)
  vi.mocked(backfill.backfillScreentimeActivities).mockResolvedValue({ created: 0, skipped: true })
  vi.mocked(retype.retypeLegacyScreentime).mockResolvedValue({ deduplicated: 0, retyped: 0, skipped: true })
  vi.mocked(redact.redactGarminLoginAudit).mockResolvedValue({ redacted: 0, skipped: true })
})

describe('createAuthMiddleware', () => {
  test('resolves the token to a user and lets the request through', async () => {
    const response = await get(buildApp(), 'alice')

    expect(response.status).toBe(200)
    expect(response.body.user).toBe('alice')
  })

  test('checks the schema through the gated entry point, not a forced sweep', async () => {
    await get(buildApp(), 'alice')

    expect(db.migrateSchemaIfNeeded).toHaveBeenCalledWith('alice')
  })

  test('checks once per user per instance, not once per request', async () => {
    const httpd = buildApp()

    await get(httpd, 'alice')
    await get(httpd, 'alice')
    await get(httpd, 'bob')

    expect(vi.mocked(db.migrateSchemaIfNeeded).mock.calls).toEqual([['alice'], ['bob']])
  })

  test('a new server instance checks again — the map is per process', async () => {
    await get(buildApp(), 'alice')
    await get(buildApp(), 'alice')

    expect(db.migrateSchemaIfNeeded).toHaveBeenCalledTimes(2)
  })

  test('triggers the screentime backfill after the schema check', async () => {
    await get(buildApp(), 'alice')

    expect(backfill.backfillScreentimeActivities).toHaveBeenCalledWith('alice')
  })

  test('retypes legacy screentime after the backfill, even when the backfill fails', async () => {
    const order: string[] = []
    vi.mocked(backfill.backfillScreentimeActivities).mockImplementation(async () => {
      order.push('backfill')
      throw new Error('boom')
    })
    vi.mocked(retype.retypeLegacyScreentime).mockImplementation(async () => {
      order.push('retype')
      return { deduplicated: 0, retyped: 0, skipped: true }
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await get(buildApp(), 'alice')

    await vi.waitFor(() => expect(retype.retypeLegacyScreentime).toHaveBeenCalledWith('alice'))
    expect(order).toEqual(['backfill', 'retype'])
    errorSpy.mockRestore()
  })

  test('redacts leaked Garmin login audit entries after the screentime one-shots', async () => {
    await get(buildApp(), 'alice')

    await vi.waitFor(() => expect(redact.redactGarminLoginAudit).toHaveBeenCalledWith('alice'))
  })

  test('rejects the request when the schema check fails', async () => {
    vi.mocked(db.migrateSchemaIfNeeded).mockRejectedValue(new Error('disk full'))

    const response = await get(buildApp(), 'alice')

    expect(response.status).toBe(503)
    expect(response.body.error).not.toContain('disk full')
    expect(backfill.backfillScreentimeActivities).not.toHaveBeenCalled()
    expect(retype.retypeLegacyScreentime).not.toHaveBeenCalled()
  })

  test('rejects a request with no Authorization header', async () => {
    const response = await supertest(buildApp()).get('/who')

    expect(response.status).toBe(401)
    expect(db.migrateSchemaIfNeeded).not.toHaveBeenCalled()
  })

  test('rejects an unparseable token without touching the schema', async () => {
    const response = await supertest(buildApp()).get('/who').set('Authorization', 'Bearer nonsense')

    expect(response.status).toBe(401)
    expect(db.migrateSchemaIfNeeded).not.toHaveBeenCalled()
  })

  test("rejects a deleted user's still-valid token without touching the schema", async () => {
    const httpd = buildApp((user) => user === 'gone')

    expect((await get(httpd, 'gone')).status).toBe(401)
    expect(db.migrateSchemaIfNeeded).not.toHaveBeenCalled()
    expect((await get(httpd, 'alice')).status).toBe(200)
  })
})

describe('createAuthMiddleware with an account gate', () => {
  const refusal = {
    error: 'This account is read-only until the plan is renewed',
    payment_url: 'https://pay.example',
  }
  const gate: AccountGate = {
    getStatus: vi.fn(),
    invalidate: vi.fn(),
    isReadOnly: vi.fn(async (user: string) => user === 'expired'),
    refusal: vi.fn(async (user: string) => (user === 'expired' ? refusal : null)),
  }

  const buildGatedApp = () => {
    const httpd = express()
    const authMiddleware = createAuthMiddleware(auth, httpError(401, 'Unauthorized'), undefined, gate)
    const ok = (req: express.Request, res: express.Response) => {
      res.json({ ok: true, user: req.user })
    }
    httpd.get('/activities', authMiddleware, ok)
    httpd.post('/activities', authMiddleware, ok)
    httpd.patch('/user/settings', authMiddleware, ok)
    const exportRouter = express.Router()
    exportRouter.post('/dump-link', authMiddleware, ok)
    httpd.use('/export', exportRouter)
    const accountRouter = express.Router()
    accountRouter.delete('/', authMiddleware, ok)
    httpd.use('/account', accountRouter)
    httpd.delete('/webauthn/credentials/:id', authMiddleware, ok)
    return httpd
  }

  const as = (user: string) => ({ Authorization: `Bearer token-${user}` })

  test('answers a write by a read-only account with 402 and the payment link', async () => {
    const httpd = buildGatedApp()
    for (const response of [
      await supertest(httpd).post('/activities').set(as('expired')),
      await supertest(httpd).patch('/user/settings').set(as('expired')),
    ]) {
      expect(response.status).toBe(402)
      expect(response.body).toEqual({ ...refusal, success: false })
    }
  })

  test('lets a read-only account read, export, delete itself and manage passkeys', async () => {
    const httpd = buildGatedApp()
    expect((await supertest(httpd).get('/activities').set(as('expired'))).status).toBe(200)
    expect((await supertest(httpd).post('/export/dump-link').set(as('expired'))).status).toBe(200)
    expect((await supertest(httpd).delete('/account').set(as('expired'))).status).toBe(200)
    expect((await supertest(httpd).delete('/webauthn/credentials/abc').set(as('expired'))).status).toBe(200)
  })

  test('lets everyone else write, and never consults the gate on a read', async () => {
    const httpd = buildGatedApp()
    vi.mocked(gate.refusal).mockClear()
    expect((await supertest(httpd).get('/activities').set(as('alice'))).status).toBe(200)
    expect(gate.refusal).not.toHaveBeenCalled()
    expect((await supertest(httpd).post('/activities').set(as('alice'))).status).toBe(200)
    expect(gate.refusal).toHaveBeenCalledWith('alice')
  })

  test('fails open when the gate lookup throws', async () => {
    vi.mocked(gate.refusal).mockRejectedValueOnce(new Error('db down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await supertest(buildGatedApp()).post('/activities').set(as('expired'))).status).toBe(200)
    errorSpy.mockRestore()
  })
})

test('concurrent schema checks share rejection, retry once, and cache only success', async () => {
  let rejectCheck!: (error: Error) => void
  vi.mocked(db.migrateSchemaIfNeeded).mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        rejectCheck = reject
      }),
  )
  const middleware = createAuthMiddleware(auth, httpError(401, 'Unauthorized'))
  const request = () =>
    ({
      headers: { authorization: 'Bearer token-alice' },
      method: 'GET',
      baseUrl: '',
      path: '/who',
    }) as express.Request
  const firstNext = vi.fn(),
    secondNext = vi.fn()
  const first = middleware(request(), {} as express.Response, firstNext)
  const second = middleware(request(), {} as express.Response, secondNext)
  expect(db.migrateSchemaIfNeeded).toHaveBeenCalledTimes(1)
  expect(firstNext).not.toHaveBeenCalled()
  expect(secondNext).not.toHaveBeenCalled()
  rejectCheck(new Error('private SQL error'))
  await Promise.all([first, second])
  for (const next of [firstNext, secondNext]) {
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 503 }))
  }
  expect(backfill.backfillScreentimeActivities).not.toHaveBeenCalled()
  const retryNext = vi.fn()
  await middleware(request(), {} as express.Response, retryNext)
  await middleware(request(), {} as express.Response, vi.fn())
  expect(retryNext).toHaveBeenCalledWith()
  expect(db.migrateSchemaIfNeeded).toHaveBeenCalledTimes(2)
})

describe('audit middleware privacy', () => {
  test.each([200, 400, 500])('retains operational status without body contents for %i', async (status) => {
    const app = express()
    app.use(express.json())
    app.use(createAuditLogMiddleware(auth))
    app.post('/private', (_req, res) =>
      res
        .status(status)
        .json({ error: 'private echo', nested: { token: 'secret' }, ['private dynamic key']: 'answer' }),
    )
    await supertest(app)
      .post('/private')
      .set('Authorization', 'Bearer token-alice')
      .send({ notes: 'sensitive note', password: 'secret', answers: [{ value: 'medical detail' }] })
    const logger = status >= 500 ? audit.auditError : status >= 400 ? audit.auditWarn : audit.auditInfo
    expect(logger).toHaveBeenCalledWith(
      'alice',
      'data',
      'POST /private',
      status >= 400
        ? { body_type: 'object', field_count: 3, status, response: { body_type: 'object', field_count: 3 } }
        : { body_type: 'object', field_count: 3 },
    )
  })
  test('scalar error echoes are summarized too', async () => {
    const app = express()
    app.use(createAuditLogMiddleware(auth))
    app.post('/private', (_req, res) => res.status(400).json('sensitive echo'))
    await supertest(app).post('/private').set('Authorization', 'Bearer token-alice')
    expect(audit.auditWarn).toHaveBeenCalledWith('alice', 'data', 'POST /private', {
      status: 400,
      response: { body_type: 'string' },
    })
  })
})

test('audit operations retain static route templates, never dynamic paths or unmatched URLs', async () => {
  const app = express()
  app.use(createAuditLogMiddleware(auth))
  app.post('/people/:personId', (_req, res) => res.sendStatus(204))
  await supertest(app)
    .post('/people/private-person-name?token=secret')
    .set('Authorization', 'Bearer token-alice')
  expect(audit.auditInfo).toHaveBeenCalledWith('alice', 'data', 'POST /people/:personId', undefined)
  await supertest(app)
    .post('/secret-token-in-unknown-path?notes=medical')
    .set('Authorization', 'Bearer token-alice')
  expect(audit.auditWarn).toHaveBeenCalledWith('alice', 'data', 'POST unmatched route', {
    status: 404,
    response: undefined,
  })
})

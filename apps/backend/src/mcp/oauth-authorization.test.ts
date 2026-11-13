import express from 'express'
import request from 'supertest'
import { beforeEach, expect, test, vi } from 'vitest'

import type { CentralDb, OAuthAuthorizationCode, OAuthToken } from '../services/central-db.ts'
import type * as Mutations from '../services/mutations.ts'
import type * as Queries from '../services/queries/index.ts'
import type { SyncProvider } from '../services/queries/index.ts'

import { createAuth } from '../auth.ts'
import { createMcpRouter } from '../mcp.ts'
import { createOAuthRouter } from '../routes/oauth-router.ts'
import { addNote, getNotesInRange } from '../services/mutations.ts'
import { refreshAccessToken, revokeConnection, validateAccessIdentity } from '../services/oauth.ts'
import { getDailySummary } from '../services/queries/index.ts'

vi.mock('../services/queries/index.ts', async (original) => ({
  ...(await original<typeof Queries>()),
  getDailySummary: vi.fn(async () => ({ activities: [] })),
}))

vi.mock('../services/mutations.ts', async (original) => ({
  ...(await original<typeof Mutations>()),
  addNote: vi.fn(async (user: string) => ({ success: true, data: { owner: user } })),
  getNotesInRange: vi.fn(async (user: string) => [{ content: `${user} private synthetic note` }]),
}))

const auth = createAuth('very very secretvery very secret')
const grants = new Map<string, OAuthToken>()
const codes = new Map<string, OAuthAuthorizationCode>()
let lockTail: Promise<unknown> = Promise.resolve()
const centralDb = {
  getOAuthClient: async (id: string) =>
    id === 'client'
      ? { client_id: id, client_name: 'Synthetic Assistant', redirect_uris: ['https://client.test/callback'] }
      : null,
  saveAuthorizationCode: async (code: OAuthAuthorizationCode) => {
    codes.set(code.code, code)
  },
  isUsernameDeleted: async (user: string) => user === 'deleted',
  getOAuthToken: async (token: string) => {
    const grant = grants.get(token)
    return grant && !grant.revoked && grant.expires_at.getTime() > Date.now() ? grant : null
  },
  saveOAuthToken: async (grant: OAuthToken) => {
    grants.set(grant.token, grant)
  },
  revokeOAuthToken: async (token: string) => {
    const grant = grants.get(token)
    if (grant) grant.revoked = true
    return !!grant
  },
  revokeOAuthConnection: async (user: string, client: string) => {
    for (const grant of grants.values()) {
      if (grant.username === user && grant.client_id === client) grant.revoked = true
    }
    for (const code of codes.values()) {
      if (code.username === user && code.client_id === client) code.used = true
    }
  },
  listOAuthConnections: async (user: string) =>
    [...grants.values()]
      .filter((g) => g.username === user && !g.revoked)
      .map((g) => ({ client_id: g.client_id, client_name: 'Synthetic Assistant', scope: g.scope ?? null })),
  withOAuthLock: async <T>(action: (db: CentralDb) => Promise<T>): Promise<T> => {
    const run = lockTail.then(() => action(centralDb))
    lockTail = run.catch(() => {})
    return run
  },
} as unknown as CentralDb

const addGrant = (username: string, scope: string | null = 'read', client_id = 'client') => {
  const grant: OAuthToken = {
    token: `aur_at_${username}_${client_id}`,
    token_type: 'access',
    username,
    client_id,
    scope,
    expires_at: new Date(Date.now() + 3600000),
    revoked: false,
    parent_token: null,
    created_at: new Date(),
  }
  grants.set(grant.token, grant)
  return grant
}
const appFor = () => {
  const app = express()
  app.use(
    createOAuthRouter({ centralDb, auth, webHost: 'https://example.test', loginToUserDb: async () => {} }),
  )
  app.use('/mcp', createMcpRouter(auth, { centralDb }))
  return app
}
const post = (app: express.Express, token: string, method: string, params: unknown = {}) =>
  request(app)
    .post('/mcp')
    .set('Authorization', `Bearer ${token}`)
    .set('Accept', 'application/json, text/event-stream')
    .send({ id: 1, jsonrpc: '2.0', method, params })
const rpc = (response: { text: string }) => {
  const line = response.text.split('\n').find((candidate) => candidate.startsWith('data: '))
  if (!line) throw new Error('Expected SSE JSON-RPC response')
  return JSON.parse(line.slice(6))
}

beforeEach(() => {
  grants.clear()
  codes.clear()
  lockTail = Promise.resolve()
  vi.clearAllMocks()
})

test('read-only discovery excludes mutations, exports, credentials, debug and unknown tools', async () => {
  const app = appFor()
  const grant = addGrant('alice')
  const result = rpc(await post(app, grant.token, 'tools/list'))
  const names = result.result.tools.map((t: { name: string }) => t.name)
  expect(names).toContain('query_notes')
  for (const forbidden of [
    'delete_note',
    'update_note',
    'add_note',
    'export_data_dump',
    'get_user_settings',
    'query_raw_records',
    'query_audit_log',
    'sync_oura',
    'list_users',
  ]) {
    expect(names).not.toContain(forbidden)
  }
  for (const name of [
    'delete_note',
    'update_note',
    'sync_oura',
    'get_user_settings',
    'query_raw_records',
    'new_unreviewed_tool',
  ]) {
    const call = rpc(await post(app, grant.token, 'tools/call', { name, arguments: {} }))
    expect(call.error ?? call.result?.isError).toBeTruthy()
  }
})

test.each(['alice', 'bob', 'admin'])(
  'MCP analysis binds %s to token identity despite supplied username',
  async (user) => {
    const grant = addGrant(user)
    const result = rpc(
      await post(appFor(), grant.token, 'tools/call', {
        name: 'query_notes',
        arguments: { username: 'other', from: '2026-11-01T00:00:00Z', to: '2026-11-02T00:00:00Z', tz: 'UTC' },
      }),
    )
    expect(result.result.content[0].text).toContain(`${user} private synthetic note`)
    expect(getNotesInRange).toHaveBeenCalledWith(user, expect.any(Date), expect.any(Date))
  },
)

test('revoking a connection invalidates access and refresh and leaves another user and client connected', async () => {
  const app = appFor()
  const alice = addGrant('alice')
  const bob = addGrant('bob')
  const other = addGrant('alice', 'read', 'other-client')
  const refresh = {
    ...alice,
    token: 'aur_rt_alice',
    token_type: 'refresh' as const,
    parent_token: alice.token,
  }
  grants.set(refresh.token, refresh)
  const revoked = await request(app)
    .post('/oauth/connections/revoke')
    .set('Authorization', `Bearer ${auth.createToken('alice')}`)
    .send({ client_id: 'client' })
  expect(revoked.status).toBe(200)
  expect((await post(app, alice.token, 'tools/list')).status).toBe(401)
  await expect(
    refreshAccessToken({ centralDb }, { refresh_token: refresh.token, client_id: 'client' }),
  ).rejects.toThrow('Invalid or expired refresh token')
  expect((await post(app, bob.token, 'tools/list')).status).toBe(200)
  expect((await post(app, other.token, 'tools/list')).status).toBe(200)
})

test('ordinary users and administrator cannot revoke another account via body username', async () => {
  const app = appFor()
  const bob = addGrant('bob')
  for (const user of ['alice', 'admin']) {
    const response = await request(app)
      .post('/oauth/connections/revoke')
      .set('Authorization', `Bearer ${auth.createToken(user)}`)
      .send({ client_id: 'client', username: 'bob' })
    expect(response.status).toBe(400)
    await request(app)
      .post('/oauth/connections/revoke')
      .set('Authorization', `Bearer ${auth.createToken(user)}`)
      .send({ client_id: 'client' })
      .expect(200)
    expect((await post(app, bob.token, 'tools/list')).status).toBe(200)
  }
  await request(app).post('/oauth/connections/revoke').send({ client_id: 'client' }).expect(401)
})

test('token revocation endpoint requires possession of a matching connection token', async () => {
  const app = appFor()
  const alice = addGrant('alice')
  await request(app).post('/revoke').type('form').send({ token: alice.token, client_id: 'other' }).expect(200)
  expect((await post(app, alice.token, 'tools/list')).status).toBe(200)
  await request(app)
    .post('/revoke')
    .type('form')
    .send({ token: alice.token, client_id: 'client' })
    .expect(200)
  expect((await post(app, alice.token, 'tools/list')).status).toBe(401)
})

test('connection listing is bound to browser identity', async () => {
  const app = appFor()
  addGrant('alice', 'read', 'alice-client')
  addGrant('bob', 'read', 'bob-client')
  const response = await request(app)
    .get('/oauth/connections?username=bob')
    .set('Authorization', `Bearer ${auth.createToken('alice')}`)
  expect(response.body.connections).toEqual([
    { client_id: 'alice-client', client_name: 'Synthetic Assistant', scope: 'read' },
  ])
})

test('legacy grants remain full access; unknown scopes and expired/revoked tokens fail closed', async () => {
  const legacy = addGrant('alice', null)
  expect(await validateAccessIdentity({ centralDb }, legacy.token)).toEqual({
    username: 'alice',
    scope: 'read write',
  })
  for (const scope of ['', 'admin', 'write', 'read delete']) {
    const grant = addGrant('alice', scope)
    expect((await post(appFor(), grant.token, 'tools/list')).status).toBe(401)
  }
  const expired = addGrant('expired')
  expired.expires_at = new Date(Date.now() - 1)
  const revoked = addGrant('revoked')
  revoked.revoked = true
  for (const grant of [expired, revoked]) {
    expect((await post(appFor(), grant.token, 'tools/list')).status).toBe(401)
  }
})

test('full-access connector can mutate while read-only connector cannot', async () => {
  const app = appFor()
  const read = addGrant('alice')
  const write = addGrant('bob', 'read write')
  const params = {
    name: 'add_note',
    arguments: {
      entity_type: 'time',
      start_time: '2026-11-01T00:00:00Z',
      content: 'Synthetic note',
      username: 'alice',
    },
  }
  const denied = rpc(await post(app, read.token, 'tools/call', params))
  expect(denied.error ?? denied.result?.isError).toBeTruthy()
  expect(addNote).not.toHaveBeenCalled()
  const result = rpc(await post(app, write.token, 'tools/call', params))
  expect(result.result.content[0].text).toContain('bob')
  expect(addNote).toHaveBeenCalledWith('bob', expect.objectContaining({ content: 'Synthetic note' }))
})

test('authorization form defaults to read-only and write permission requires explicit selection', async () => {
  const app = appFor()
  const params = {
    client_id: 'client',
    redirect_uri: 'https://client.test/callback',
    state: 'state',
    code_challenge: 'challenge',
    code_challenge_method: 'S256',
  }
  const page = await request(app).get('/authorize').query(params)
  expect(page.status).toBe(200)
  expect(page.text).toContain('Connecting Synthetic Assistant')
  expect(page.text).toContain('including journals when available')
  expect(page.text).not.toContain('value="yes" checked')
  for (const [write_access, scope] of [
    [undefined, 'read'],
    ['yes', 'read write'],
  ]) {
    await request(app)
      .post('/authorize')
      .type('form')
      .send({
        ...params,
        username: 'alice',
        password: 'synthetic-fixture',
        ...(write_access ? { write_access } : {}),
      })
      .expect(302)
    expect([...codes.values()].at(-1)?.scope).toBe(scope)
  }
})

test('refresh preserves read scope and racing revocation leaves no live reissued tokens', async () => {
  const access = addGrant('alice')
  const refresh = {
    ...access,
    token: 'aur_rt_alice',
    token_type: 'refresh' as const,
    parent_token: access.token,
  }
  grants.set(refresh.token, refresh)
  const [tokens] = await Promise.all([
    refreshAccessToken({ centralDb }, { refresh_token: refresh.token, client_id: 'client' }),
    revokeConnection({ centralDb }, 'alice', 'client'),
  ])
  expect(tokens.scope).toBe('read')
  expect(grants.get(tokens.access_token)?.scope).toBe('read')
  expect(await validateAccessIdentity({ centralDb }, tokens.access_token)).toBeNull()
  expect(await centralDb.getOAuthToken(tokens.refresh_token)).toBeNull()
})

test('deleted browser tokens cannot list or revoke remaining connection records', async () => {
  const app = appFor()
  addGrant('deleted')
  const header = `Bearer ${auth.createToken('deleted')}`
  await request(app).get('/oauth/connections').set('Authorization', header).expect(401)
  await request(app)
    .post('/oauth/connections/revoke')
    .set('Authorization', header)
    .send({ client_id: 'client' })
    .expect(401)
})

test('read-only analysis suppresses provider auto-sync while full-access requests preserve it', async () => {
  const sync = { syncOuraIfNeeded: vi.fn() } as unknown as SyncProvider
  const app = express().use('/mcp', createMcpRouter(auth, { centralDb, sync }))
  const read = addGrant('alice')
  const write = addGrant('bob', 'read write')
  for (const grant of [read, write]) {
    await post(app, grant.token, 'tools/call', {
      name: 'get_daily_summary',
      arguments: { date: '2026-11-01', tz: 'UTC' },
    })
  }
  expect(getDailySummary).toHaveBeenNthCalledWith(1, 'alice', expect.any(Date), undefined, 'UTC')
  expect(getDailySummary).toHaveBeenNthCalledWith(2, 'bob', expect.any(Date), sync, 'UTC')
})

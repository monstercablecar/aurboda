import { afterAll, beforeAll, expect, test } from 'vitest'

import { createTestDatabase, type TestDatabase } from '../test/db-test-helper.ts'
import { deleteBrowserPush, getBrowserPush, saveBrowserPush } from './browser-push.ts'
import { _setDbForUser } from './connection.ts'
import { createRolePool, type UserDb } from './pool.ts'

const databases: TestDatabase[] = []
const pools: UserDb[] = []
const users = ['push_alice', 'push_bob']

beforeAll(async () => {
  for (const user of users) {
    const database = await createTestDatabase()
    databases.push(database)
    const pool = createRolePool({ connectionString: database.uri, max: 2 })
    pools.push(pool)
    _setDbForUser(user, pool)
  }
}, 120_000)
afterAll(async () => {
  await Promise.all(pools.map((pool) => pool.end()))
  await Promise.all(databases.map((database) => database.drop()))
})

test('subscriptions upsert and delete only in their own user database', async () => {
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test',
    keys: { auth: 'a'.repeat(22), p256dh: 'b'.repeat(87) },
  }
  const aliceId = await saveBrowserPush(users[0], subscription)
  const bobId = await saveBrowserPush(users[1], subscription)
  expect(bobId).not.toBe(aliceId)
  expect(await getBrowserPush(users[0], bobId)).toBeNull()
  expect(await deleteBrowserPush(users[1], aliceId)).toBe(false)
  const changed = { ...subscription, keys: { ...subscription.keys, auth: 'c'.repeat(22) } }
  expect(await saveBrowserPush(users[0], changed)).toBe(aliceId)
  expect(await getBrowserPush(users[0], aliceId)).toEqual(changed)
  expect(await getBrowserPush(users[1], bobId)).toEqual(subscription)
  expect(await deleteBrowserPush(users[0], aliceId)).toBe(true)
  expect(await getBrowserPush(users[0], aliceId)).toBeNull()
  expect(await getBrowserPush(users[1], bobId)).toEqual(subscription)
})

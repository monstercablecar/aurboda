import type { PeopleEventBody } from '@aurboda/api-spec'

import { describe, expect, test, vi } from 'vitest'

import type { ReminderClaim, ReminderCandidate } from '../db/people-reminders.ts'

import { createPeopleReminderSender, peopleReminderPayload } from './browser-push.ts'
import { dispatchPeopleReminder, runPeopleReminders, validatePeopleReminder } from './people-reminders.ts'

const now = new Date('2026-11-11T12:00:00Z')
const event = (overrides: Partial<PeopleEventBody> = {}): PeopleEventBody => ({
  type: 'appointment',
  timestamp: '2026-11-11T13:00:00Z',
  source: 'manual',
  payload: { note: 'private medical information' },
  reminder_at: '2026-11-11T12:00:00Z',
  reminder_timezone: 'America/Denver',
  ...overrides,
})
const claim = (overrides: Partial<ReminderClaim> = {}): ReminderClaim => ({
  id: '07fb07b0-6dd5-4ce6-87a6-dbc0c4edb00e',
  person_id: 'person',
  revision: 1,
  event: event(),
  attempts: 0,
  ...overrides,
})

describe('explicit private People reminders', () => {
  test('only explicit future reminders can be added; removal and unchanged history remain editable', () => {
    expect(() =>
      validatePeopleReminder(event({ reminder_at: null, reminder_timezone: null }), undefined, now, false),
    ).not.toThrow()
    expect(() => validatePeopleReminder(event(), undefined, now, true)).toThrow('future')
    expect(() =>
      validatePeopleReminder(event({ reminder_at: '2026-11-11T12:01:00Z' }), undefined, now, false),
    ).toThrow('scheduler')
    expect(() =>
      validatePeopleReminder(event({ reminder_at: '2026-11-11T12:01:00Z' }), undefined, now, true),
    ).not.toThrow()
    expect(() =>
      validatePeopleReminder(event({ reminder_timezone: 'not/a-zone' }), undefined, now, true),
    ).toThrow('IANA')
    expect(() => validatePeopleReminder(event({ reminder_timezone: null }), undefined, now, true)).toThrow(
      'time zone',
    )
    expect(() => validatePeopleReminder(event(), event(), now, false)).not.toThrow()
  })
  test('dispatch uses the instant including offset and does not send future, missing or expired reminders', async () => {
    const send = vi.fn(async () => 'accepted' as const)
    expect(
      await dispatchPeopleReminder(
        claim({ event: event({ reminder_at: '2026-11-11T05:00:00-07:00' }) }),
        now,
        send,
      ),
    ).toBe('accepted')
    expect(send).toHaveBeenCalledOnce()
    await dispatchPeopleReminder(claim({ event: event({ reminder_at: '2026-11-11T12:01:00Z' }) }), now, send)
    await dispatchPeopleReminder(claim({ event: event({ reminder_at: null }) }), now, send)
    expect(
      await dispatchPeopleReminder(
        claim({ event: event({ reminder_at: '2026-11-10T12:00:00Z' }) }),
        now,
        send,
      ),
    ).toBe('expired')
    expect(await dispatchPeopleReminder(claim({ attempts: 12 }), now, send)).toBe('expired')
    expect(send).toHaveBeenCalledOnce()
  })
  test('sweep dispatches through a revision claim and does not bypass its rejection', async () => {
    const send = vi.fn(async () => 'accepted' as const)
    const c = claim()
    const withClaim = vi.fn(
      async (
        _user: string,
        _candidate: ReminderCandidate,
        _now: Date,
        _dispatch: (c: ReminderClaim) => Promise<string>,
      ) => false,
    )
    await runPeopleReminders({
      listUsers: async () => ['alice'],
      listDue: async () => [c],
      withClaim,
      send,
      now: () => now,
    })
    expect(withClaim).toHaveBeenCalledOnce()
    expect(send).not.toHaveBeenCalled()
  })
})

const subscription = {
  id: 'subscription',
  endpoint: 'https://fcm.googleapis.com/fcm/send/test',
  keys: { auth: 'a'.repeat(22), p256dh: 'b'.repeat(87) },
}
const setup = () => {
  const deps = {
    configuration: () => ({
      publicKey: 'public',
      privateKey: 'private',
      subject: 'mailto:admin@example.org',
    }),
    list: vi.fn(async () => [subscription]),
    remove: vi.fn(async () => true),
    send: vi.fn(async () => {}),
  }
  return { deps, send: createPeopleReminderSender(deps) }
}
describe('generic reminder browser delivery', () => {
  test('sends only owned subscriptions and a fixed generic payload', async () => {
    const { deps, send } = setup()
    expect(await send('alice', claim().id)).toBe('accepted')
    expect(deps.list).toHaveBeenCalledWith('alice')
    expect(deps.send).toHaveBeenCalledWith(
      subscription,
      deps.configuration(),
      peopleReminderPayload(claim().id),
    )
    expect(JSON.stringify(peopleReminderPayload(claim().id))).not.toContain('private medical')
  })
  test.each([404, 410])('removes expired subscriptions after %s', async (statusCode) => {
    const { deps, send } = setup()
    deps.send.mockRejectedValueOnce({ statusCode })
    expect(await send('alice', claim().id)).toBe('unavailable')
    expect(deps.remove).toHaveBeenCalledWith('alice', 'subscription')
  })
  test('transient errors are classified without exposing provider details', async () => {
    const { deps, send } = setup()
    deps.send.mockRejectedValueOnce(new Error('private endpoint'))
    expect(await send('alice', claim().id)).toBe('retry')
  })
  test('no subscriptions/configuration or an unsafe endpoint cannot report accepted', async () => {
    const { deps } = setup()
    expect(
      await createPeopleReminderSender({ ...deps, configuration: () => null })('alice', claim().id),
    ).toBe('unavailable')
    expect(await createPeopleReminderSender({ ...deps, list: async () => [] })('alice', claim().id)).toBe(
      'unavailable',
    )
    expect(
      await createPeopleReminderSender({
        ...deps,
        list: async () => [{ ...subscription, endpoint: 'https://localhost/private' }],
      })('alice', claim().id),
    ).toBe('unavailable')
    expect(deps.send).not.toHaveBeenCalled()
  })
})

import { treatmentCheckinPlanBodySchema } from '@aurboda/api-spec'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { _setDbForUser, query, withUserTransaction } from '../db/connection.ts'
import { listNotifications, upsertNotificationPreference } from '../db/notifications.ts'
import {
  createQuestionnaire,
  createTreatmentSession,
  createTreatmentType,
  deleteAssessment,
  exportPharmacology,
  getTreatmentSession,
  listAssessments,
  updateQuestionnaire,
  updateTreatmentType,
} from '../db/pharmacology.ts'
import { createRolePool } from '../db/pool.ts'
import {
  cleanTestDb,
  createTestDatabase,
  getTestUser,
  startTestDb,
  stopTestDb,
} from '../test/db-test-helper.ts'
import { updateTreatment } from './pharmacology.ts'
import {
  actOnTreatmentCheckin,
  addTreatmentReflection,
  changeCheckinSettings,
  deliverTreatmentCheckins,
  initializeCheckinPlan,
  listTreatmentCheckins,
  saveTreatmentCheckin,
} from './treatment-checkins.ts'

const now = new Date('2026-11-14T12:00:00Z')
const plan = treatmentCheckinPlanBodySchema.parse({
  before: false,
  reminders_enabled: true,
  quiet_start: '00:00',
  quiet_end: '00:00',
})
const makeSession = async (withPlan = true) => {
  const user = getTestUser()
  const type = await createTreatmentType(user, {
    key: 'example',
    display_name: 'Example treatment',
    category: 'journal',
    active: true,
    default_follow_up_hours: [],
  })
  const session = await createTreatmentSession(user, {
    treatment_type_id: type.id,
    planned_at: now.toISOString(),
    actual_start: now.toISOString(),
    actual_end: '2026-11-14T13:00:00Z',
    timezone: 'UTC',
    status: 'in_progress',
    adverse_events: [],
    metadata: {},
    follow_up_hours: [],
  })
  if (withPlan) await withUserTransaction(user, (tx) => initializeCheckinPlan(tx, session, plan, now))
  return session
}
const afterTime = new Date('2026-11-14T14:00:00Z')
const entryBody = (revision = 0) => ({
  answers: { difficulties: 'none' as const },
  observed_at: afterTime.toISOString(),
  revision,
})
const afterEntry = async (id: string) =>
  (await listTreatmentCheckins(getTestUser(), id, afterTime)).data.find((entry) => entry.kind === 'after')!

describe('treatment check-in persistence, privacy and reminders', () => {
  beforeAll(startTestDb, 120000)
  afterAll(stopTestDb)
  beforeEach(cleanTestDb)
  test('ended legacy session displays ended without manufacturing a plan or assessments', async () => {
    const session = await makeSession(false)
    expect((await getTreatmentSession(getTestUser(), session.id))?.status).toBe('completed')
    expect(await listTreatmentCheckins(getTestUser(), session.id)).toMatchObject({ data: [], plan: null })
    expect(await listAssessments(getTestUser())).toEqual([])
  })
  test('concurrent completion is one shared assessment, and stale draft cannot reopen it', async () => {
    const session = await makeSession()
    const entry = await afterEntry(session.id)
    const [a, b] = await Promise.all([
      saveTreatmentCheckin(getTestUser(), entry.id, entryBody(), true, afterTime),
      saveTreatmentCheckin(getTestUser(), entry.id, entryBody(), true, afterTime),
    ])
    expect(a.assessment?.id).toBe(b.assessment?.id)
    expect(await listAssessments(getTestUser())).toHaveLength(1)
    expect(Object.values(a.answer_labels)).toContain('Any unwanted effects or difficulties to record?')
    await expect(
      saveTreatmentCheckin(getTestUser(), entry.id, entryBody(), false, afterTime),
    ).rejects.toMatchObject({ status: 409 })
    expect(await deliverTreatmentCheckins(getTestUser(), afterTime)).toBe(0)
    const exported = await exportPharmacology(getTestUser())
    expect(exported.treatment_checkins).toHaveLength(2)
    expect(exported.assessments).toHaveLength(1)
  })
  test('draft is private and revision protected, then skip stops reminders without a fake score', async () => {
    const session = await makeSession()
    const entry = await afterEntry(session.id)
    const saved = await saveTreatmentCheckin(getTestUser(), entry.id, entryBody(), false, afterTime)
    expect(saved.revision).toBe(1)
    expect(saved.assessment).toBeNull()
    await expect(
      saveTreatmentCheckin(getTestUser(), entry.id, entryBody(), false, afterTime),
    ).rejects.toMatchObject({ status: 409 })
    await actOnTreatmentCheckin(getTestUser(), entry.id, { action: 'skip' }, afterTime)
    expect(await deliverTreatmentCheckins(getTestUser(), afterTime)).toBe(0)
    expect(await listAssessments(getTestUser())).toEqual([])
    expect((await afterEntry(session.id)).status).toBe('skipped')
  })
  test('past windows reject backfilling but allow a separately labeled reflection', async () => {
    const session = await makeSession()
    const entry = await afterEntry(session.id)
    const late = new Date('2026-11-18T14:00:00Z')
    await expect(
      saveTreatmentCheckin(getTestUser(), entry.id, entryBody(), true, late),
    ).rejects.toMatchObject({ status: 409 })
    const reflection = await addTreatmentReflection(
      getTestUser(),
      { treatment_session_id: session.id, kind: 'reflection' },
      late,
    )
    const saved = await saveTreatmentCheckin(
      getTestUser(),
      reflection.id,
      {
        answers: { notes: 'I do not remember the immediate details.' },
        observed_at: late.toISOString(),
        revision: 0,
      },
      true,
      late,
    )
    expect(saved.assessment?.stage).toBe('later_reflection')
    expect(saved.assessment?.assessed_at).toBe(late.toISOString())
    expect(
      (await listTreatmentCheckins(getTestUser(), session.id, late)).data.find((e) => e.id === entry.id)
        ?.status,
    ).toBe('window_passed')
  })
  test('atomic worker delivers at most twice and honors snooze', async () => {
    const session = await makeSession()
    const entry = await afterEntry(session.id)
    const first = await Promise.all([
      deliverTreatmentCheckins(getTestUser(), afterTime),
      deliverTreatmentCheckins(getTestUser(), afterTime),
    ])
    expect(first.reduce((a, b) => a + b)).toBe(1)
    await actOnTreatmentCheckin(getTestUser(), entry.id, { action: 'snooze', snooze_minutes: 60 }, afterTime)
    expect(await deliverTreatmentCheckins(getTestUser(), new Date('2026-11-14T14:30:00Z'))).toBe(0)
    expect(await deliverTreatmentCheckins(getTestUser(), new Date('2026-11-14T15:00:00Z'))).toBe(1)
    expect(await deliverTreatmentCheckins(getTestUser(), new Date('2026-11-14T19:00:00Z'))).toBe(0)
    expect(
      (await listNotifications(getTestUser(), { limit: 100 })).every(
        (n) => !n.title.includes('Example treatment'),
      ),
    ).toBe(true)
  })
  test('quiet hours defer delivery and preferences suppress rather than replay reminders', async () => {
    const session = await makeSession()
    await changeCheckinSettings(getTestUser(), session.id, { quiet_start: '13:00', quiet_end: '16:00' }, now)
    expect(await deliverTreatmentCheckins(getTestUser(), afterTime)).toBe(0)
    expect(await deliverTreatmentCheckins(getTestUser(), new Date('2026-11-14T16:00:00Z'))).toBe(1)
    await upsertNotificationPreference(getTestUser(), 'treatment_checkin', { in_app: false, push: false })
    expect(await deliverTreatmentCheckins(getTestUser(), new Date('2026-11-14T20:00:00Z'))).toBe(0)
    await upsertNotificationPreference(getTestUser(), 'treatment_checkin', { in_app: true, push: true })
    expect(await deliverTreatmentCheckins(getTestUser(), new Date('2026-11-14T20:01:00Z'))).toBe(0)
  })
  test('late end edits do not enqueue old reminders; completed facts keep their times', async () => {
    const session = await makeSession()
    const entry = await afterEntry(session.id)
    await saveTreatmentCheckin(getTestUser(), entry.id, entryBody(), true, afterTime)
    await updateTreatment(getTestUser(), session.id, { actual_end: '2026-11-14T13:30:00Z' })
    expect(await deliverTreatmentCheckins(getTestUser(), new Date('2026-11-18T14:00:00Z'))).toBe(0)
    expect((await afterEntry(session.id)).assessment?.assessed_at).toBe(afterTime.toISOString())
  })
  test('cancellation invalidates outstanding actions and voided records stay explicit', async () => {
    const session = await makeSession()
    const entry = await afterEntry(session.id)
    const saved = await saveTreatmentCheckin(getTestUser(), entry.id, entryBody(), true, afterTime)
    await deleteAssessment(getTestUser(), saved.assessment!.id)
    expect((await afterEntry(session.id)).status).toBe('record_removed')
    await updateTreatment(getTestUser(), session.id, { status: 'canceled' })
    expect(await deliverTreatmentCheckins(getTestUser(), new Date('2026-11-15T13:00:00Z'))).toBe(0)
  })
  test('custom questionnaire plan freezes its version; type defaults remain reusable', async () => {
    const user = getTestUser()
    const session = await makeSession(false)
    const template = await createQuestionnaire(user, {
      stable_key: 'personal',
      display_name: 'A meaningful question',
      moment: 'custom',
      enabled: true,
      questions: [
        {
          stable_key: 'reflection',
          prompt: 'What mattered today?',
          response_type: 'long_text',
          required: true,
          enabled: true,
          sort_order: 0,
          anchors: {},
          config: {},
        },
      ],
    })
    const selected = {
      ...plan,
      before: false,
      after: false,
      next_day: false,
      additional: [{ template_id: template.id, offset_hours: 1, window_hours: 24 }],
    }
    await updateTreatmentType(user, session.treatment_type.id, { default_checkin_plan: selected })
    expect((await getTreatmentSession(user, session.id))?.treatment_type.default_checkin_plan).toEqual(
      selected,
    )
    await withUserTransaction(user, (tx) => initializeCheckinPlan(tx, session, selected, now))
    await updateQuestionnaire(user, template.id, {
      display_name: 'Changed title',
      questions: template.questions.map((q) => ({ ...q, prompt: 'A different question' })),
    })
    const entry = (await listTreatmentCheckins(user, session.id, afterTime)).data[0]!
    expect(entry.questionnaire?.display_name).toBe('A meaningful question')
    expect(entry.questionnaire?.questions[0]?.prompt).toBe('What mattered today?')
    const q = template.questions[0]!
    const saved = await saveTreatmentCheckin(
      user,
      entry.id,
      {
        ...entryBody(),
        answers: {},
        responses: [{ question_id: q.id, question_version: q.version, value: 'Time outdoors' }],
      },
      true,
      afterTime,
    )
    expect(saved.assessment?.template_version).toBe(1)
    expect(saved.answer_labels[q.id]).toBe('What mattered today?')
    expect((await listAssessments(user))[0]!.responses[0]!.question_prompt).toBe('What mattered today?')
  })
  test('another user database cannot see, edit, or act on these check-ins', async () => {
    const session = await makeSession()
    const entry = await afterEntry(session.id)
    const otherDb = await createTestDatabase()
    const pool = createRolePool({ connectionString: otherDb.uri, max: 2 })
    _setDbForUser('checkin_other_user', pool)
    try {
      expect((await listTreatmentCheckins('checkin_other_user')).data).toEqual([])
      await expect(
        saveTreatmentCheckin('checkin_other_user', entry.id, entryBody(), true, afterTime),
      ).rejects.toMatchObject({ status: 404 })
      await expect(
        actOnTreatmentCheckin('checkin_other_user', entry.id, { action: 'skip' }, afterTime),
      ).rejects.toMatchObject({ status: 404 })
      await expect(
        changeCheckinSettings('checkin_other_user', session.id, { reminders_enabled: true }, afterTime),
      ).rejects.toMatchObject({ status: 404 })
    } finally {
      await pool.end()
      await otherDb.drop()
    }
  }, 30000)
  test('notification insertion failure rolls back schedule advancement', async () => {
    const session = await makeSession()
    await query(
      getTestUser(),
      `ALTER TABLE notifications ADD CONSTRAINT fail_checkin_test CHECK(type <> 'treatment_checkin')`,
    )
    try {
      await expect(deliverTreatmentCheckins(getTestUser(), afterTime)).rejects.toThrow()
    } finally {
      await query(getTestUser(), 'ALTER TABLE notifications DROP CONSTRAINT fail_checkin_test')
    }
    expect(await deliverTreatmentCheckins(getTestUser(), afterTime)).toBe(1)
    expect((await afterEntry(session.id)).status).toBe('due')
  })
})

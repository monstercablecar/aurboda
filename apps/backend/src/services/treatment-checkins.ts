import {
  addTreatmentReflectionSchema,
  treatmentCheckinActionSchema,
  treatmentCheckinEntrySchema,
  treatmentCheckinPlanBodySchema,
  treatmentCheckinSettingsSchema,
  UUID_RE,
  type AddTreatmentReflection,
  type AssessmentAnswer,
  type BriefTreatmentAnswers,
  type QuestionnaireTemplate,
  type TreatmentCheckin,
  type TreatmentCheckinAction,
  type TreatmentCheckinEntry,
  type TreatmentCheckinPlanBody,
  type TreatmentCheckinSettings,
  type TreatmentSession,
} from '@aurboda/api-spec'

import type { Queryable } from '../db/pool.ts'
import type { PgBoss } from './pg-boss.ts'

import { query, withUserTransaction } from '../db/connection.ts'
import {
  getNotificationPreference,
  insertNotification,
  pruneNotifications,
  reviseNotification,
  reviseOpenNotifications,
} from '../db/notifications.ts'
import {
  createAssessmentInTransaction,
  getAssessment,
  getQuestionnaire,
  getTreatmentSession,
} from '../db/pharmacology.ts'
import { httpError } from '../http-error.ts'
import { validateResponses } from './assessment-validation.ts'
import { createNotifier } from './notifications.ts'
import { BRIEF_TREATMENT_KEY, ensureBriefTemplate } from './treatment-checkin-questions.ts'
import { afterQuietHours, checkinWindow, HOUR, initialReminder } from './treatment-checkin-timing.ts'

interface CheckinRow {
  id: string
  treatment_session_id: string
  kind: TreatmentCheckin['kind']
  offset_hours: number | null
  window_hours: number | null
  template_snapshot: QuestionnaireTemplate | null
  due_at: Date | null
  expires_at: Date | null
  next_reminder_at: Date | null
  reminder_count: number
  snoozed_until: Date | null
  skipped_at: Date | null
  draft: BriefTreatmentAnswers
  draft_responses: AssessmentAnswer[]
  observed_at: Date | null
  revision: number
  assessment_id: string | null
  created_at: Date
}
const iso = (date: Date | null) => date?.toISOString() ?? null
const isClosed = (session: TreatmentSession) =>
  !!session.deleted_at || ['canceled', 'archived'].includes(session.status)
const validId = (id: string) => {
  if (typeof id !== 'string' || !UUID_RE.test(id)) throw httpError(404, 'Check-in not found.')
}
const lockSession = async (tx: Queryable, id: string) => {
  validId(id)
  await tx.query('SELECT id FROM treatment_sessions WHERE id=$1 FOR UPDATE', [id])
  const session = await getTreatmentSession(tx, id)
  if (!session || session.deleted_at) throw httpError(404, 'Session not found.')
  return session
}
const planFor = async (db: string | Queryable, id: string): Promise<TreatmentCheckinPlanBody | null> =>
  (
    await query<{ settings: TreatmentCheckinPlanBody }>(
      db,
      'SELECT settings FROM treatment_checkin_plans WHERE treatment_session_id=$1',
      [id],
    )
  ).rows[0]?.settings ?? null
const notifierFor = (tx: Queryable) =>
  createNotifier({
    getPreference: (_user, type) => getNotificationPreference(tx, type),
    insert: (_user, input) => insertNotification(tx, input),
    prune: (_user, read, any) => pruneNotifications(tx, read, any),
    revise: (_user, target, patch) => reviseNotification(tx, target, patch),
    reviseOpen: (_user, keys, patch) => reviseOpenNotifications(tx, keys, patch),
  })
const retireNotifications = async (tx: Queryable, id: string) => {
  await tx.query(
    `UPDATE notifications SET actions='[]'::jsonb, read_at=COALESCE(read_at,NOW())
    WHERE type='treatment_checkin' AND data->>'checkin_id'=$1`,
    [id],
  )
}
const checkinStatus = (
  row: CheckinRow,
  session: TreatmentSession,
  assessment: Awaited<ReturnType<typeof getAssessment>>,
  now: Date,
): TreatmentCheckin['status'] => {
  return row.assessment_id
    ? assessment && !assessment.deleted_at
      ? 'completed'
      : 'record_removed'
    : row.skipped_at
      ? 'skipped'
      : isClosed(session)
        ? 'canceled'
        : row.expires_at && row.expires_at <= now
          ? 'window_passed'
          : row.kind === 'current' || row.kind === 'reflection'
            ? 'due'
            : !row.due_at || row.due_at > now
              ? 'upcoming'
              : 'due'
}
const serialize = async (
  db: string | Queryable,
  row: CheckinRow,
  session: TreatmentSession,
  plan: TreatmentCheckinPlanBody | null,
  now: Date,
): Promise<TreatmentCheckin> => {
  const assessment = row.assessment_id ? await getAssessment(db, row.assessment_id) : null
  const status = checkinStatus(row, session, assessment, now)
  const answerLabels: Record<string, string> = {}
  if (assessment) {
    const definitions = await query<{ question_id: string; snapshot: { prompt: string } }>(
      db,
      `SELECT v.question_id, v.snapshot FROM assessment_question_versions v JOIN assessment_responses r ON r.question_id=v.question_id AND r.question_version=v.version WHERE r.assessment_id=$1`,
      [assessment.id],
    )
    for (const definition of definitions.rows) {
      answerLabels[definition.question_id] = definition.snapshot.prompt
    }
  }
  return {
    answer_labels: answerLabels,
    id: row.id,
    treatment_session_id: row.treatment_session_id,
    kind: row.kind,
    status,
    due_at: iso(row.due_at),
    expires_at: iso(row.expires_at),
    snoozed_until: iso(row.snoozed_until),
    observed_at: iso(row.observed_at),
    draft: row.draft,
    draft_responses: row.draft_responses,
    questionnaire: row.template_snapshot,
    revision: row.revision,
    assessment: assessment?.deleted_at ? null : assessment,
    personal_goal: plan?.personal_goal ?? '',
    created_at: row.created_at.toISOString(),
  }
}

export const initializeCheckinPlan = async (
  tx: Queryable,
  session: TreatmentSession,
  input: TreatmentCheckinPlanBody,
  now = new Date(),
): Promise<void> => {
  const plan = treatmentCheckinPlanBodySchema.parse(input)
  await tx.query(
    'INSERT INTO treatment_checkin_plans(treatment_session_id, settings) VALUES ($1,$2::jsonb)',
    [session.id, JSON.stringify(plan)],
  )
  const stages: {
    kind: TreatmentCheckin['kind']
    offset?: number
    window?: number
    template?: QuestionnaireTemplate
  }[] = []
  if (plan.before) stages.push({ kind: 'before' })
  if (plan.after) stages.push({ kind: 'after' })
  if (plan.next_day) stages.push({ kind: 'next_day' })
  if (plan.later_hours !== null) stages.push({ kind: 'later', offset: plan.later_hours, window: 24 })
  for (const selected of plan.additional) {
    const template = await getQuestionnaire(tx, selected.template_id)
    if (!template || !template.enabled || template.stable_key === BRIEF_TREATMENT_KEY) {
      throw httpError(400, 'Choose an available questionnaire.')
    }
    stages.push({ kind: 'custom', offset: selected.offset_hours, window: selected.window_hours, template })
  }
  for (const stage of stages) {
    const { due, expires } = checkinWindow(stage.kind, session, stage.offset, stage.window)
    const next = isClosed(session) ? null : initialReminder(due, expires, now, session.timezone, plan)
    await tx.query(
      `INSERT INTO treatment_checkins(treatment_session_id, kind, offset_hours, window_hours, template_snapshot, due_at, expires_at, next_reminder_at, created_at)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)`,
      [
        session.id,
        stage.kind,
        stage.offset ?? null,
        stage.window ?? null,
        stage.template ? JSON.stringify(stage.template) : null,
        due,
        expires,
        next,
        now,
      ],
    )
  }
}

export const refreshCheckinSchedule = async (
  tx: Queryable,
  session: TreatmentSession,
  now = new Date(),
): Promise<void> => {
  const plan = await planFor(tx, session.id)
  if (!plan) return
  const rows = (
    await tx.query<CheckinRow>('SELECT * FROM treatment_checkins WHERE treatment_session_id=$1 FOR UPDATE', [
      session.id,
    ])
  ).rows
  for (const row of rows) {
    if (row.assessment_id || row.skipped_at || ['current', 'reflection'].includes(row.kind)) continue
    const { due, expires } = checkinWindow(row.kind, session, row.offset_hours ?? 0, row.window_hours ?? 24)
    const changed = iso(due) !== iso(row.due_at) || iso(expires) !== iso(row.expires_at)
    if (changed || isClosed(session) || !plan.reminders_enabled) {
      const next =
        isClosed(session) || row.reminder_count >= 2
          ? null
          : initialReminder(due, expires, now, session.timezone, plan)
      await tx.query(
        `UPDATE treatment_checkins SET due_at=$2, expires_at=$3, next_reminder_at=$4, snoozed_until=NULL, updated_at=NOW() WHERE id=$1`,
        [row.id, due, expires, next],
      )
      await retireNotifications(tx, row.id)
    }
  }
}

let schedulerReady = false
export const listTreatmentCheckins = async (user: string, sessionId?: string, now = new Date()) => {
  if (sessionId) validId(sessionId)
  const rows = (
    await query<CheckinRow>(
      user,
      `SELECT c.* FROM treatment_checkins c JOIN treatment_sessions s ON s.id=c.treatment_session_id
    WHERE s.deleted_at IS NULL ${sessionId ? 'AND s.id=$1' : ''} ORDER BY c.created_at DESC, c.due_at, c.id LIMIT 500`,
      sessionId ? [sessionId] : [],
    )
  ).rows
  const sessions = new Map<string, TreatmentSession>()
  const plans = new Map<string, TreatmentCheckinPlanBody | null>()
  for (const id of new Set(rows.map((row) => row.treatment_session_id))) {
    sessions.set(id, (await getTreatmentSession(user, id))!)
    plans.set(id, await planFor(user, id))
  }
  return {
    data: await Promise.all(
      rows.map((row) =>
        serialize(
          user,
          row,
          sessions.get(row.treatment_session_id)!,
          plans.get(row.treatment_session_id) ?? null,
          now,
        ),
      ),
    ),
    plan: sessionId ? await planFor(user, sessionId) : null,
    scheduler_ready: schedulerReady,
  }
}

export const changeCheckinSettings = async (
  user: string,
  sessionId: string,
  input: TreatmentCheckinSettings,
  now = new Date(),
): Promise<void> => {
  const patch = treatmentCheckinSettingsSchema.parse(input)
  await withUserTransaction(user, async (tx) => {
    const session = await lockSession(tx, sessionId)
    const plan = await planFor(tx, sessionId)
    if (!plan) throw httpError(404, 'This session has no reminder plan.')
    const nextPlan = { ...plan, ...patch }
    await tx.query('UPDATE treatment_checkin_plans SET settings=$2::jsonb WHERE treatment_session_id=$1', [
      sessionId,
      JSON.stringify(nextPlan),
    ])
    const rows = (
      await tx.query<CheckinRow>(
        'SELECT * FROM treatment_checkins WHERE treatment_session_id=$1 FOR UPDATE',
        [sessionId],
      )
    ).rows
    for (const row of rows) {
      if (row.assessment_id || row.skipped_at) continue
      const next =
        isClosed(session) || row.reminder_count >= 2
          ? null
          : initialReminder(row.due_at, row.expires_at, now, session.timezone, nextPlan)
      await tx.query('UPDATE treatment_checkins SET next_reminder_at=$2, snoozed_until=NULL WHERE id=$1', [
        row.id,
        next,
      ])
      await retireNotifications(tx, row.id)
    }
  })
}

const withCheckin = async <T>(
  user: string,
  id: string,
  action: (
    tx: Queryable,
    row: CheckinRow,
    session: TreatmentSession,
    plan: TreatmentCheckinPlanBody | null,
  ) => Promise<T>,
): Promise<T> => {
  validId(id)
  return withUserTransaction(user, async (tx) => {
    const found = (await tx.query<CheckinRow>('SELECT * FROM treatment_checkins WHERE id=$1', [id])).rows[0]
    if (!found) throw httpError(404, 'Check-in not found.')
    const session = await lockSession(tx, found.treatment_session_id)
    const row = (await tx.query<CheckinRow>('SELECT * FROM treatment_checkins WHERE id=$1 FOR UPDATE', [id]))
      .rows[0]!
    return action(tx, row, session, await planFor(tx, session.id))
  })
}

export const addTreatmentReflection = async (
  user: string,
  input: AddTreatmentReflection,
  now = new Date(),
): Promise<TreatmentCheckin> => {
  const body = addTreatmentReflectionSchema.parse(input)
  return withUserTransaction(user, async (tx) => {
    const session = await lockSession(tx, body.treatment_session_id)
    if (isClosed(session)) throw httpError(409, 'Reopen this session before adding a check-in.')
    let row = (
      await tx.query<CheckinRow>(
        `SELECT * FROM treatment_checkins WHERE treatment_session_id=$1 AND kind=$2 AND assessment_id IS NULL AND skipped_at IS NULL ORDER BY created_at LIMIT 1`,
        [session.id, body.kind],
      )
    ).rows[0]
    if (!row) {
      row = (
        await tx.query<CheckinRow>(
          `INSERT INTO treatment_checkins(treatment_session_id,kind,created_at) VALUES ($1,$2,$3) RETURNING *`,
          [session.id, body.kind, now],
        )
      ).rows[0]!
    }
    return serialize(tx, row, session, await planFor(tx, session.id), now)
  })
}

const validateOpenEntry = (
  row: CheckinRow,
  session: TreatmentSession,
  body: TreatmentCheckinEntry,
  now: Date,
) => {
  if (row.assessment_id || row.skipped_at || isClosed(session)) {
    throw httpError(409, 'This check-in is closed. Your saved history is unchanged.')
  }
  if (row.revision !== body.revision) {
    throw httpError(409, 'This draft changed elsewhere. Reopen it to load the latest saved version.')
  }
  if (row.expires_at && row.expires_at <= now) {
    throw httpError(409, 'This window has passed. Add a current check-in or a later reflection instead.')
  }
  if (!['current', 'reflection'].includes(row.kind) && (!row.due_at || row.due_at > now)) {
    throw httpError(409, 'This check-in is not due yet.')
  }
}
const observationTime = (row: CheckinRow, body: TreatmentCheckinEntry, now: Date) => {
  const observed = new Date(body.observed_at)
  if (
    observed > now ||
    (row.kind === 'current' && now.getTime() - observed.getTime() > HOUR) ||
    (row.due_at && observed < row.due_at) ||
    (row.expires_at && observed >= row.expires_at)
  ) {
    throw httpError(
      400,
      'Use an observation time within this check-in window. Use a later reflection for memories of another time.',
    )
  }
  return observed
}
export const saveTreatmentCheckin = async (
  user: string,
  id: string,
  input: TreatmentCheckinEntry,
  final: boolean,
  now = new Date(),
): Promise<TreatmentCheckin> => {
  const body = treatmentCheckinEntrySchema.parse(input)
  return withCheckin(user, id, async (tx, row, session, plan) => {
    if (row.assessment_id && final) return serialize(tx, row, session, plan, now)
    validateOpenEntry(row, session, body, now)
    const observed = observationTime(row, body, now)
    const answers = { ...body.answers }
    if (answers.difficulties !== 'some') delete answers.difficulty_detail
    const responses = body.responses ?? []
    if (row.template_snapshot) validateResponses(row.template_snapshot, responses, final)
    else if (final && !Object.values(answers).some((v) => v !== undefined && v !== '')) {
      throw httpError(400, 'Record at least one observation, or skip this check-in.')
    }
    let assessmentId: string | null = null
    if (final) {
      const template = row.template_snapshot ?? (await ensureBriefTemplate(tx))
      const savedResponses = row.template_snapshot
        ? responses
        : template.questions
            .filter(
              (q) =>
                answers[q.stable_key as keyof BriefTreatmentAnswers] !== undefined &&
                answers[q.stable_key as keyof BriefTreatmentAnswers] !== '',
            )
            .map((q) => ({
              question_id: q.id,
              question_version: q.version,
              value: answers[q.stable_key as keyof BriefTreatmentAnswers],
            }))
      const assessment = await createAssessmentInTransaction(
        tx,
        {
          template_id: template.id,
          treatment_session_id: session.id,
          stage:
            row.kind === 'reflection'
              ? 'later_reflection'
              : row.kind === 'current'
                ? 'current_checkin'
                : row.kind,
          assessed_at: body.observed_at,
          timezone: session.timezone,
          responses: savedResponses,
        },
        false,
        template,
      )
      assessmentId = assessment.id
      await retireNotifications(tx, id)
    }
    const updated = (
      await tx.query<CheckinRow>(
        `UPDATE treatment_checkins SET draft=$2::jsonb, draft_responses=$3::jsonb, observed_at=$4,
      revision=revision+1, assessment_id=$5, next_reminder_at=CASE WHEN $5::uuid IS NULL THEN next_reminder_at ELSE NULL END, updated_at=NOW() WHERE id=$1 RETURNING *`,
        [
          id,
          JSON.stringify(final ? {} : answers),
          JSON.stringify(final ? [] : responses),
          observed,
          assessmentId,
        ],
      )
    ).rows[0]!
    return serialize(tx, updated, session, plan, now)
  })
}

export const actOnTreatmentCheckin = async (
  user: string,
  id: string,
  input: TreatmentCheckinAction,
  now = new Date(),
): Promise<TreatmentCheckin> => {
  const body = treatmentCheckinActionSchema.parse(input)
  return withCheckin(user, id, async (tx, row, session, plan) => {
    if (row.assessment_id || row.skipped_at) return serialize(tx, row, session, plan, now)
    if (isClosed(session)) throw httpError(409, 'This session is closed.')
    let until: Date | null = null
    if (body.action === 'snooze') {
      if (
        !plan?.reminders_enabled ||
        !row.due_at ||
        row.due_at > now ||
        !row.expires_at ||
        row.expires_at <= now ||
        row.reminder_count >= 2
      ) {
        throw httpError(
          409,
          'No further reminder is available. You can still complete or skip this check-in.',
        )
      }
      until = afterQuietHours(
        new Date(now.getTime() + (body.snooze_minutes ?? 60) * 60000),
        session.timezone,
        plan,
      )
      if (until >= row.expires_at) throw httpError(409, 'That snooze extends beyond the check-in window.')
    }
    const updated = (
      await tx.query<CheckinRow>(
        `UPDATE treatment_checkins SET skipped_at=$2, snoozed_until=$3, next_reminder_at=$3, revision=revision+1,
      draft=CASE WHEN $2::timestamptz IS NULL THEN draft ELSE '{}'::jsonb END,
      draft_responses=CASE WHEN $2::timestamptz IS NULL THEN draft_responses ELSE '[]'::jsonb END, updated_at=NOW() WHERE id=$1 RETURNING *`,
        [id, body.action === 'skip' ? now : null, until],
      )
    ).rows[0]!
    await retireNotifications(tx, id)
    return serialize(tx, updated, session, plan, now)
  })
}

const canRemind = (
  session: TreatmentSession,
  plan: TreatmentCheckinPlanBody | null,
  row: CheckinRow,
  now: Date,
) =>
  Boolean(
    !isClosed(session) &&
    plan?.reminders_enabled &&
    !row.assessment_id &&
    !row.skipped_at &&
    row.expires_at &&
    row.expires_at > now &&
    row.reminder_count < 2 &&
    now.getTime() - row.next_reminder_at!.getTime() <= HOUR,
  )

const deliverCheckin = async (
  tx: Queryable,
  user: string,
  session: TreatmentSession,
  plan: TreatmentCheckinPlanBody | null,
  row: CheckinRow,
  now: Date,
) => {
  const id = session.id
  let delivered = 0
  let next: Date | null = null
  let count = row.reminder_count
  if (plan && row.expires_at && canRemind(session, plan, row, now)) {
    const quietEnd = afterQuietHours(now, session.timezone, plan)
    if (quietEnd > now) next = quietEnd < row.expires_at ? quietEnd : null
    else {
      const result = await notifierFor(tx).raise(user, {
        type: 'treatment_checkin',
        title: 'A personal check-in is ready',
        body: 'Complete it when ready, snooze, or skip.',
        link: `/treatments?view=journal&treatment=${id}&checkin=${row.id}`,
        data: { checkin_id: row.id },
        dedupe_key: `treatment-checkin:${row.id}:${count}`,
        actions: [
          { key: 'snooze', label: 'Snooze 1 hour' },
          { key: 'skip', label: 'Skip' },
        ],
      })
      if (result) delivered = 1
      count++
      if (count < 2) {
        const followup = afterQuietHours(new Date(now.getTime() + 4 * HOUR), session.timezone, plan)
        if (followup < row.expires_at) next = followup
      }
    }
  }
  await tx.query('UPDATE treatment_checkins SET next_reminder_at=$2, reminder_count=$3 WHERE id=$1', [
    row.id,
    next,
    count,
  ])
  if (!next && ((row.expires_at && row.expires_at <= now) || isClosed(session))) {
    await retireNotifications(tx, row.id)
  }
  return delivered
}
export const deliverTreatmentCheckins = async (user: string, now = new Date()): Promise<number> =>
  withUserTransaction(user, async (tx) => {
    const sessions = (
      await tx.query<{ id: string }>(
        `SELECT s.id FROM treatment_sessions s WHERE EXISTS
    (SELECT 1 FROM treatment_checkins c WHERE c.treatment_session_id=s.id AND c.next_reminder_at <= $1)
    ORDER BY s.id LIMIT 100 FOR UPDATE SKIP LOCKED`,
        [now],
      )
    ).rows
    let delivered = 0
    for (const { id } of sessions) {
      const session = (await getTreatmentSession(tx, id))!
      const plan = await planFor(tx, id)
      const rows = (
        await tx.query<CheckinRow>(
          'SELECT * FROM treatment_checkins WHERE treatment_session_id=$1 AND next_reminder_at <= $2 FOR UPDATE',
          [id, now],
        )
      ).rows
      for (const row of rows) {
        delivered += await deliverCheckin(tx, user, session, plan, row, now)
      }
    }
    // Expired notifications may have no future reminder left; retire their actions too.
    await tx.query(
      `UPDATE notifications n SET actions='[]'::jsonb, read_at=COALESCE(n.read_at,$1) FROM treatment_checkins c
    WHERE n.type='treatment_checkin' AND n.data->>'checkin_id'=c.id::text AND c.expires_at <= $1`,
      [now],
    )
    return delivered
  })

export const createTreatmentCheckinScheduler = async (
  boss: PgBoss,
  listUsers: () => Promise<string[]>,
): Promise<void> => {
  await boss.createQueue('treatment-checkins')
  await boss.schedule('treatment-checkins', '* * * * *')
  await boss.work('treatment-checkins', { batchSize: 1, pollingIntervalSeconds: 10 }, async () => {
    for (const user of await listUsers()) {
      try {
        await deliverTreatmentCheckins(user)
      } catch {
        console.warn('Treatment check-in delivery failed; next tick will retry.')
      }
    }
  })
  schedulerReady = true
}

export const treatmentCheckinActions = {
  list: listTreatmentCheckins,
  settings: changeCheckinSettings,
  add: addTreatmentReflection,
  draft: (user: string, id: string, body: TreatmentCheckinEntry) =>
    saveTreatmentCheckin(user, id, body, false),
  complete: (user: string, id: string, body: TreatmentCheckinEntry) =>
    saveTreatmentCheckin(user, id, body, true),
  action: actOnTreatmentCheckin,
}

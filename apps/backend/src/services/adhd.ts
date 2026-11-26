import {
  adhdCommandBodySchema,
  type AdhdCommand,
  type AdhdCommandBody,
  type AdhdContext,
  type AdhdObservationInput,
  type AdhdObservation,
  type AdhdState,
} from '@aurboda/api-spec'
import { createHash, randomInt, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import type { Queryable } from '../db/pool.ts'

import { getRecord, cas, insert, update, settings, contextCheck, serialize, type Row } from '../db/adhd.ts'
import * as checkDb from '../db/check-ins.ts'
import { withUserTransaction } from '../db/connection.ts'
import * as notificationDb from '../db/notifications.ts'
import { httpError } from '../http-error.ts'
import { inClockWindow, localParts, resolvedWindow, adhdInvitationAllowed } from './adhd-analysis.ts'
import { adhdItems, adhdStrategies, adhdHypotheses } from './adhd-catalog.ts'
import { saveObservation } from './adhd-observations.ts'
import { scopedCheckInDeps } from './check-in-transaction.ts'
import { checkInDeps } from './check-ins.ts'
import { createNotifier } from './notifications.ts'

export interface AdhdDeps {
  transaction: <T>(user: string, fn: (tx: Queryable) => Promise<T>) => Promise<T>
  now: () => Date
  random: () => number
  afterCanonical?: () => Promise<void>
}
const defaults: AdhdDeps = {
  transaction: withUserTransaction,
  now: () => new Date(),
  random: () => randomInt(2),
}
const fail = (status: number, message: string): never => {
  throw httpError(status, message)
}
const zoneValid = (zone: string) => {
  try {
    localParts(new Date(), zone)
  } catch {
    fail(400, 'Choose a valid IANA timezone.')
  }
}
const json = (v: unknown) => JSON.stringify(v)
const stable = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(stable)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, stable(x)]),
        )
      : v
const digest = (v: unknown) =>
  createHash('sha256')
    .update(json(stable(v)))
    .digest('hex')
const iso = (v: Date | string) => new Date(v).toISOString()
const expireClosedAdhdDeliveries = async (tx: Queryable) => {
  await tx.query(
    "UPDATE notification_browser_deliveries d SET status='expired' FROM notifications n WHERE n.id=d.notification_id AND n.type='adhd_prompt' AND n.read_at IS NOT NULL AND d.status='pending'",
  )
}
const closeNotifications = async (tx: Queryable) => {
  await tx.query(
    "UPDATE notifications SET read_at=COALESCE(read_at,NOW()),actions='[]' WHERE type='adhd_prompt'",
  )
  await tx.query(
    "UPDATE adhd_records SET data=jsonb_set(data,'{status}','\"suppressed\"'),revision=revision+1,updated_at=clock_timestamp() WHERE kind='invitation' AND data->>'status' IN ('planned','delivery_attempted','opened','snoozed')",
  )
  await expireClosedAdhdDeliveries(tx)
}
const frozenProtocol = async (tx: Queryable, id: string, now: Date) => {
  const p = await getRecord(tx, id, 'protocol')
  if (p.data.status !== 'active' || now >= new Date(String(p.data.ends_at))) {
    fail(409, 'The pilot is paused or due for review.')
  }
  return p
}
// eslint-disable-next-line complexity -- explicit independent optional measurements and lifecycle states must remain distinct
const opportunityCommand = async (
  tx: Queryable,
  user: string,
  c: Extract<AdhdCommand, { operation: 'opportunity' }>,
  deps: AdhdDeps,
) => {
  const now = deps.now(),
    p = await frozenProtocol(tx, c.protocol_id, now)
  cas(p, c.expected_protocol_revision)
  await contextCheck(tx, c.context)
  const local = localParts(now, String(p.data.timezone))
  const eligible =
    c.availability === 'eligible' && c.ten_minutes && c.safe_interruptible && c.either_acceptable
  if (c.availability === 'eligible' && !eligible) {
    fail(400, 'Confirm a safe opportunity and two acceptable approaches before assignment.')
  }
  if (
    eligible &&
    (!c.context.target || c.context.phase !== (p.data.kind === 'stopping_cue' ? 'ongoing' : 'pre_start'))
  ) {
    fail(400, 'Choose the same target and appropriate phase before assignment.')
  }
  if (eligible && c.context.task_class !== p.data.task_class) fail(400, 'Choose the frozen task class.')
  if (eligible && !inClockWindow(local.clock, String(p.data.awake_start), String(p.data.awake_end))) {
    fail(409, 'Outside the frozen acceptable awake window.')
  }
  const prior = (
    await tx.query<Row>(
      "SELECT * FROM adhd_records WHERE kind='assignment' AND parent_id=$1 ORDER BY created_at,id",
      [p.id],
    )
  ).rows
  if (eligible && prior.some((r) => r.data.local_date === local.date)) {
    fail(409, 'Today already has an assignment. Resume it without rerolling.')
  }
  const index = prior.length,
    mate = index % 2 ? prior[index - 1] : undefined
  const condition = mate
    ? mate.data.condition === 'intervention'
      ? 'usual'
      : 'intervention'
    : deps.random()
      ? 'intervention'
      : 'usual'
  const data: Record<string, unknown> = {
    context: c.context,
    endpoint: c.endpoint,
    local_date: local.date,
    timezone: p.data.timezone,
    offset: local.offset,
    availability: c.availability,
    ten_minutes: c.ten_minutes,
    safe_interruptible: c.safe_interruptible,
    either_acceptable: c.either_acceptable,
    protocol_version: 1,
    estimated_minutes: c.estimated_minutes ?? null,
    phase: c.context.phase,
    accepted: null,
    used: 'unrecorded',
    declined: false,
    ...(eligible
      ? {
          support_snapshot:
            condition === 'usual'
              ? 'Use your usual acceptable approach toward the chosen endpoint.'
              : p.data.kind === 'stopping_cue'
                ? `At the chosen finite endpoint (${c.endpoint}), save your place and stop or explicitly choose again.`
                : `Make the first visible substantive change toward ${c.endpoint}; choose a two-minute end. Opening a timer or planning alone is not starting.`,
          condition,
          assignment_method: 'random_balanced_pairs_v1',
          block_id: Math.floor(index / 2),
          probability_intervention: mate ? (condition === 'intervention' ? 1 : 0) : 0.5,
          assigned_at: now.toISOString(),
        }
      : {}),
  }
  const r = await insert(tx, 'opportunity', data, p.id)
  if (eligible) {
    await insert(
      tx,
      'assignment',
      {
        opportunity_id: r.id,
        local_date: local.date,
        condition,
        assignment_method: data.assignment_method,
        block_id: data.block_id,
        probability_intervention: data.probability_intervention,
        assigned_at: data.assigned_at,
      },
      p.id,
    )
  }
  if (c.baseline) {
    if (
      !isDeepStrictEqual(c.baseline.context, c.context) ||
      c.baseline.expected_instrument_version !== 'adhd_custom_v1' ||
      c.baseline.pack !== (p.data.strain_guardrail ? 'core_strain' : 'core') ||
      c.baseline.sampling !== 'experiment_baseline'
    ) {
      fail(400, 'Baseline must use the frozen target, phase and pack.')
    }
    const id = await saveObservation(tx, user, c.baseline, deps, r.id)
    await update(tx, r, { ...data, pre_observation_id: id })
  }
  await closeNotifications(tx)
  return r.id
}
interface HandlerContext {
  tx: Queryable
  user: string
  deps: AdhdDeps
  pref: Awaited<ReturnType<typeof settings>>
  now: Date
}
const apply_settings = async (
  c: Extract<AdhdCommand, { operation: 'settings' }>,
  context: HandlerContext,
): Promise<string> => {
  const { tx, pref } = context

  cas(pref, c.expected_revision)
  zoneValid(c.settings.timezone)
  if (c.settings.prompt_times.length > c.settings.daily_budget) {
    fail(400, 'Prompt times exceed the chosen daily budget.')
  }
  await tx.query(
    'INSERT INTO adhd_settings(singleton,revision,data) VALUES(true,1,$1) ON CONFLICT(singleton) DO UPDATE SET revision=adhd_settings.revision+1,data=EXCLUDED.data,updated_at=clock_timestamp()',
    [json(c.settings)],
  )
  await closeNotifications(tx)
  const id = randomUUID()

  return id
}

const apply_session = async (
  c: Extract<AdhdCommand, { operation: 'session' }>,
  context: HandlerContext,
): Promise<string> => {
  const { tx, pref, now } = context

  if (pref.data.paused) fail(409, 'Support is paused.')
  await contextCheck(tx, c.context)
  if (!c.context.target) fail(400, 'Choose a target for this optional session.')
  if (c.recipe_id) await getRecord(tx, c.recipe_id, 'recipe')
  const id = (
    await insert(tx, 'opportunity', {
      context: c.context,
      recipe_id: c.recipe_id ?? null,
      endpoint: c.endpoint,
      condition: 'self_chosen',
      availability: 'self_initiated',
      used: c.strategy_id,
      estimated_minutes: c.estimated_minutes ?? null,
      local_date: localParts(now, pref.data.timezone).date,
      assigned_at: now.toISOString(),
      accepted: true,
      declined: false,
    })
  ).id

  return id
}

const apply_protocol = async (
  c: Extract<AdhdCommand, { operation: 'protocol' }>,
  context: HandlerContext,
): Promise<string> => {
  const { tx, pref, now } = context

  if (pref.data.paused) fail(409, 'Resume support before activating a pilot.')
  zoneValid(c.protocol.timezone)
  if (
    (await tx.query("SELECT id FROM adhd_records WHERE kind='protocol' AND data->>'status'='active'"))
      .rowCount
  ) {
    fail(409, 'Pause or review the active pilot first.')
  }
  const hypothesis = c.protocol.hypothesis_id
    ? await getRecord(tx, c.protocol.hypothesis_id, 'hypothesis')
    : null
  const end = Temporal.Instant.from(now.toISOString())
    .toZonedDateTimeISO(c.protocol.timezone)
    .add({ days: c.protocol.days })
    .toInstant()
    .toString()
  const id = (
    await insert(tx, 'protocol', {
      ...c.protocol,
      status: 'active',
      version: 1,
      instrument_version: 'adhd_custom_v1',
      instrument_snapshot: adhdItems,
      hypothesis_version: hypothesis?.revision ?? 1,
      hypothesis_snapshot: hypothesis?.data ?? {
        statement:
          c.protocol.kind === 'prepared_starter'
            ? 'A prepared starter may improve substantive starts for this chosen task class beyond the shared app support.'
            : 'A chosen finite stopping cue may reduce overrun without unacceptable strain or loss of chosen progress.',
        claim: 'causal',
        status: 'Untested',
      },
      novelty_snapshot: pref.data.novelty,
      outcome_snapshot: {
        actual_start_v1:
          'Did the predefined substantive action actually start? Explicit yes/no/unknown, with categorical timing from first display.',
        endpoint_v1: 'Chosen endpoint reached? Yes/partly/no/interrupted/not applicable/unknown.',
        reuse_v1: 'Would you choose this stopping method again? Yes/no/unsure, this completed attempt.',
        overrun_v1: 'Minutes beyond the chosen finite endpoint, self-reported, this completed attempt.',
      },
      guardrail_snapshot: {
        strain: c.protocol.strain_guardrail
          ? 'Review paired same-item strain changes; missing observations cannot pass the guardrail.'
          : 'Not assessed',
        burden_seconds: c.protocol.burden_seconds,
        review: 'No automatic extension; pause/withdraw immediately.',
      },
      baseline_pack: c.protocol.strain_guardrail ? 'core_strain' : 'core',
      assignment_method: 'random_balanced_pairs_v1',
      started_at: now.toISOString(),
      ends_at: end,
      review_at: end,
      primary_outcome:
        c.protocol.kind === 'prepared_starter'
          ? 'Explicit substantive start within five minutes of first displayed condition'
          : 'Self-reported overrun beyond chosen finite endpoint',
      eligibility:
        'Safe interruptible activity, ten available minutes, either method acceptable. No readiness cutoff.',
      maximum_opportunities_per_day: 1,
      measurement_limit: 'Feasibility pilot, not clinical proof. Unknown outcomes remain unrecorded.',
    })
  ).id

  return id
}

const apply_protocol_status = async (
  c: Extract<AdhdCommand, { operation: 'protocol_status' }>,
  context: HandlerContext,
): Promise<string> => {
  const { tx, now } = context

  const r = await getRecord(tx, c.id, 'protocol')
  cas(r, c.expected_revision)
  await update(tx, r, { ...r.data, status: c.status, closed_at: now.toISOString() })
  await closeNotifications(tx)
  const id = r.id

  return id
}

const apply_opportunity = async (
  c: Extract<AdhdCommand, { operation: 'opportunity' }>,
  context: HandlerContext,
): Promise<string> => {
  const { tx, user, deps, pref } = context

  if (pref.data.paused) fail(409, 'Support is paused.')
  const id = await opportunityCommand(tx, user, c, deps)

  return id
}

// eslint-disable-next-line complexity -- mutually independent timing, interruption and strain validations are intentionally explicit
const apply_attempt = async (
  c: Extract<AdhdCommand, { operation: 'expose' | 'method' | 'outcome' }>,
  context: HandlerContext,
): Promise<string> => {
  const { tx, user, deps, pref, now } = context
  let id: string
  const r = await getRecord(tx, c.id, 'opportunity')
  cas(r, c.expected_revision)
  if (!r.data.condition) fail(409, 'This opportunity was not assigned.')
  if (c.operation === 'expose') {
    if (r.parent_id) await frozenProtocol(tx, r.parent_id, now)
    if (pref.data.paused) fail(409, 'Support is paused.')
    if (r.data.action_window_started_at) {
      id = r.id
    } else {
      const displayed = new Date(c.displayed_at),
        assigned = new Date(String(r.data.assigned_at))
      const plausible = displayed >= assigned && displayed.getTime() <= now.getTime() + 5000
      await update(tx, r, {
        ...r.data,
        action_window_started_at: plausible ? displayed.toISOString() : now.toISOString(),
        displayed_at: c.displayed_at,
        exposure_received_at: now.toISOString(),
        exposure_uncertainty: plausible ? c.uncertainty : 'delayed_or_uncertain',
        exposure_delay_ms: now.getTime() - assigned.getTime(),
      })
      id = r.id
    }
  } else if (c.operation === 'method') {
    await update(tx, r, {
      ...r.data,
      accepted: c.accepted,
      used: c.used,
      declined: c.declined,
      starter: c.starter ?? '',
      method_history: [
        ...((r.data.method_history as unknown[]) ?? []),
        { accepted: c.accepted, used: c.used, declined: c.declined, at: now.toISOString() },
      ],
    })
    id = r.id
  } else if (c.operation === 'outcome') {
    if (r.data.outcome) fail(409, 'Outcome already recorded. Delete/correct this attempt explicitly.')
    if (c.within_five_minutes !== 'unknown' && !r.data.action_window_started_at) {
      fail(400, 'An unexposed condition has no measured five-minute window.')
    }
    if (c.start === 'no' && (c.within_five_minutes === 'yes' || c.interruption === 'after_start')) {
      fail(400, 'Start and interruption answers conflict.')
    }
    if (c.start !== 'yes' && c.within_five_minutes === 'yes') {
      fail(400, 'A five-minute start requires an actual start.')
    }
    if (c.started_at && c.ended_at && new Date(c.ended_at) < new Date(c.started_at)) {
      fail(400, 'End precedes start.')
    }
    const p = r.parent_id ? await getRecord(tx, r.parent_id, 'protocol') : null
    let post: string | undefined
    if (c.strain !== undefined) {
      if (!p?.data.strain_guardrail) fail(400, 'Strain was not included in this frozen protocol.')
      post = await saveObservation(
        tx,
        user,
        {
          observed_at: now.toISOString(),
          timezone: String(p?.data.timezone ?? pref.data.timezone),
          precision: 'minute',
          scope: 'current',
          sampling: 'experiment_outcome',
          pack: 'outcome',
          expected_instrument_version: 'adhd_custom_v1',
          context: { ...(r.data.context as AdhdContext), phase: 'after' },
          items: { strain_now_v1: { status: 'answered', value: c.strain } },
          user_tags: [],
        },
        deps,
        r.id,
      )
    }
    const { operation: _op, id: _id, expected_revision: _rev, strain: _strain, ...outcome } = c
    await update(tx, r, {
      ...r.data,
      outcome,
      post_observation_id: post ?? null,
      completed_at: now.toISOString(),
    })
    await closeNotifications(tx)
    id = r.id
  } else return fail(400, 'Unsupported attempt action.')

  return id
}

const apply_hypothesis = async (
  c: Extract<AdhdCommand, { operation: 'hypothesis' }>,
  context: HandlerContext,
): Promise<string> => {
  const { tx } = context
  let id: string

  for (const e of c.hypothesis.evidence) {
    if (e.source === 'observation') {
      if (!(await tx.query('SELECT id FROM adhd_observations WHERE id=$1', [e.id])).rowCount) {
        fail(404, 'Evidence not found.')
      }
    } else if (e.source === 'opportunity') await getRecord(tx, e.id, 'opportunity')
    else {
      const table = e.source === 'journal' ? 'journal_entries' : 'assessments'
      if (!(await tx.query(`SELECT id FROM ${table} WHERE id=$1 AND deleted_at IS NULL`, [e.id])).rowCount) {
        fail(404, 'Evidence not found.')
      }
    }
  }
  if (c.id) {
    const r = await getRecord(tx, c.id, 'hypothesis')
    if (!c.expected_revision) fail(400, 'Expected revision is required.')
    cas(r, c.expected_revision!)
    await update(tx, r, {
      ...c.hypothesis,
      version: r.revision + 1,
      prior_versions: [
        ...((r.data.prior_versions as unknown[]) ?? []),
        { ...r.data, prior_versions: undefined },
      ],
    })
    id = r.id
  } else id = (await insert(tx, 'hypothesis', { ...c.hypothesis, version: 1 })).id

  return id
}

const apply_content = async (
  c: Extract<AdhdCommand, { operation: 'recipe' | 'review' }>,
  context: HandlerContext,
): Promise<string> => {
  const { tx } = context

  const { operation, ...data } = c
  const id = (await insert(tx, operation, data)).id

  return id
}

const apply_invitation = async (
  c: Extract<AdhdCommand, { operation: 'invitation' }>,
  context: HandlerContext,
): Promise<string> => {
  const { tx, pref, now } = context

  const r = await getRecord(tx, c.id, 'invitation')
  cas(r, c.expected_revision)
  if (
    pref.data.paused ||
    new Date(String(r.data.end)) <= now ||
    !['planned', 'delivery_attempted', 'opened', 'snoozed'].includes(String(r.data.status))
  ) {
    fail(409, 'This optional invitation has expired or closed.')
  }
  const status = c.action === 'skip' ? 'explicitly_skipped' : c.action === 'snooze' ? 'snoozed' : 'opened'
  await update(tx, r, {
    ...r.data,
    status,
    ...(c.action === 'snooze'
      ? {
          snoozed_until: new Date(
            Math.min(now.getTime() + 10 * 60000, new Date(String(r.data.end)).getTime()),
          ).toISOString(),
        }
      : {}),
  })
  await tx.query(
    "UPDATE notifications SET read_at=NOW(),actions='[]' WHERE type='adhd_prompt' AND data->>'invitation_id'=$1",
    [r.id],
  )
  const id = r.id

  return id
}

const eraseReferences = (value: unknown, ids: Set<string>): unknown =>
  Array.isArray(value)
    ? value
        .filter(
          (item) =>
            !(
              item &&
              typeof item === 'object' &&
              'source' in item &&
              'id' in item &&
              ids.has(String(item.id).toLowerCase())
            ),
        )
        .map((item) => eraseReferences(item, ids))
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, eraseReferences(item, ids)]))
      : value
const deleteOwnedMetricPoints = async (tx: Queryable, user: string, answerIds: string[]) => {
  const answerForms = (
    await tx.query<{ form_id: string }>(
      'SELECT DISTINCT form_id FROM check_ins WHERE id=ANY($1::uuid[]) ORDER BY form_id',
      [answerIds],
    )
  ).rows
  for (const form of answerForms) {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`check_in_form:${form.form_id}`])
  }
  const canonicalScope = scopedCheckInDeps(checkInDeps, tx)
  for (const answerId of answerIds) {
    const answer = await checkDb.getCheckIn(tx, answerId)
    if (answer) {
      canonicalScope.setResponseOwner?.(answer.id)
      await canonicalScope.deletePoints(user, Object.values(answer.logged))
    }
  }
}
const apply_delete = async (
  c: Extract<AdhdCommand, { operation: 'delete' }>,
  context: HandlerContext,
): Promise<string> => {
  const { tx, user } = context
  let recordIds: string[] = []
  if (c.kind !== 'observation') {
    const record = await getRecord(tx, c.id, c.kind)
    cas(record, c.expected_revision)
    recordIds = (
      await tx.query<{ id: string }>(
        `
      WITH RECURSIVE tree AS (
        SELECT id FROM adhd_records WHERE id=$1 OR ($2::boolean AND kind='opportunity' AND lower(data->>'recipe_id')=lower($1::text))
        UNION SELECT child.id FROM adhd_records child JOIN tree ON child.parent_id=tree.id
      ) SELECT id FROM tree`,
        [c.id, c.kind === 'recipe'],
      )
    ).rows.map((row) => row.id)
  }
  const observations = (
    await tx.query<{ id: string; answer_id: string; revision: number }>(
      'SELECT id,answer_id,revision FROM adhd_observations WHERE id=$1::uuid OR parent_id=ANY($2::uuid[]) FOR UPDATE',
      [c.kind === 'observation' ? c.id : null, recordIds],
    )
  ).rows
  if (c.kind === 'observation') {
    const observation = observations[0] ?? fail(404, 'Observation not found.')
    cas(observation, c.expected_revision)
  }
  const deletedIds = new Set(
    [c.id, ...recordIds, ...observations.map((row) => row.id)].map((id) => id.toLowerCase()),
  )
  const answerIds = observations.map((row) => row.answer_id)
  await deleteOwnedMetricPoints(tx, user, answerIds)
  await tx.query('DELETE FROM check_in_requests WHERE response_id=ANY($1::uuid[])', [answerIds])
  await tx.query('DELETE FROM check_ins WHERE id=ANY($1::uuid[])', [answerIds])
  await tx.query('DELETE FROM adhd_records WHERE id=ANY($1::uuid[])', [recordIds])
  if (c.kind === 'hypothesis') {
    await tx.query(
      "UPDATE adhd_records SET data=data-'hypothesis_snapshot'-'hypothesis_id'-'hypothesis_version',revision=revision+1,updated_at=clock_timestamp() WHERE kind='protocol' AND lower(data->>'hypothesis_id')=lower($1::text)",
      [c.id],
    )
  }
  // Scrub typed references in current/history hypotheses and frozen protocol snapshots together.
  const remaining = (
    await tx.query<Row>(
      "SELECT * FROM adhd_records WHERE kind IN ('hypothesis','protocol','opportunity') FOR UPDATE",
    )
  ).rows
  for (const record of remaining) {
    let clean = eraseReferences(record.data, deletedIds) as Record<string, unknown>
    for (const link of ['pre_observation_id', 'post_observation_id']) {
      if (deletedIds.has(String(clean[link]).toLowerCase())) {
        clean = { ...clean }
        delete clean[link]
        if (link === 'post_observation_id' && clean.outcome && typeof clean.outcome === 'object') {
          const { strain: _legacyStrain, ...outcome } = clean.outcome as Record<string, unknown>
          clean.outcome = outcome
        }
      }
    }
    if (!isDeepStrictEqual(clean, record.data)) await update(tx, record, clean)
  }
  await closeNotifications(tx)
  return c.id
}

const applyCommand = (c: AdhdCommand, context: HandlerContext): Promise<string> => {
  switch (c.operation) {
    case 'observe':
      return saveObservation(context.tx, context.user, c.observation, context.deps)
    case 'settings':
      return apply_settings(c, context)
    case 'session':
      return apply_session(c, context)
    case 'protocol':
      return apply_protocol(c, context)
    case 'protocol_status':
      return apply_protocol_status(c, context)
    case 'opportunity':
      return apply_opportunity(c, context)
    case 'expose':
    case 'method':
    case 'outcome':
      return apply_attempt(c, context)
    case 'hypothesis':
      return apply_hypothesis(c, context)
    case 'recipe':
    case 'review':
      return apply_content(c, context)
    case 'invitation':
      return apply_invitation(c, context)
    case 'delete':
      return apply_delete(c, context)
  }
}

export const createAdhdService = (overrides: Partial<AdhdDeps> = {}) => {
  const deps = { ...defaults, ...overrides }
  const locked = <T>(user: string, fn: (tx: Queryable) => Promise<T>) =>
    deps.transaction(user, async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtext('adhd-account-v1'))")
      return fn(tx)
    })
  const command = async (user: string, raw: AdhdCommandBody) => {
    const body = adhdCommandBodySchema.parse(raw),
      c = body.command
    return locked(user, async (tx) => {
      const old = (
        await tx.query<{ payload_hash: string; result_id: string }>(
          'SELECT payload_hash,result_id FROM adhd_commands WHERE request_id=$1',
          [body.request_id],
        )
      ).rows[0]
      if (old) {
        if (old.payload_hash !== digest(c)) fail(409, 'This request ID already belongs to different content.')
        return old.result_id
      }
      const pref = await settings(tx),
        now = deps.now()
      const id = await applyCommand(c, { tx, user, deps, pref, now })
      await tx.query(
        'INSERT INTO adhd_commands(request_id,operation,payload_hash,result_id) VALUES($1,$2,$3,$4)',
        [body.request_id, c.operation, digest(c), id],
      )
      return id
    })
  }
  const state = async (user: string): Promise<AdhdState> =>
    locked(user, async (tx) => {
      const pref = await settings(tx)
      const records = (
        await tx.query<Row>('SELECT * FROM adhd_records ORDER BY created_at DESC,id')
      ).rows.map(serialize)
      const opportunityIds = new Set(
        records.filter((record) => record.kind === 'opportunity').map((record) => record.id),
      )
      for (const reservation of records.filter((record) => record.kind === 'assignment')) {
        const opportunityId = String(reservation.data.opportunity_id)
        if (!opportunityIds.has(opportunityId)) {
          records.push({
            ...reservation,
            id: opportunityId,
            kind: 'opportunity',
            data: { ...reservation.data, deleted_content: true },
          })
        }
      }
      const rows = (
        await tx.query<{
          id: string
          revision: number
          answer_id: string
          metadata: AdhdObservationInput
          recorded_at: Date
          answers: AdhdObservation['answers']
          metric_outputs: NonNullable<AdhdObservation['metric_outputs']>
        }>(
          `SELECT m.*,c.answers,c.logged AS metric_outputs FROM adhd_observations m JOIN check_ins c ON c.id=m.answer_id WHERE c.deleted_at IS NULL ORDER BY c.answered_at DESC,c.id`,
        )
      ).rows
      const legacy = (
        await tx.query<{
          id: string
          template_id: string
          template_version: number
          assessed_at: Date
          answers: Record<string, unknown>
        }>(
          `SELECT a.id,a.template_id,a.template_version,a.assessed_at,COALESCE(jsonb_object_agg(r.question_id::text,jsonb_build_object('question_version',r.question_version,'value',r.value)) FILTER(WHERE r.id IS NOT NULL),'{}') AS answers FROM assessments a LEFT JOIN assessment_responses r ON r.assessment_id=a.id WHERE a.deleted_at IS NULL GROUP BY a.id ORDER BY a.assessed_at DESC`,
        )
      ).rows.map((r) => ({
        source: 'legacy_assessment',
        id: r.id,
        template_id: r.template_id,
        version: r.template_version,
        observed_at: iso(r.assessed_at),
        time_scope: 'Legacy scope/anchors unreviewed; excluded from new momentary/hour summaries.',
        answers: r.answers,
      }))
      return {
        settings: pref.data,
        settings_revision: pref.revision,
        records,
        observations: rows.map((r) => ({
          ...r.metadata,
          id: r.id,
          answer_id: r.answer_id,
          revision: r.revision,
          recorded_at: iso(r.recorded_at),
          items: Object.fromEntries(
            Object.entries(r.metadata.items).map(([key, item]) => [
              key,
              { ...item, ...(Object.hasOwn(r.answers, key) ? { value: r.answers[key] } : {}) },
            ]),
          ),
          answers: r.answers,
          metric_outputs: r.metric_outputs,
        })),
        legacy,
        items: adhdItems,
        strategies: adhdStrategies,
        hypotheses: adhdHypotheses,
      }
    })
  return { command, state, locked, deps }
}
export const adhdService = createAdhdService()

// eslint-disable-next-line complexity -- explicit independent optional measurements and lifecycle states must remain distinct
export const enqueueAdhdReminders = async (user: string, now = new Date()) =>
  adhdService.locked(
    user,
    // eslint-disable-next-line complexity -- bounded reminder lifecycle rechecks quiet windows, expiry and suppression under one lock
    async (tx) => {
      const pref = await settings(tx),
        s = pref.data
      if (s.paused || !s.reminders_enabled) {
        await closeNotifications(tx)
        return
      }
      const local = localParts(now, s.timezone)
      const records = (
        await tx.query<Row>(
          "SELECT * FROM adhd_records WHERE kind IN ('protocol','opportunity','invitation')",
        )
      ).rows
      const active = records.find(
        (r) => r.kind === 'protocol' && r.data.status === 'active' && new Date(String(r.data.ends_at)) > now,
      )
      for (const invitation of records.filter(
        (record) =>
          record.kind === 'invitation' &&
          ['planned', 'delivery_attempted', 'opened', 'snoozed'].includes(String(record.data.status)),
      )) {
        const expired = new Date(String(invitation.data.end)) <= now
        const constraints = {
          awake_timezone: active?.data.timezone,
          awake_start: active?.data.awake_start,
          awake_end: active?.data.awake_end,
          protocol_ends_at: active?.data.ends_at,
          ...invitation.data,
        }
        if (
          expired ||
          (now >= new Date(String(invitation.data.start)) && !adhdInvitationAllowed(s, constraints, now))
        ) {
          await update(tx, invitation, {
            ...invitation.data,
            status: expired ? 'expired_unrecorded' : 'suppressed',
          })
        }
      }
      await tx.query(
        "UPDATE notifications n SET read_at=COALESCE(read_at,NOW()),actions='[]' FROM adhd_records r WHERE n.type='adhd_prompt' AND n.data->>'invitation_id'=r.id::text AND (r.data->>'status' IN ('expired_unrecorded','suppressed','completed','explicitly_skipped') OR (r.data->>'end')::timestamptz<=$1)",
        [now],
      )
      await expireClosedAdhdDeliveries(tx)
      const hasAttempt = records.some(
        (r) => r.kind === 'opportunity' && r.data.local_date === local.date && r.data.condition,
      )
      const usedContacts = hasAttempt ? 2 : 0
      for (const clock of s.prompt_times.slice(0, Math.max(0, s.daily_budget - usedContacts))) {
        if (inClockWindow(clock, s.quiet_start, s.quiet_end)) continue
        const window = resolvedWindow(local.date, clock, s.timezone)
        if (!window) continue
        if (
          active &&
          !inClockWindow(
            localParts(new Date(window.start), String(active.data.timezone)).clock,
            String(active.data.awake_start),
            String(active.data.awake_end),
          )
        ) {
          continue
        }
        const slot_key = `${local.date}:${clock}:${s.timezone}`
        let r = records.find(
          (candidate) => candidate.kind === 'invitation' && candidate.data.slot_key === slot_key,
        )
        if (r) r = await getRecord(tx, r.id, 'invitation')
        if (!r) {
          r = await insert(
            tx,
            'invitation',
            {
              ...window,
              local_date: local.date,
              local_time: clock,
              timezone: s.timezone,
              status: new Date(window.end) <= now ? 'expired_unrecorded' : 'planned',
              slot_key,
              channel: 'in_app_browser_push',
              preference_revision: pref.revision,
              protocol_id: active?.id ?? null,
              awake_timezone: active?.data.timezone,
              awake_start: active?.data.awake_start,
              awake_end: active?.data.awake_end,
              protocol_ends_at: active?.data.ends_at,
            },
            active?.id ?? null,
          )
        }
        if (
          !['planned', 'snoozed'].includes(String(r.data.status)) ||
          now < new Date(window.start) ||
          now >= new Date(window.end) ||
          (r.data.snoozed_until && now < new Date(String(r.data.snoozed_until)))
        ) {
          continue
        }
        const constraints = {
          awake_timezone: active?.data.timezone,
          awake_start: active?.data.awake_start,
          awake_end: active?.data.awake_end,
          protocol_ends_at: active?.data.ends_at,
          ...r.data,
        }
        if (!adhdInvitationAllowed(s, constraints, now)) {
          await update(tx, r, { ...r.data, status: 'suppressed' })
          await tx.query(
            "UPDATE notifications SET read_at=COALESCE(read_at,$2),actions='[]' WHERE type='adhd_prompt' AND data->>'invitation_id'=$1",
            [r.id, now],
          )
          await expireClosedAdhdDeliveries(tx)
          continue
        }
        // Never catch up after a late coordinator tick; only the current bounded slot is eligible.
        const notifier = createNotifier({
          getPreference: (_u, t) => notificationDb.getNotificationPreference(tx, t),
          insert: (_u, i) => notificationDb.insertNotification(tx, i),
          prune: (_u, read, any) => notificationDb.pruneNotifications(tx, read, any),
          revise: (_u, t, p) => notificationDb.reviseNotification(tx, t, p),
          reviseOpen: (_u, k, p) => notificationDb.reviseOpenNotifications(tx, k, p),
        })
        await notifier.raise(user, {
          type: 'adhd_prompt',
          title: 'Optional check-in',
          body: 'A brief reflection is available. You may skip it.',
          link: '/adhd',
          data: { invitation_id: r.id },
          dedupe_key: `adhd:${r.id}:${r.revision}`,
        })
        await update(tx, r, {
          ...r.data,
          status: 'delivery_attempted',
          attempted_at: now.toISOString(),
          delivery_note: 'Stored notification; delivery/opening unverified.',
        })
      }
    },
  )

export const maySendAdhdNotification = async (user: string, notificationId: string, now: Date) =>
  adhdService.locked(user, async (tx) => {
    const notification = (
      await tx.query<{ read_at: Date | null; data: Record<string, unknown> }>(
        "SELECT read_at,data FROM notifications WHERE id=$1 AND type='adhd_prompt' FOR UPDATE",
        [notificationId],
      )
    ).rows[0]
    if (!notification) return false
    const invitation = (
      await tx.query<Row>("SELECT * FROM adhd_records WHERE id=$1 AND kind='invitation' FOR UPDATE", [
        notification.data.invitation_id,
      ])
    ).rows[0]
    const pref = await settings(tx)
    let open =
      !!invitation &&
      !notification.read_at &&
      ['delivery_attempted', 'opened', 'snoozed'].includes(String(invitation.data.status)) &&
      adhdInvitationAllowed(pref.data, invitation.data, now)
    if (open && invitation.data.protocol_id) {
      const protocol = (
        await tx.query<Row>("SELECT * FROM adhd_records WHERE id=$1 AND kind='protocol'", [
          invitation.data.protocol_id,
        ])
      ).rows[0]
      open =
        !!protocol &&
        protocol.data.status === 'active' &&
        new Date(String(protocol.data.ends_at)) > now &&
        inClockWindow(
          localParts(now, String(protocol.data.timezone)).clock,
          String(protocol.data.awake_start),
          String(protocol.data.awake_end),
        )
    }
    if (!open) {
      if (
        invitation &&
        ['planned', 'delivery_attempted', 'opened', 'snoozed'].includes(String(invitation.data.status))
      ) {
        await update(tx, invitation, {
          ...invitation.data,
          status: new Date(String(invitation.data.end)) <= now ? 'expired_unrecorded' : 'suppressed',
        })
      }
      await tx.query("UPDATE notifications SET read_at=COALESCE(read_at,$2),actions='[]' WHERE id=$1", [
        notificationId,
        now,
      ])
      await expireClosedAdhdDeliveries(tx)
    }
    return open
  })

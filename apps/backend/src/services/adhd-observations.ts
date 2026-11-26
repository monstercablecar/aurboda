import type { AdhdObservationInput, CheckInQuestion } from '@aurboda/api-spec'

import type { Queryable } from '../db/pool.ts'
import type { AdhdDeps } from './adhd.ts'

import { contextCheck, getRecord, update } from '../db/adhd.ts'
import * as checkDb from '../db/check-ins.ts'
import { httpError } from '../http-error.ts'
import { localParts } from './adhd-analysis.ts'
import { adhdItems } from './adhd-catalog.ts'
import { scopedCheckInDeps } from './check-in-transaction.ts'
import { checkInDeps, submitCheckInLocked } from './check-ins.ts'
const fail = (status: number, message: string): never => {
  throw httpError(status, message)
}
const json = (value: unknown) => JSON.stringify(value)
const zoneValid = (zone: string) => {
  try {
    localParts(new Date(), zone)
  } catch {
    fail(400, 'Choose a valid IANA timezone.')
  }
}
const baseIds = ['energy_now_v1', 'clarity_now_v1', 'target_interest_v1', 'target_start_ease_v1']
export const packIds = (pack: AdhdObservationInput['pack']) =>
  pack === 'tiny_state'
    ? baseIds.slice(0, 2)
    : pack === 'tiny_task'
      ? baseIds.slice(2)
      : pack === 'full'
        ? [...baseIds, 'strain_now_v1', 'pleasantness_now_v1']
        : pack === 'core_strain'
          ? [...baseIds, 'strain_now_v1']
          : pack === 'outcome'
            ? ['strain_now_v1']
            : pack === 'focused'
              ? adhdItems.map((i) => i.id)
              : baseIds
// eslint-disable-next-line complexity -- explicit independent optional measurements and lifecycle states must remain distinct
export const normalizeObservation = (input: AdhdObservationInput) => {
  zoneValid(input.timezone)
  if (input.context.phase === 'none' && input.context.target) fail(400, 'Choose the target phase.')
  const ids = packIds(input.pack),
    answers: Record<string, number | boolean | string> = {},
    items: AdhdObservationInput['items'] = {}
  for (const key of Object.keys(input.items)) {
    if (!adhdItems.some((i) => i.id === key)) fail(400, 'Unknown instrument item/version.')
  }
  for (const item of adhdItems) {
    const supplied = input.items[item.id]
    let status: 'not_asked' | 'not_applicable' | 'skipped' = ids.includes(item.id) ? 'skipped' : 'not_asked'
    if (
      (item.id.startsWith('target_') ||
        ['agency_v1', 'demand_v1', 'next_action_v1', 'creative_appetite_v1'].includes(item.id)) &&
      !input.context.target
    ) {
      status = 'not_applicable'
    }
    if (item.id === 'target_start_ease_v1' && input.context.phase !== 'pre_start') status = 'not_applicable'
    if (item.id === 'switching_v1' && !['ongoing', 'after'].includes(input.context.phase)) {
      status = 'not_applicable'
    }
    if (supplied?.status === 'answered') {
      if (status === 'not_asked' || status === 'not_applicable') {
        fail(400, 'This item is not applicable to this pack/phase.')
      }
      if (
        typeof supplied.value !== 'number' ||
        !Number.isInteger(supplied.value) ||
        supplied.value < 1 ||
        supplied.value > item.anchors.length
      ) {
        fail(400, 'Answer outside the frozen anchors.')
      }
      answers[item.id] = supplied.value as number
      items[item.id] = { status: 'answered' }
    } else {
      items[item.id] = {
        status: status === 'skipped' && supplied?.status === 'not_applicable' ? 'not_applicable' : status,
      }
    }
  }
  return { ...input, items, answers }
}
const registerMetricDefinitions = async (
  tx: Queryable,
  answers: Record<string, unknown>,
  metricFor: (id: string) => string,
  reflection: boolean,
) => {
  for (const item of adhdItems.filter((candidate) => Object.hasOwn(answers, candidate.id))) {
    const metric = metricFor(item.id),
      description = `ADHD · ${item.construct} · ${item.recall}. ${item.anchors.map((anchor, index) => `${index + 1} ${anchor}`).join('; ')}. Version ${item.version}.${reflection ? ' Reflection/day appraisal or uncertain timing; separate from momentary observations.' : ' Momentary observation.'}`
    await tx.query(
      "INSERT INTO custom_metrics(name,unit,description,min_value,max_value,aggregation,better) VALUES($1,'score',$2,1,$3,'avg','neutral') ON CONFLICT(name) DO NOTHING",
      [metric, description, item.anchors.length],
    )
    const definition = (
      await tx.query<{ unit: string }>('SELECT unit FROM custom_metrics WHERE name=$1', [metric])
    ).rows[0]
    if (definition?.unit !== 'score') {
      fail(409, 'The ADHD metric name already has a different unit. Resolve its definition before saving.')
    }
  }
}
export const saveObservation = async (
  tx: Queryable,
  user: string,
  input: AdhdObservationInput,
  deps: AdhdDeps,
  parent: string | null = null,
) => {
  await contextCheck(tx, input.context)
  const normalized = normalizeObservation(input),
    { answers, ...rawMetadata } = normalized
  const metadata = {
    ...rawMetadata,
    original_offset: localParts(new Date(input.observed_at), input.timezone).offset,
  }
  const outputsEnabled = true
  const reflection =
    input.scope !== 'current' ||
    input.precision !== 'minute' ||
    ['retrospective', 'imported'].includes(input.sampling)
  const metricFor = (id: string) => `adhd_${id}${reflection ? '_reflection' : ''}`
  const name = `ADHD v1 metrics ${reflection ? 'reflection ' : ''}${input.pack}`
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`check_in_form:${name}`])
  let form = (
    await tx.query<{ id: string }>("SELECT id FROM check_in_forms WHERE owner_scope='adhd' AND name=$1", [
      name,
    ])
  ).rows[0]
  if (!form) {
    const questions: CheckInQuestion[] = adhdItems.map((i) => ({
      key: i.id,
      prompt: i.prompt,
      type: 'scale',
      min: 1,
      max: i.anchors.length,
      required: false,
      logs_to: { metric: metricFor(i.id) },
    }))
    const added = await checkDb.insertCheckInForm(tx, {
      name,
      description: 'Managed immutable ADHD instrument v1',
      questions,
      score: null,
      schedule: null,
      schedule_not_before: deps.now(),
      notify: false,
      outputs_enabled: outputsEnabled,
    })
    await tx.query("UPDATE check_in_forms SET owner_scope='adhd',archived=true WHERE id=$1", [added.id])
    form = added
  }
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`check_in_form:${form.id}`])
  await registerMetricDefinitions(tx, answers, metricFor, reflection)
  const result = await submitCheckInLocked(
    scopedCheckInDeps(checkInDeps, tx),
    user,
    { form_id: form.id, answers, answered_at: input.observed_at, status: 'answered' },
    { scope: 'adhd', expected_version: 1, expected_outputs_enabled: outputsEnabled },
  )
  if (!result.ok) return fail(result.status, result.error)
  await deps.afterCanonical?.()
  const row = (
    await tx.query<{ id: string }>(
      'INSERT INTO adhd_observations(answer_id,parent_id,metadata) VALUES($1,$2,$3) RETURNING id',
      [result.value.id, parent, json(metadata)],
    )
  ).rows[0]!
  if (input.invitation_id) {
    const invite = await getRecord(tx, input.invitation_id, 'invitation')
    if (
      !['planned', 'delivery_attempted', 'opened', 'snoozed'].includes(String(invite.data.status)) ||
      new Date(String(invite.data.end)) < deps.now()
    ) {
      fail(409, 'This invitation is no longer open; save a self-initiated observation instead.')
    }
    await update(tx, invite, { ...invite.data, status: 'completed', response_id: row.id })
    await tx.query(
      "UPDATE notifications SET read_at=NOW(),actions='[]' WHERE type='adhd_prompt' AND data->>'invitation_id'=$1",
      [invite.id],
    )
  }
  return row.id
}

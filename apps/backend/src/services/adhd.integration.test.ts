import type { AdhdCommand, AdhdObservationInput, AdhdProtocolInput } from '@aurboda/api-spec'

import { adhdResponseSchema, adhdItemsSchema } from '@aurboda/api-spec'
import express from 'express'
import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { Client } from 'pg'
import supertest from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, test, inject } from 'vitest'

import { saveBrowserPush } from '../db/browser-push.ts'
import * as checkDb from '../db/check-ins.ts'
import { query, _setDbForUser, migrateSchema } from '../db/connection.ts'
import { createRolePool } from '../db/pool.ts'
import { createAdhdRouter } from '../routes/adhd-router.ts'
import { createTableStatements, tableCreationOrder } from '../schema.ts'
import {
  getTestUser,
  startTestDb,
  stopTestDb,
  cleanTestDb,
  createTestDatabase,
  getTestConnectionUri,
} from '../test/db-test-helper.ts'
import { hourCoverage, resolvedWindow, armSummary, inClockWindow } from './adhd-analysis.ts'
import { createAdhdService, enqueueAdhdReminders } from './adhd.ts'
import {
  checkInDeps,
  getCheckInFormById,
  updateCheckInById,
  deleteCheckInById,
  restoreCheckInById,
  submitCheckIn,
  deleteCheckInFormById,
  restoreCheckInFormById,
  updateCheckInFormById,
} from './check-ins.ts'
import { pgDumpArgs } from './export-dump.ts'
import { deliverBrowserNotifications } from './notification-coordinator.ts'
import { isMutatingMcpTool } from './usage-channel.ts'

const input: AdhdObservationInput = {
  observed_at: '2026-11-25T19:00:00Z',
  timezone: 'America/Denver',
  precision: 'minute',
  scope: 'current',
  sampling: 'self_initiated',
  pack: 'core',
  expected_instrument_version: 'adhd_custom_v1',
  context: {
    target: 'Synthetic paragraph',
    phase: 'pre_start',
    task_class: 'writing',
    context: 'work',
    main_sleep_confirmed: false,
  },
  items: {
    energy_now_v1: { status: 'answered', value: 1 },
    clarity_now_v1: { status: 'answered', value: 5 },
    target_interest_v1: { status: 'answered', value: 5 },
    target_start_ease_v1: { status: 'answered', value: 1 },
  },
  user_tags: [],
}
const plan: AdhdProtocolInput = {
  kind: 'prepared_starter',
  task_class: 'writing',
  timezone: 'America/Denver',
  days: 7,
  awake_start: '09:00',
  awake_end: '20:00',
  benefit_threshold: 2,
  strain_guardrail: true,
  acceptable_conditions: true,
  burden_seconds: 60,
}
let now = new Date(input.observed_at)
const service = createAdhdService({ now: () => now, random: () => 1 }),
  user = getTestUser()
const send = (command: AdhdCommand, request_id = randomUUID()) =>
  service.command(user, { command, request_id })
const count = async (table: string) =>
  Number((await query(user, `SELECT count(*)::int AS n FROM ${table}`)).rows[0].n)
const attempt = async (protocol_id: string, baseline?: AdhdObservationInput) =>
  send({
    operation: 'opportunity',
    protocol_id,
    expected_protocol_revision: 1,
    context: input.context,
    endpoint: 'One useful sentence',
    ten_minutes: true,
    safe_interruptible: true,
    either_acceptable: true,
    availability: 'eligible',
    ...(baseline ? { baseline } : {}),
  })

describe('ADHD real account PostgreSQL', () => {
  beforeAll(startTestDb, 120000)
  afterAll(stopTestDb)
  beforeEach(async () => {
    await cleanTestDb()
    await query(user, 'TRUNCATE browser_push_subscriptions CASCADE')
    await query(user, 'TRUNCATE adhd_records,adhd_observations,adhd_commands,adhd_settings CASCADE')
    now = new Date(input.observed_at)
  })
  test('canonical answers, typed missingness, same-target phase, owned private metrics and scope isolation', async () => {
    await send({ operation: 'observe', observation: input })
    const state = await service.state(user),
      o = state.observations[0]
    expect(adhdResponseSchema.safeParse({ success: true, data: state }).success).toBe(true)
    expect(o.answers).toMatchObject({ energy_now_v1: 1, target_interest_v1: 5, target_start_ease_v1: 1 })
    expect(o.items.pleasantness_now_v1.status).toBe('not_asked')
    expect(o.context.target).toBe(input.context.target)
    expect(await count('time_series')).toBe(4)
    expect(await count('check_in_metric_outputs')).toBe(4)
    expect(await checkDb.listCheckInForms(user)).toHaveLength(0)
    expect(await checkDb.listCheckIns(user, { limit: 10 })).toHaveLength(0)
    const answer = await checkDb.getCheckIn(user, o.answer_id)
    expect(answer?.outputs_enabled).toBe(true)
    const form = answer!.form_id
    expect(await getCheckInFormById(checkInDeps, user, form)).toBeNull()
    expect((await updateCheckInFormById(checkInDeps, user, form, { outputs_enabled: true })).ok).toBe(false)
    expect(await deleteCheckInFormById(checkInDeps, user, form)).toBeNull()
    expect(await restoreCheckInFormById(checkInDeps, user, form)).toBeNull()
    expect(await deleteCheckInById(checkInDeps, user, o.answer_id)).toBeNull()
    expect((await restoreCheckInById(checkInDeps, user, o.answer_id)).ok).toBe(false)
    expect(
      (await updateCheckInById(checkInDeps, user, o.answer_id, { answers: { energy_now_v1: 5 } })).ok,
    ).toBe(false)
    expect(
      (await submitCheckIn(checkInDeps, user, { form_id: form, answers: {}, status: 'answered' })).ok,
    ).toBe(false)
    await expect(
      send({
        operation: 'observe',
        observation: { ...input, context: { ...input.context, phase: 'ongoing' } },
      }),
    ).rejects.toThrow('not applicable')
    await send({
      operation: 'observe',
      observation: {
        ...input,
        observed_at: '2026-11-25T19:01:00Z',
        context: { ...input.context, phase: 'ongoing' },
        items: { energy_now_v1: { status: 'answered', value: 2 } },
      },
    })
    expect(
      (await service.state(user)).observations.find((candidate) => candidate.context.phase === 'ongoing')!
        .items.target_start_ease_v1.status,
    ).toBe('not_applicable')
    expect(
      adhdItemsSchema.parse({
        zero: { status: 'answered', value: 0 },
        no: { status: 'answered', value: false },
      }),
    ).toMatchObject({ zero: { value: 0 }, no: { value: false } })
  }, 60000)
  test('historical disabled snapshots remain immutable; new numeric answers use normal metrics, skips do not', async () => {
    // A pre-metric managed form/answer is a legacy fixture, never rewritten or projected.
    const form = await checkDb.insertCheckInForm(user, {
      name: 'ADHD private v1 core',
      description: null,
      questions: [{ key: 'energy_now_v1', prompt: 'Energy', type: 'scale', min: 1, max: 5, required: false }],
      score: null,
      schedule: null,
      schedule_not_before: now,
      notify: false,
      outputs_enabled: false,
    })
    await query(user, "UPDATE check_in_forms SET owner_scope='adhd',archived=true WHERE id=$1", [form.id])
    const disabled = await checkDb.insertCheckIn(user, {
      form_id: form.id,
      form_version: 1,
      status: 'answered',
      answered_at: now,
      scheduled_for: null,
      answers: { energy_now_v1: 1 },
      logged: {},
      activity_ids: {},
      entity_type: null,
      entity_id: null,
      note: null,
      outputs_enabled: false,
    })
    await send({
      operation: 'observe',
      observation: {
        ...input,
        observed_at: '2026-11-25T19:01:00Z',
        items: { energy_now_v1: { status: 'answered', value: 2 } },
      },
    })
    await send({
      operation: 'observe',
      observation: {
        ...input,
        scope: 'retrospective',
        items: { energy_now_v1: { status: 'answered', value: 3 } },
      },
    })
    expect(await count('time_series')).toBe(2)
    const points = (await query(user, 'SELECT metric,value FROM time_series ORDER BY metric')).rows
    expect(points).toEqual([
      { metric: 'adhd_energy_now_v1', value: 2 },
      { metric: 'adhd_energy_now_v1_reflection', value: 3 },
    ])
    expect((await checkDb.getCheckIn(user, disabled.id))?.outputs_enabled).toBe(false)
    expect(await count('activities')).toBe(0)
  }, 60000)
  test('metric collision rolls the whole observation back and deleting an independently edited point preserves it', async () => {
    const id = await send({ operation: 'observe', observation: input })
    await expect(send({ operation: 'observe', observation: input })).rejects.toThrow()
    expect(await count('check_ins')).toBe(1)
    expect(await count('adhd_observations')).toBe(1)
    expect(await count('time_series')).toBe(4)
    await query(
      user,
      "UPDATE time_series SET value=3,updated_at=updated_at+interval '1 second' WHERE metric='adhd_energy_now_v1'",
    )
    await send({ operation: 'delete', kind: 'observation', id, expected_revision: 1 })
    expect(await count('check_ins')).toBe(0)
    expect(await count('check_in_metric_outputs')).toBe(0)
    expect((await query(user, 'SELECT metric,value FROM time_series')).rows).toEqual([
      { metric: 'adhd_energy_now_v1', value: 3 },
    ])
  }, 60000)
  test('accepted lost-response retry, changed payload conflict, no duplicates, deletion idempotency and payload-free ledger', async () => {
    const command: AdhdCommand = { operation: 'observe', observation: input },
      key = randomUUID(),
      id = await send(command, key)
    expect(await send(command, key)).toBe(id)
    expect(await count('check_ins')).toBe(1)
    await expect(
      send({ operation: 'observe', observation: { ...input, scope: 'day' } }, key),
    ).rejects.toThrow('different content')
    const ledger = (await query(user, 'SELECT * FROM adhd_commands')).rows[0]
    expect(ledger.payload).toBeUndefined()
    expect(ledger.payload_hash).toHaveLength(64)
    const del: AdhdCommand = { operation: 'delete', kind: 'observation', id, expected_revision: 1 },
      dk = randomUUID()
    await send(del, dk)
    expect(await send(del, dk)).toBe(id)
    expect(await count('check_ins')).toBe(0)
    expect(await count('adhd_observations')).toBe(0)
    expect(await count('time_series')).toBe(0)
    expect(await count('check_in_metric_outputs')).toBe(0)
  }, 60000)
  test('outer transaction rolls back canonical writes and assignment on subsequent failure', async () => {
    const broken = createAdhdService({
      now: () => now,
      random: () => 1,
      afterCanonical: async () => {
        throw new Error('synthetic failure')
      },
    })
    await expect(
      broken.command(user, {
        request_id: randomUUID(),
        command: { operation: 'observe', observation: input },
      }),
    ).rejects.toThrow('synthetic failure')
    expect(await count('check_ins')).toBe(0)
    expect(await count('check_in_forms')).toBe(0)
    expect(await count('time_series')).toBe(0)
    expect(await count('check_in_metric_outputs')).toBe(0)
    expect(await count('custom_metrics')).toBe(0)
    const p = await send({ operation: 'protocol', protocol: plan })
    const baseline = { ...input, pack: 'core_strain' as const, sampling: 'experiment_baseline' as const }
    await expect(
      broken.command(user, {
        request_id: randomUUID(),
        command: {
          operation: 'opportunity',
          protocol_id: p,
          expected_protocol_revision: 1,
          context: input.context,
          endpoint: 'A sentence',
          ten_minutes: true,
          safe_interruptible: true,
          either_acceptable: true,
          availability: 'eligible',
          baseline,
        },
      }),
    ).rejects.toThrow('synthetic failure')
    expect((await service.state(user)).records.filter((r) => r.kind === 'opportunity')).toHaveLength(0)
  }, 60000)
  test('eligibility precedes reveal, missing baseline allowed, balanced server assignment once per local day', async () => {
    const p = await send({ operation: 'protocol', protocol: plan })
    await expect(
      send({
        operation: 'opportunity',
        protocol_id: p,
        expected_protocol_revision: 1,
        context: input.context,
        endpoint: 'Sentence',
        ten_minutes: false,
        safe_interruptible: true,
        either_acceptable: true,
        availability: 'eligible',
      }),
    ).rejects.toThrow('Confirm')
    const results = await Promise.allSettled([attempt(p), attempt(p)])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    let state = await service.state(user),
      r = state.records.find((candidate) => candidate.kind === 'opportunity')!
    expect(r.data.condition).toBe('intervention')
    expect(r.data.action_window_started_at).toBeUndefined()
    const exposure: AdhdCommand = {
        operation: 'expose',
        id: r.id,
        expected_revision: r.revision,
        displayed_at: now.toISOString(),
        uncertainty: 'interface_acknowledged',
      },
      key = randomUUID()
    await send(exposure, key)
    now = new Date(now.getTime() + 60000)
    await send(exposure, key)
    state = await service.state(user)
    r = state.records.find((x) => x.id === r.id)!
    expect(r.data.action_window_started_at).toBe(new Date(input.observed_at).toISOString())
    await send({
      operation: 'method',
      id: r.id,
      expected_revision: r.revision,
      accepted: false,
      used: 'other',
      declined: true,
    })
    r = (await service.state(user)).records.find((x) => x.id === r.id)!
    await send({
      operation: 'outcome',
      id: r.id,
      expected_revision: r.revision,
      start: 'yes',
      within_five_minutes: 'yes',
      latency: '1_to_5_min',
      interruption: 'after_start',
      other_action: 'none',
      endpoint: 'partly',
      time_precision: 'unknown',
    })
    now = new Date('2026-11-26T19:00:00Z')
    await attempt(p)
    state = await service.state(user)
    const rows = state.records.filter((candidate) => candidate.kind === 'opportunity')
    expect(new Set(rows.map((candidate) => candidate.data.condition)).size).toBe(2)
    const summary = armSummary(state.records)
    expect(summary.find((a) => a.condition === 'intervention')).toMatchObject({
      assigned: 1,
      known: 1,
      starts: 1,
      declined: 1,
      interrupted: 1,
    })
    expect(summary.find((a) => a.condition === 'usual')).toMatchObject({ missing: 1, known: 0 })
    const first = state.records.find(
      (candidate) => candidate.kind === 'opportunity' && candidate.data.condition === 'intervention',
    )!
    await send({ operation: 'delete', kind: 'opportunity', id: first.id, expected_revision: first.revision })
    now = new Date(input.observed_at)
    await expect(attempt(p)).rejects.toThrow('already has an assignment')
    const deleted = (await service.state(user)).records.find((candidate) => candidate.id === first.id)!
    expect(deleted.data.deleted_content).toBe(true)
    expect(deleted.data.context).toBeUndefined()
    expect(deleted.data.outcome).toBeUndefined()
  }, 60000)
  test('frozen form mismatch rolls back; reminder edits do not rewrite protocol/assignment', async () => {
    const hypothesis = (await service.state(user)).hypotheses[6]
    const hypothesisId = await send({ operation: 'hypothesis', hypothesis })
    const p = await send({ operation: 'protocol', protocol: { ...plan, hypothesis_id: hypothesisId } })
    await send({
      operation: 'hypothesis',
      id: hypothesisId,
      expected_revision: 1,
      hypothesis: { ...hypothesis, status: 'Weakened' },
    })
    const frozen = (await service.state(user)).records.find((record) => record.id === p)!
    expect(frozen.data.hypothesis_version).toBe(1)
    expect((frozen.data.hypothesis_snapshot as Record<string, unknown>).status).toBe('Untested')
    expect(frozen.data.novelty_snapshot).toBe('off')
    await send({ operation: 'observe', observation: { ...input, pack: 'core_strain' } })
    await query(user, "UPDATE check_in_forms SET version=2 WHERE name='ADHD v1 metrics core_strain'")
    await expect(
      attempt(p, { ...input, pack: 'core_strain', sampling: 'experiment_baseline' }),
    ).rejects.toThrow('frozen check-in form changed')
    expect((await service.state(user)).records.filter((r) => r.kind === 'opportunity')).toHaveLength(0)
    const id = await attempt(p),
      before = (await service.state(user)).records.find((candidate) => candidate.id === id)!
    const s = await service.state(user)
    await send({
      operation: 'settings',
      expected_revision: s.settings_revision,
      settings: { ...s.settings, timezone: 'Europe/Stockholm' },
    })
    expect((await service.state(user)).records.find((candidate) => candidate.id === id)).toEqual(before)
    await send({ operation: 'protocol_status', id: p, expected_revision: 1, status: 'paused' })
    await expect(attempt(p)).rejects.toThrow('paused')
  }, 60000)
  test('account references are rejected across real databases and session completion does not mutate native task', async () => {
    const taskId = randomUUID()
    await query(user, 'INSERT INTO task_items(id,payload) VALUES($1,$2)', [
      taskId,
      JSON.stringify({ title: 'Synthetic task', column_id: 'todo', recurrence: { frequency: 'daily' } }),
    ])
    const taskBefore = (await query(user, 'SELECT * FROM task_items WHERE id=$1', [taskId])).rows[0]
    const id = await send({
      operation: 'session',
      context: { ...input.context, task_id: taskId },
      endpoint: 'Sentence',
      strategy_id: 'prepared_starter',
      estimated_minutes: 2,
    })
    const r = (await service.state(user)).records.find((candidate) => candidate.id === id)!
    await send({
      operation: 'outcome',
      id,
      expected_revision: r.revision,
      start: 'yes',
      within_five_minutes: 'unknown',
      latency: 'unknown',
      interruption: 'none',
      other_action: 'none',
      endpoint: 'yes',
      time_precision: 'minute',
      started_at: '2026-11-25T19:00:00Z',
      ended_at: '2026-11-25T19:03:00Z',
    })
    expect((await query(user, 'SELECT * FROM task_items WHERE id=$1', [taskId])).rows[0]).toEqual(taskBefore)
    expect(await count('task_items')).toBe(1)
    const db = await createTestDatabase(),
      pool = createRolePool({ connectionString: db.uri })
    _setDbForUser('other-synthetic', pool)
    try {
      await expect(
        service.command('other-synthetic', {
          request_id: randomUUID(),
          command: {
            operation: 'method',
            id,
            expected_revision: 1,
            accepted: true,
            used: 'usual',
            declined: false,
          },
        }),
      ).rejects.toThrow('not found')
      await expect(
        service.command('other-synthetic', {
          request_id: randomUUID(),
          command: {
            operation: 'observe',
            observation: { ...input, context: { ...input.context, task_id: taskId } },
          },
        }),
      ).rejects.toThrow('reference not found')
      expect((await service.state('other-synthetic')).observations).toHaveLength(0)
    } finally {
      await pool.end()
      await db.drop()
    }
    expect(isMutatingMcpTool('set_adhd')).toBe(true)
  }, 60000)
  test('existing account upgrade through migrateSchema preserves historical zero/false and is repeatable', async () => {
    const form = await checkDb.insertCheckInForm(user, {
      name: 'Synthetic existing form',
      description: null,
      questions: [
        { key: 'zero', type: 'number', prompt: 'Numeric amount', required: false },
        { key: 'no', type: 'yes_no', prompt: 'Was it present?', required: false },
      ],
      score: null,
      schedule: null,
      schedule_not_before: now,
      notify: false,
      outputs_enabled: false,
    })
    const answer = await checkDb.insertCheckIn(user, {
      form_id: form.id,
      form_version: 1,
      status: 'answered',
      answered_at: now,
      scheduled_for: null,
      answers: { zero: 0, no: false },
      logged: {},
      activity_ids: {},
      entity_type: null,
      entity_id: null,
      note: null,
      outputs_enabled: false,
    })
    await query(user, 'DROP TABLE adhd_commands,adhd_observations,adhd_records,adhd_settings CASCADE')
    await query(user, 'ALTER TABLE check_in_forms DROP COLUMN owner_scope')
    await migrateSchema(user, { force: true })
    await migrateSchema(user, { force: true })
    expect((await checkDb.getCheckIn(user, answer.id))?.answers).toEqual({ zero: 0, no: false })
    await send({ operation: 'observe', observation: input })
    expect((await service.state(user)).observations).toHaveLength(1)
    expect(await checkDb.listCheckInForms(user)).toHaveLength(1)
  }, 60000)
  test('repeated additive migration and actual account pg_dump/psql restore preserve private data', async () => {
    await send({ operation: 'observe', observation: input })
    const planId = await send({ operation: 'protocol', protocol: plan })
    await attempt(planId)
    for (let pass = 0; pass < 2; pass++) {
      for (const key of tableCreationOrder.filter((k) => k.startsWith('adhd_'))) {
        await query(user, createTableStatements[key])
      }
    }
    const before = await service.state(user),
      uri = new URL(getTestConnectionUri()),
      container = inject('pgContainerId')!
    const runtime = process.env.DOCKER_HOST?.includes('podman') ? 'podman' : 'docker'
    const args = pgDumpArgs('test_user', {}).map((arg) =>
      arg.startsWith('--dbname=') ? `--dbname=${uri.pathname.slice(1)}` : arg,
    )
    const { stdout: dump } = await promisify(execFile)(
      runtime,
      ['exec', container, 'pg_dump', '-U', 'test_user', ...args],
      { maxBuffer: 32 * 1024 * 1024 },
    )
    expect(dump).toContain('adhd_observations')
    expect(dump).toContain('adhd_commands')
    const restoreName = `adhdr_${randomUUID().replaceAll('-', '')}`,
      adminUri = new URL(uri)
    adminUri.pathname = '/postgres'
    const admin = new Client({ connectionString: adminUri.toString() })
    await admin.connect()
    await admin.query(`CREATE DATABASE "${restoreName}" TEMPLATE template0`)
    let restoredPool: ReturnType<typeof createRolePool> | undefined
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          runtime,
          ['exec', '-i', container, 'psql', '-U', 'test_user', '-d', restoreName, '-v', 'ON_ERROR_STOP=1'],
          { stdio: ['pipe', 'ignore', 'pipe'] },
        )
        let error = ''
        child.stderr.on('data', (chunk) => {
          error += String(chunk)
        })
        child.on('error', reject)
        child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(error))))
        child.stdin.end(dump)
      })
      const restoreUri = new URL(uri)
      restoreUri.pathname = `/${restoreName}`
      restoredPool = createRolePool({ connectionString: restoreUri.toString() })
      _setDbForUser('restored-synthetic', restoredPool)
      const restored = await service.state('restored-synthetic')
      expect(restored.observations).toEqual(before.observations)
      expect(restored.records).toEqual(before.records)
      expect(restored.observations[0].answers).toEqual(
        Object.fromEntries(Object.entries(input.items).map(([key, value]) => [key, value.value])),
      )
    } finally {
      await restoredPool?.end()
      await admin.query(`DROP DATABASE "${restoreName}"`)
      await admin.end()
    }
  }, 60000)
  test('optional coordinator invitations expire, snooze once within window, pause suppresses and no backlog replays', async () => {
    let state = await service.state(user)
    await send({
      operation: 'settings',
      expected_revision: state.settings_revision,
      settings: {
        ...state.settings,
        reminders_enabled: true,
        prompt_times: ['12:00'],
        quiet_start: '21:00',
        quiet_end: '09:00',
      },
    })
    await enqueueAdhdReminders(user, new Date('2026-11-25T19:05:00Z'))
    state = await service.state(user)
    let invite = state.records.find((candidate) => candidate.kind === 'invitation')!
    expect(invite.data.status).toBe('delivery_attempted')
    expect(await count('notifications')).toBe(1)
    now = new Date('2026-11-25T19:05:00Z')
    await send({
      operation: 'invitation',
      id: invite.id,
      expected_revision: invite.revision,
      action: 'snooze',
    })
    await enqueueAdhdReminders(user, new Date('2026-11-25T19:10:00Z'))
    expect(await count('notifications')).toBe(1)
    await enqueueAdhdReminders(user, new Date('2026-11-25T19:16:00Z'))
    expect(await count('notifications')).toBe(2)
    await enqueueAdhdReminders(user, new Date('2026-11-25T19:31:00Z'))
    state = await service.state(user)
    invite = state.records.find((candidate) => candidate.id === invite.id)!
    expect(invite.data.status).toBe('expired_unrecorded')
    now = new Date('2026-11-25T19:31:00Z')
    await expect(
      send({ operation: 'invitation', id: invite.id, expected_revision: invite.revision, action: 'opened' }),
    ).rejects.toThrow('expired')
    expect(
      Number(
        (
          await query(
            user,
            "SELECT count(*)::int n FROM notifications WHERE read_at IS NULL AND type='adhd_prompt'",
          )
        ).rows[0].n,
      ),
    ).toBe(0)
    await send({
      operation: 'settings',
      expected_revision: state.settings_revision,
      settings: { ...state.settings, paused: true },
    })
    await enqueueAdhdReminders(user, new Date('2026-11-26T19:05:00Z'))
    expect(await count('notifications')).toBe(2)
    state = await service.state(user)
    await send({
      operation: 'settings',
      expected_revision: state.settings_revision,
      settings: { ...state.settings, paused: false },
    })
    await enqueueAdhdReminders(user, new Date('2026-11-27T22:00:00Z'))
    expect(await count('notifications')).toBe(2)
  }, 60000)
  test('legacy canonical identities are source/version separated and metric projections never double samples', async () => {
    const template = (
      await query(
        user,
        "INSERT INTO questionnaire_templates(stable_key,display_name,moment) VALUES('adhd_synthetic_legacy','Synthetic legacy','custom') RETURNING id",
      )
    ).rows[0].id
    const question = (
      await query(
        user,
        "INSERT INTO assessment_questions(template_id,stable_key,prompt,response_type) VALUES($1,'synthetic_interest','Historical general interest','likert') RETURNING id,version",
        [template],
      )
    ).rows[0]
    const a = (
      await query(
        user,
        "INSERT INTO assessments(template_id,template_version,assessed_at,timezone) VALUES($1,1,$2,'America/Denver') RETURNING id",
        [template, input.observed_at],
      )
    ).rows[0].id
    await query(
      user,
      'INSERT INTO assessment_responses(assessment_id,question_id,question_version,value) VALUES($1,$2,$3,$4)',
      [a, question.id, question.version, '0'],
    )
    await query(
      user,
      "INSERT INTO time_series(time,metric,value,unit,source) VALUES($1,'synthetic_projection',0,'score','manual')",
      [input.observed_at],
    )
    const state = await service.state(user)
    expect(state.legacy).toHaveLength(1)
    expect(state.observations).toHaveLength(0)
    expect(state.legacy[0].answers[question.id]).toMatchObject({
      question_version: question.version,
      value: 0,
    })
    expect(state.legacy[0].time_scope).toContain('excluded')
  }, 60000)
  test('strain remains canonical and deletion erases legacy outcome copies from storage and export', async () => {
    const protocol = await send({ operation: 'protocol', protocol: plan }),
      id = await attempt(protocol)
    let row = (await service.state(user)).records.find((record) => record.id === id)!
    await send({
      operation: 'outcome',
      id,
      expected_revision: row.revision,
      start: 'yes',
      within_five_minutes: 'unknown',
      latency: 'unknown',
      interruption: 'none',
      other_action: 'none',
      endpoint: 'yes',
      time_precision: 'unknown',
      strain: 4,
    })
    let state = await service.state(user)
    row = state.records.find((record) => record.id === id)!
    const post = state.observations.find((observation) => observation.id === row.data.post_observation_id)!
    expect(post.answers.strain_now_v1).toBe(4)
    expect(row.data.outcome).not.toHaveProperty('strain')
    await query(user, `UPDATE adhd_records SET data=jsonb_set(data,'{outcome,strain}','4') WHERE id=$1`, [id])
    await query(user, createTableStatements.adhd_canonical_outcomes)
    expect(
      (await query(user, 'SELECT data FROM adhd_records WHERE id=$1', [id])).rows[0].data.outcome,
    ).not.toHaveProperty('strain')
    await query(user, `UPDATE adhd_records SET data=jsonb_set(data,'{outcome,strain}','4') WHERE id=$1`, [id])
    await send({ operation: 'delete', kind: 'observation', id: post.id, expected_revision: post.revision })
    state = await service.state(user)
    row = state.records.find((record) => record.id === id)!
    expect(row.data.outcome).not.toHaveProperty('strain')
    expect(row.data.post_observation_id).toBeUndefined()
    expect(
      (await query(user, 'SELECT answers FROM check_ins WHERE id=$1', [post.answer_id])).rows,
    ).toHaveLength(0)
    const app = express()
    app.use(
      createAdhdRouter((req, _res, next) => {
        req.user = user
        next()
      }, service),
    )
    const exported = (await supertest(app).get('/export').expect(200)).body.data
    expect(exported.observations).toHaveLength(0)
    expect(
      exported.records.find((record: { id: string }) => record.id === id).data.outcome,
    ).not.toHaveProperty('strain')
  }, 60000)
  test.each(['observation', 'opportunity', 'protocol', 'recipe'] as const)(
    'deleting %s erases descendant evidence notes from current/history hypotheses and frozen protocol snapshots',
    async (kind) => {
      const observed = await send({
        operation: 'observe',
        observation: { ...input, observed_at: '2026-11-25T18:59:00Z' },
      })
      let target = observed,
        revision = 1,
        relatedOpportunity: string | undefined
      if (kind === 'protocol' || kind === 'opportunity') {
        const protocol = await send({ operation: 'protocol', protocol: plan })
        relatedOpportunity = await attempt(protocol, {
          ...input,
          pack: 'core_strain',
          sampling: 'experiment_baseline',
        })
        const child = (await service.state(user)).observations.find(
          (observation) => observation.sampling === 'experiment_baseline',
        )!
        target = kind === 'protocol' ? protocol : relatedOpportunity
        revision = (await service.state(user)).records.find((record) => record.id === target)!.revision
        await send({ operation: 'protocol_status', id: protocol, expected_revision: 1, status: 'paused' })
        if (kind === 'protocol') revision = 2
        await send({ operation: 'delete', kind: 'observation', id: observed, expected_revision: 1 })
        expect(child.id).toBeTruthy()
      } else if (kind === 'recipe') {
        target = await send({
          operation: 'recipe',
          title: 'Synthetic private recipe',
          barrier: 'start',
          strategy_id: 'prepared_starter',
          steps: 'One sentence',
          stopping_rule: 'Stop after sentence',
        })
        relatedOpportunity = await send({
          operation: 'session',
          recipe_id: target.toUpperCase(),
          context: input.context,
          endpoint: 'Sentence',
          strategy_id: 'prepared_starter',
        })
        await query(user, 'UPDATE adhd_observations SET parent_id=$2 WHERE id=$1', [
          observed,
          relatedOpportunity,
        ])
      }
      const state = await service.state(user),
        marker = `private-evidence-${kind}`
      const evidence: AdhdCommand & { operation: 'hypothesis' } = {
        operation: 'hypothesis',
        hypothesis: {
          ...state.hypotheses[0],
          evidence: [
            ...state.observations.map((observation) => ({
              source: 'observation' as const,
              id: observation.id.toUpperCase(),
              note: marker,
            })),
            ...(relatedOpportunity
              ? [{ source: 'opportunity' as const, id: relatedOpportunity.toUpperCase(), note: marker }]
              : []),
          ],
        },
      }
      const hypothesis = await send(evidence)
      await send({
        ...evidence,
        id: hypothesis,
        expected_revision: 1,
        hypothesis: { ...evidence.hypothesis, statement: 'Updated synthetic hypothesis' },
      })
      const snapshotProtocol = await send({
        operation: 'protocol',
        protocol: { ...plan, hypothesis_id: hypothesis },
      })
      const before = (await service.state(user)).records.find((record) => record.id === snapshotProtocol)!
      expect(JSON.stringify(before.data.hypothesis_snapshot)).toContain(marker)
      await send({ operation: 'delete', kind, id: target, expected_revision: revision })
      const after = await service.state(user)
      expect(JSON.stringify(after.records)).not.toContain(marker)
      const persisted = (await query(user, 'SELECT data FROM adhd_records')).rows
      expect(JSON.stringify(persisted)).not.toContain(marker)
      expect(after.observations).toHaveLength(0)
      const afterProtocol = after.records.find((record) => record.id === snapshotProtocol)!
      expect(afterProtocol.revision).toBeGreaterThan(before.revision)
      const app = express()
      app.use(
        createAdhdRouter((req, _res, next) => {
          req.user = user
          next()
        }, service),
      )
      expect(JSON.stringify((await supertest(app).get('/export').expect(200)).body)).not.toContain(marker)
    },
    60000,
  )
  test.each(['quiet', 'awake'] as const)(
    'actual %s boundary suppresses delayed enqueue, snooze and queued push retry',
    async (boundary) => {
      const at = (day: number, clock: string) =>
        new Date(
          Temporal.ZonedDateTime.from(`2026-11-${day}T${clock}[America/Denver]`).toInstant().toString(),
        )
      now = at(25, '20:50')
      const pref = await service.state(user)
      await send({
        operation: 'settings',
        expected_revision: pref.settings_revision,
        settings: {
          ...pref.settings,
          reminders_enabled: true,
          prompt_times: ['20:55'],
          quiet_start: boundary === 'quiet' ? '21:00' : '22:00',
          quiet_end: '09:00',
        },
      })
      if (boundary === 'awake') {
        await send({ operation: 'protocol', protocol: { ...plan, awake_end: '21:00' } })
      }
      await enqueueAdhdReminders(user, at(25, '21:02'))
      expect(await count('notifications')).toBe(0)
      expect(
        (await service.state(user)).records.find((record) => record.kind === 'invitation')?.data.status,
      ).toBe('suppressed')
      await saveBrowserPush(user, {
        endpoint: `https://fcm.googleapis.com/fcm/send/adhd-${boundary}`,
        keys: {
          auth: 'AAAAAAAAAAAAAAAAAAAAAA',
          p256dh: 'BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        },
      })
      let sends = 0
      const retry = async () => {
        sends++
        return 'retry' as const
      }
      const stamp = async (date: Date) => {
        await query(
          user,
          "UPDATE notifications SET created_at=$1 WHERE type='adhd_prompt' AND read_at IS NULL",
          [date],
        )
        await query(user, 'UPDATE notification_delivery_state SET not_before=$1', [
          new Date(date.getTime() - 86400000),
        ])
      }
      await enqueueAdhdReminders(user, at(26, '20:56'))
      await stamp(at(26, '20:56'))
      await deliverBrowserNotifications(user, at(26, '20:56'), retry)
      expect(sends).toBe(1)
      await deliverBrowserNotifications(user, at(26, '21:02'), retry)
      expect(sends).toBe(1)
      expect(
        (await query(user, 'SELECT status FROM notification_browser_deliveries')).rows.every(
          (row) => row.status === 'expired',
        ),
      ).toBe(true)
      now = at(27, '20:56')
      await enqueueAdhdReminders(user, now)
      await stamp(now)
      await deliverBrowserNotifications(user, now, retry)
      expect(sends).toBe(2)
      const invitation = (await service.state(user)).records.find(
        (record) => record.kind === 'invitation' && record.data.local_date === '2026-11-27',
      )!
      await send({
        operation: 'invitation',
        id: invitation.id,
        expected_revision: invitation.revision,
        action: 'snooze',
      })
      await enqueueAdhdReminders(user, at(27, '21:07'))
      await deliverBrowserNotifications(user, at(27, '21:07'), retry)
      expect(sends).toBe(2)
      expect(
        (await service.state(user)).records.find((record) => record.id === invitation.id)?.data.status,
      ).toBe('suppressed')
      expect(
        (await query(user, 'SELECT status FROM notification_browser_deliveries')).rows.every(
          (row) => row.status === 'expired',
        ),
      ).toBe(true)
    },
    60000,
  )
  test('time contracts reject DST gaps/folds, preserve overnight windows and exclude retrospective data', async () => {
    expect(resolvedWindow('2026-03-08', '02:30', 'America/Denver')).toBeNull()
    expect(resolvedWindow('2026-11-01', '01:30', 'America/Denver')).toBeNull()
    expect(inClockWindow('23:00', '21:00', '09:00')).toBe(true)
    expect(inClockWindow('12:00', '21:00', '09:00')).toBe(false)
    await send({
      operation: 'observe',
      observation: { ...input, scope: 'retrospective', sampling: 'retrospective' },
    })
    expect(
      hourCoverage((await service.state(user)).observations, 'America/Denver').reduce((n, b) => n + b.n, 0),
    ).toBe(0)
  }, 60000)
})

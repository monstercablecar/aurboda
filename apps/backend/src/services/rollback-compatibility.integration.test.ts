import { createJournalEntryBodySchema, createPersonBodySchema } from '@aurboda/api-spec'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, test } from 'vitest'

import { query, _setDbForUser, migrateSchemaIfNeeded } from '../db/connection.ts'
import { createRolePool } from '../db/pool.ts'
import {
  createTestDatabase,
  startTestDb,
  stopTestDb,
  getTestUser,
  getTestConnectionUri,
} from '../test/db-test-helper.ts'
import { addCheckInForm, checkInDeps, submitCheckIn } from './check-ins.ts'
import { JOURNAL_CATALOG } from './journal-catalog.ts'
import * as journal from './journal.ts'
import { notifier } from './notifications.ts'
import * as people from './people.ts'

const previousImage = process.env.AURBODA_PREVIOUS_IMAGE
beforeAll(startTestDb, 120000)
afterAll(stopTestDb, 60000)
test.runIf(previousImage)(
  'the previous immutable image reads representative new data against additive schema',
  async () => {
    const user = getTestUser(),
      p = await people.createPerson(
        user,
        createPersonBodySchema.parse({
          name: 'Synthetic rollback person',
          relationship: 'friend',
          needs: ['relationship_maintenance'],
          approximate_age: { value: 30, unit: 'years', as_of: '2026-11-23' },
        }),
      )
    const f = await addCheckInForm(checkInDeps, user, {
      name: 'Synthetic rollback routine',
      notify: true,
      outputs_enabled: true,
      questions: [
        {
          key: 'value',
          type: 'number',
          required: false,
          prompt: 'Value',
          logs_to: { metric: 'rollback_metric' },
        },
        {
          key: 'walk',
          type: 'yes_no',
          required: false,
          prompt: 'Walking',
          logs_to: { activity_type: 'walking' },
        },
      ],
    })
    if (!f.ok) throw new Error(f.error)
    const response = await submitCheckIn(checkInDeps, user, {
      form_id: f.value.id,
      answers: { value: 7, walk: true },
      request_id: randomUUID(),
    })
    if (!response.ok) throw new Error(response.error)
    const activity = response.value.activities.walk!.activity_id
    const entry = await journal.createJournalEntry(
      user,
      createJournalEntryBodySchema.parse({
        title: 'Synthetic rollback reflection',
        content: 'Preserved original words',
        occurred_at: '2026-11-23T10:00:00Z',
        links: [{ kind: 'activity', record_id: activity, label: '' }],
      }),
    )
    await notifier.raise(user, {
      type: 'check_in_due',
      title: 'Synthetic notification',
      dedupe_key: 'rollback-notification',
    })
    await query(user, 'INSERT INTO user_settings(settings) VALUES($1)', [
      {
        dashboard: {
          version: 1,
          sections: [
            {
              id: 'new',
              title: 'New card',
              type: 'charts',
              widgets: [{ id: 'recent', type: 'recent_activities', config: { window: 'today', limit: 5 } }],
            },
          ],
        },
      },
    ])
    const input = {
      uri: getTestConnectionUri(),
      user,
      person: p.id,
      entry: entry.id,
      activity,
      response: response.value.id,
    }
    const program = `import assert from 'node:assert/strict';import {createRolePool} from '/app/apps/backend/src/db/pool.ts';import {_setDbForUser,closeAllUserPools} from '/app/apps/backend/src/db/connection.ts';import {getActivityById} from '/app/apps/backend/src/db/activities/index.ts';import {getDailyAggregates} from '/app/apps/backend/src/db/time-series.ts';import {getUserSettings} from '/app/apps/backend/src/db/settings.ts';import {requirePerson} from '/app/apps/backend/src/services/people.ts';import {getJournalEntry} from '/app/apps/backend/src/services/journal.ts';import {listNotificationsPage,notificationStore} from '/app/apps/backend/src/services/notifications.ts';const x=${JSON.stringify(input)};_setDbForUser(x.user,createRolePool({connectionString:x.uri,max:2}));try{assert.equal((await requirePerson(x.user,x.person)).name,'Synthetic rollback person');assert.equal((await getJournalEntry(x.user,x.entry)).links[0].kind,'activity');assert.equal((await getActivityById(x.user,x.activity)).source,'manual');assert.equal((await getDailyAggregates(x.user,['rollback_metric'],new Date('2020-01-01'),new Date('2030-01-01')))[0].avg,7);assert.equal((await getUserSettings(x.user)).dashboard.sections[0].widgets[0].type,'recent_activities');assert.equal((await listNotificationsPage(notificationStore,x.user,{limit:20})).notifications[0].type,'check_in_due');console.log('Previous image read all representative records')}finally{await closeAllUserPools()}`
    const output = execFileSync(
      'podman',
      [
        'run',
        '--rm',
        '--network',
        'host',
        '--entrypoint',
        'node',
        '-i',
        previousImage!,
        '--input-type=module',
        '-',
      ],
      { input: program, encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 },
    )
    expect(output).toContain('Previous image read all representative records')
    expect((await journal.getJournalEntry(user, entry.id)).content).toBe('Preserved original words')
  },
  90000,
)

test.runIf(previousImage)(
  'upgrades the exact previous image schema twice without changing private history or original bytes',
  async () => {
    const source = execFileSync(
      'podman',
      [
        'run',
        '--rm',
        '--entrypoint',
        'node',
        previousImage!,
        '--input-type=module',
        '-e',
        "import {createTableStatements,tableCreationOrder} from '/app/apps/backend/src/schema.ts';console.log(JSON.stringify({statements:createTableStatements,order:tableCreationOrder}))",
      ],
      { encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 },
    )
    const schema = JSON.parse(source) as { statements: Record<string, string>; order: string[] }
    const database = await createTestDatabase(),
      pool = createRolePool({ connectionString: database.uri, max: 3 }),
      account = 'synthetic-upgrade'
    _setDbForUser(account, pool)
    try {
      await pool.query('DROP SCHEMA public CASCADE')
      await pool.query('CREATE SCHEMA public')
      for (const extension of ['postgis', 'pg_trgm', 'unaccent']) {
        await pool.query(`CREATE EXTENSION IF NOT EXISTS ${extension}`)
      }
      for (const key of schema.order) if (schema.statements[key]) await pool.query(schema.statements[key]!)
      const person = await people.createPerson(
        account,
        createPersonBodySchema.parse({
          name: 'Synthetic preserved person',
          relationship: 'friend',
          needs: ['relationship_maintenance'],
          approximate_age: { value: 30, unit: 'years', as_of: '2026-11-23' },
          notes: 'Original private care notes',
        }),
      )
      const workbook = await journal.createJournalEntry(
        account,
        createJournalEntryBodySchema.parse({
          occurred_at: '2026-11-23T10:00:00Z',
          workbook_id: JOURNAL_CATALOG[0]!.id,
        }),
      )
      await journal.updateJournalEntry(account, workbook.id, {
        expected_updated_at: workbook.updated_at,
        content: 'Original workbook reflection',
      })
      const bytes = Buffer.from([0, 255, 128, 1, 2, 3]),
        attachment = await journal.addJournalAttachment(account, workbook.id, {
          filename: 'synthetic.png',
          mime_type: 'image/png',
          bytes,
        })
      const substance = (
        await pool.query<{ id: string }>(
          "INSERT INTO substances(analysis_key,display_name,category,dose_unit) VALUES('synthetic_preservation','Synthetic supplement','supplement','mg') RETURNING id",
        )
      ).rows[0]!.id
      await pool.query(
        "INSERT INTO administration_events(substance_id,administered_at,timezone,dose,dose_unit,status,notes) VALUES($1,'2026-11-23T09:00:00Z','UTC',5,'mg','taken','Original factual administration')",
        [substance],
      )
      await pool.query(
        "INSERT INTO custom_reminders(title,time_of_day,timezone,recurrence,start_date,enabled,next_due_at) VALUES('Synthetic reminder','10:00','UTC','daily','2026-11-23',true,'2026-11-24T10:00:00Z')",
      )
      const tables = [
        'people',
        'people_events',
        'people_feedback',
        'people_metric_points',
        'journal_entries',
        'journal_revisions',
        'journal_attachments',
        'substances',
        'administration_events',
        'custom_reminders',
      ]
      const snapshot = async () =>
        Object.fromEntries(
          await Promise.all(
            tables.map(async (table) => [
              table,
              (await pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows,
            ]),
          ),
        )
      const before = await snapshot()
      await migrateSchemaIfNeeded(account)
      await migrateSchemaIfNeeded(account)
      expect(await snapshot()).toEqual(before)
      expect((await people.requirePerson(account, person.id)).notes).toBe('Original private care notes')
      expect((await journal.getJournalEntry(account, workbook.id)).workbook?.definition).toEqual(
        JOURNAL_CATALOG[0],
      )
      expect((await journal.getJournalAttachment(account, attachment.id)).bytes).toEqual(bytes)
      expect(
        (await pool.query("SELECT tablename FROM pg_tables WHERE tablename='check_in_forms'")).rowCount,
      ).toBe(1)
    } finally {
      await pool.end()
      await database.drop()
    }
  },
  120000,
)

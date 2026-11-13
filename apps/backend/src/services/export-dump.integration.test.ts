import {
  builtInRecruitingProfile,
  createTaskItemBodySchema,
  computeWorkDayTotals,
  createPersonBodySchema,
  peopleEventBodySchema,
  createJournalEntryBodySchema,
} from '@aurboda/api-spec'
import express from 'express'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { Client } from 'pg'
import format from 'pg-format'
import supertest from 'supertest'
import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest'

import { _setDbForUser, initializeSchema, migrateSchemaIfNeeded, userDbName } from '../db/index.ts'
import { createRolePool, type UserDb } from '../db/pool.ts'
import { createExportRouter } from '../routes/export-router.ts'
import {
  createDumpExporter,
  createDumpLinkIssuer,
  DUMP_FORMAT_METADATA,
  type PgConnection,
} from './export-dump.ts'
import { createExportTokens } from './export-token.ts'
import { JOURNAL_CATALOG } from './journal-catalog.ts'
import * as journal from './journal.ts'
import * as tasks from './native-tasks.ts'
import * as people from './people.ts'
import { saveWorkDay } from './work-day.ts'

const adminUri = () => {
  const uri = inject('pgAdminUri')
  if (!uri) {
    throw new Error('Test database not available: this run started without the integration global setup')
  }
  return new URL(uri)
}

const databaseUri = (database: string) => {
  const uri = adminUri()
  uri.pathname = `/${database}`
  return uri.toString()
}

const withClient = async <T>(uri: string, fn: (client: Client) => Promise<T>): Promise<T> => {
  const client = new Client({ connectionString: uri })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

const conn = (): PgConnection => {
  const uri = adminUri()
  return {
    host: uri.hostname,
    password: decodeURIComponent(uri.password),
    port: uri.port,
    user: decodeURIComponent(uri.username),
  }
}

/** The steps `makeNewUserDb` takes, with the test server's superuser in place of the service role. */
const createUser = async (user: string): Promise<UserDb> => {
  const database = userDbName(user)
  await withClient(adminUri().toString(), async (admin) => {
    await admin.query(format('CREATE USER %I WITH ENCRYPTED PASSWORD %L', user, 'pw'))
    await admin.query(format('CREATE DATABASE %I OWNER %I', database, user))
  })
  await withClient(databaseUri(database), async (db) => {
    await db.query('CREATE EXTENSION IF NOT EXISTS postgis')
    await db.query('CREATE EXTENSION IF NOT EXISTS pg_trgm')
    await db.query('CREATE EXTENSION IF NOT EXISTS unaccent')
  })
  const pool = createRolePool({ connectionString: databaseUri(database), max: 2 }, user)
  _setDbForUser(user, pool)
  await initializeSchema(user)
  return pool
}

const counts = async (db: UserDb) =>
  Object.fromEntries(
    await Promise.all(
      ['time_series', 'activities', 'locations', 'activity_type_definitions'].map(async (table) => [
        table,
        Number((await db.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n),
      ]),
    ),
  )

const savedTables = [
  'journal_settings',
  'journal_areas',
  'journal_entries',
  'journal_templates',
  'journal_revisions',
  'journal_attachments',
  'task_board_settings',
  'task_onboarding_seed',
  'task_projects',
  'task_items',
  'uploaded_icons',
  'feed_image',
  'people',
  'people_events',
  'people_reminder_deliveries',
  'people_feedback',
  'people_metric_points',
  'user_settings',
  'activities',
  'notes',
  'time_series',
  'custom_metrics',
  'goals',
  'activity_type_definitions',
  'questionnaire_templates',
  'assessment_questions',
  'assessment_question_versions',
  'assessments',
  'assessment_responses',
  'treatment_types',
  'treatment_sessions',
  'context_event_types',
  'context_events',
  'substances',
  'substance_versions',
  'regimens',
  'regimen_items',
  'regimen_versions',
  'administration_events',
  'administration_event_revisions',
] as const

const savedRows = async (db: UserDb) =>
  Object.fromEntries(
    await Promise.all(
      savedTables.map(async (table) => [
        table,
        (
          await db.query(format('SELECT to_jsonb(t) AS row FROM %I t ORDER BY to_jsonb(t)::text', table))
        ).rows.map(({ row }) => row),
      ]),
    ),
  )

const insertFixture = async (db: UserDb, table: string, row: Record<string, unknown>) => {
  const keys = Object.keys(row)
  const result = await db.query<{ id: string }>(
    format(
      'INSERT INTO %I (%s) VALUES (%s) RETURNING id',
      table,
      keys.map((key) => format('%I', key)).join(','),
      keys.map((_, i) => `$${i + 1}`).join(','),
    ),
    Object.values(row).map((value) =>
      typeof value === 'object' && value !== null ? JSON.stringify(value) : value,
    ),
  )
  return result.rows[0].id
}

const storedImageBytes = Buffer.from([0, 255, 92, 10, 13, 128, 1, 0])
const otherImageBytes = Buffer.from('OTHER TENANT MEDIA')

const journalAudioBytes = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 255, 128, 10])
const journalImageBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=',
  'base64',
)
const otherJournalBytes = Buffer.from('OTHER TENANT JOURNAL MEDIA')
const journalOriginalContent = 'Original content: café, "quotes", \nsecond line'
const workbookAnswer = 'Synthetic answer: preserve the exact prompt and version.'

const seedJournalFeatures = async (user: string) => {
  const area = await journal.createJournalArea(user, {
    name: 'Synthetic personal area',
    position: 12,
    archived: false,
  })
  const reflection = await journal.createJournalEntry(
    user,
    createJournalEntryBodySchema.parse({
      title: 'Synthetic backup reflection',
      content: journalOriginalContent,
      occurred_at: '2026-11-13T10:00:00Z',
      area_id: area.id,
      tags: ['backup', 'reflection'],
      favorite: true,
      pinned: true,
    }),
  )
  await journal.updateJournalEntry(user, reflection.id, {
    expected_updated_at: reflection.updated_at,
    content: 'Revised content',
  })
  const template = await journal.createJournalTemplate(user, {
    title: 'Weekly reflection',
    content: 'What surprised me?',
  })
  await journal.createJournalEntry(
    user,
    createJournalEntryBodySchema.parse({
      title: '',
      occurred_at: '2026-11-12T10:00:00Z',
      template_id: template.id,
      links: [{ kind: 'entry', record_id: reflection.id, label: 'Earlier reflection' }],
    }),
  )
  await journal.addJournalAttachment(user, reflection.id, {
    filename: 'synthetic-recording.webm',
    mime_type: 'audio/webm',
    bytes: journalAudioBytes,
  })
  const definition = JOURNAL_CATALOG[0]
  for (const status of ['in_progress', 'completed', 'archived'] as const) {
    const attempt = await journal.createJournalEntry(
      user,
      createJournalEntryBodySchema.parse({
        title: `Synthetic workbook ${status}`,
        occurred_at: '2026-11-13T11:00:00Z',
        area_id: area.id,
        workbook_id: definition.id,
        links: [{ kind: 'entry', record_id: reflection.id, label: 'Earlier reflection' }],
      }),
    )
    const workbook = attempt.workbook
    if (!workbook) throw new Error('Expected a workbook fixture')
    const prompt = definition.sections[0].prompts[0].id
    await journal.updateJournalEntry(user, attempt.id, {
      expected_updated_at: attempt.updated_at,
      workbook: {
        ...workbook,
        answers: { [prompt]: workbookAnswer },
        completed_sections:
          status === 'completed'
            ? definition.sections.map((section) => section.id)
            : [definition.sections[0].id],
        current_section: definition.sections[definition.sections.length - 1].id,
        status,
      },
    })
    if (status === 'in_progress') {
      await journal.addJournalAttachment(user, attempt.id, {
        filename: 'synthetic-image.png',
        mime_type: 'image/png',
        bytes: journalImageBytes,
        prompt_id: prompt,
      })
    }
  }
  const trash = await journal.createJournalEntry(
    user,
    createJournalEntryBodySchema.parse({
      title: 'Synthetic trashed entry',
      content: 'Recoverable trash content',
      occurred_at: '2026-11-11T10:00:00Z',
      area_id: area.id,
    }),
  )
  await journal.addJournalAttachment(user, trash.id, {
    filename: 'trashed-recording.webm',
    mime_type: 'audio/webm',
    bytes: journalAudioBytes,
  })
  await journal.updateJournalEntry(user, trash.id, {
    expected_updated_at: trash.updated_at,
    deleted: true,
  })
}

const seedSavedFeatures = async (db: UserDb, user: string) => {
  await db.query('INSERT INTO feed_image(content_type,data,width,height,byte_size) VALUES($1,$2,1,1,$3)', [
    'image/webp',
    storedImageBytes,
    storedImageBytes.length,
  ])
  await seedJournalFeatures(user)

  const initialBoard = await tasks.getTaskBoard(user)
  await tasks.updateTaskBoard(user, {
    expected_updated_at: initialBoard.updated_at,
    columns: [
      ...initialBoard.columns,
      { id: 'review', title: 'Review', status: 'in_progress', color: '#123456', wip_limit: 3 },
    ],
  })
  const project = await tasks.createTaskProject(user, { title: 'Household' })
  const task = await tasks.createTaskItem(
    user,
    createTaskItemBodySchema.parse({
      title: 'Check smoke alarm batteries',
      project_id: project.id,
      due_date: '2026-11-15',
      priority: 2,
    }),
  )
  await tasks.updateTaskItem(user, task.id, { done: true, expected_updated_at: task.updated_at })
  await tasks.createTaskItem(
    user,
    createTaskItemBodySchema.parse({
      title: 'Plan weekend walk',
      column_id: 'review',
      position: 12,
      labels: ['family'],
      checklist: [{ id: 'boots', title: 'Pack boots', done: true }],
      custom_fields: [{ name: 'Trail', value: 'Lake' }],
      archived: true,
      blocked_reason: 'Weather',
      project_id: project.id,
      workflow_status: 'in_progress',
    }),
  )
  const recurring = await tasks.createTaskItem(
    user,
    createTaskItemBodySchema.parse({
      title: 'Review household supplies',
      project_id: project.id,
      due_date: '2026-01-31',
      recurrence: 'monthly',
    }),
  )
  await tasks.updateTaskItem(user, recurring.id, { done: true, expected_updated_at: recurring.updated_at })
  const person = await people.createPerson(
    user,
    createPersonBodySchema.parse({
      name: 'Export fixture spouse',
      relationship: 'spouse',
      needs: ['relationship_maintenance'],
      date_of_birth: '1990-01-01',
      photo:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=',
      statuses: ['established'],
      notes: 'Private fixture: café, "quotes" and\nsecond line',
    }),
  )
  await people.updatePerson(user, person.id, { statuses: [] })
  const event = await people.createEvent(
    user,
    person.id,
    peopleEventBodySchema.parse({
      type: 'shared_activity',
      timestamp: '2026-11-01T12:00:00Z',
      end_time: '2026-11-01T13:00:00Z',
      payload: { note: 'Fixture shared walk' },
    }),
  )
  await db.query(
    "INSERT INTO people_reminder_deliveries(event_id,revision,reminder_at,status,attempts) VALUES($1,$2,'2026-11-01T11:00:00Z','accepted',1)",
    [event.id, event.revision],
  )
  await db.query(
    "INSERT INTO people_feedback(person_id,guidance_id,version,action) VALUES($1,'fixture-guidance','1','completed')",
    [person.id],
  )
  await db.query('INSERT INTO uploaded_icons(content_type,data) VALUES($1,$2)', [
    'image/png',
    Buffer.from(person.photo?.split(',')[1] ?? '', 'base64'),
  ])
  const workProfile = { ...builtInRecruitingProfile, name: 'Fixture recruiting profile' }
  await insertFixture(db, 'user_settings', {
    settings: {
      timezone: 'America/Denver',
      work: { version: 1, active_profile_id: workProfile.id, profiles: [workProfile] },
    },
  })
  const values = { offers_accepted: { server: 2 } }
  await saveWorkDay(user, {
    profile_id: workProfile.id,
    work_date: '2026-11-01',
    timestamp: '2026-11-01T18:00:00Z',
    values,
    totals: computeWorkDayTotals(workProfile, values),
    note: 'Fixture canonical work note',
  })
  await insertFixture(db, 'custom_metrics', {
    name: 'cpap_ahi',
    unit: 'events/hour',
    description: 'ResMed myAir CPAP: AHI',
    min_value: 0,
    aggregation: 'avg',
  })
  await db.query(
    "INSERT INTO time_series(time,metric,value,unit,source) VALUES('2026-11-01T07:00:00Z','cpap_ahi',1.7,'events/hour','resmed_myair')",
  )
  await insertFixture(db, 'goals', {
    metric: 'work_hires',
    min_value: 3,
    time_window: '7d',
    aggregation: 'sum',
  })
  await db.query(
    "INSERT INTO activity_type_definitions(name,display_name,display_category) VALUES('fixture_reflection','Fixture reflection','mindfulness')",
  )

  for (const [key, name, value] of [
    ['simple_food_daily_check', 'Simple Food fixture', ['vegetables', 'beans']],
    ['fixture_mental_assessment', 'Custom mental assessment fixture', 4],
  ] as const) {
    const template = await insertFixture(db, 'questionnaire_templates', {
      stable_key: key,
      display_name: name,
      moment: 'custom',
      description: 'Saved custom fixture',
      version: 2,
    })
    const question = await insertFixture(db, 'assessment_questions', {
      template_id: template,
      stable_key: 'fixture_question',
      prompt: 'Edited fixture question?',
      version: 2,
      response_type: Array.isArray(value) ? 'multiple_choice' : 'likert',
      anchors: { '1': 'Low', '5': 'High' },
      config: { options: ['vegetables', 'beans'], min: 1, max: 5 },
    })
    for (const version of [1, 2]) {
      await insertFixture(db, 'assessment_question_versions', {
        question_id: question,
        version,
        snapshot: {
          id: question,
          template_id: template,
          version,
          prompt: version === 1 ? 'Original fixture question?' : 'Edited fixture question?',
        },
      })
    }
    const assessment = await insertFixture(db, 'assessments', {
      template_id: template,
      template_version: 2,
      assessed_at: '2026-11-01T19:00:00Z',
      timezone: 'America/Denver',
      notes: 'Saved fixture answer',
    })
    await insertFixture(db, 'assessment_responses', {
      assessment_id: assessment,
      question_id: question,
      question_version: 1,
      value,
    })
  }
  const contextType = await insertFixture(db, 'context_event_types', {
    key: 'simple_food_fixture_symptom',
    display_name: 'Fixture food symptom',
    description: 'Custom context fixture',
  })
  await insertFixture(db, 'context_events', {
    event_type_id: contextType,
    started_at: '2026-11-01T19:00:00Z',
    timezone: 'America/Denver',
    intensity: 2,
    notes: 'Fixture symptom note',
    metadata: { foods: ['beans'], duration_minutes: 30 },
  })
  const treatmentType = await insertFixture(db, 'treatment_types', {
    key: 'fixture_treatment',
    display_name: 'Fake export treatment',
    category: 'fixture',
    default_follow_up_hours: [24, 48],
  })
  const treatment = await insertFixture(db, 'treatment_sessions', {
    treatment_type_id: treatmentType,
    actual_start: '2026-11-01T15:00:00Z',
    actual_end: '2026-11-01T16:00:00Z',
    timezone: 'America/Denver',
    status: 'completed',
    notes: 'Fake session fixture',
    metadata: { fixture: true },
    follow_up_hours: [24],
  })
  const substance = await insertFixture(db, 'substances', {
    analysis_key: 'fixture_supplement',
    display_name: 'Fake export supplement',
    category: 'supplement',
    dose_unit: 'mg',
    notes: 'Fixture only',
  })
  await insertFixture(db, 'substance_versions', {
    substance_id: substance,
    version: 1,
    snapshot: { id: substance, display_name: 'Fake export supplement', dose_unit: 'mg' },
  })
  const regimen = await insertFixture(db, 'regimens', {
    name: 'Fixture morning regimen',
    schedule: { type: 'daily', times: ['08:00'] },
    reminder: { enabled: true, minutes_before: [10] },
  })
  const item = await insertFixture(db, 'regimen_items', {
    regimen_id: regimen,
    substance_id: substance,
    dose: 5,
    dose_unit: 'mg',
    scheduled_local_time: '08:00',
  })
  await insertFixture(db, 'regimen_versions', {
    regimen_id: regimen,
    version: 1,
    snapshot: { id: regimen, items: [{ id: item, substance_id: substance, dose: 5 }] },
  })
  const administration = await insertFixture(db, 'administration_events', {
    substance_id: substance,
    regimen_item_id: item,
    treatment_session_id: treatment,
    administered_at: '2026-11-01T15:00:00Z',
    timezone: 'America/Denver',
    dose: 5,
    dose_unit: 'mg',
    status: 'taken',
    notes: 'Corrected fixture administration',
    side_effects: ['fixture observation'],
  })
  await insertFixture(db, 'administration_event_revisions', {
    administration_event_id: administration,
    revision: 1,
    action: 'corrected',
    reason: 'Fixture correction',
    snapshot: { dose: 2.5, dose_unit: 'mg' },
  })
}

describe('database export', () => {
  const suffix = randomBytes(4).toString('hex')
  const source = `export_src_${suffix}`
  const target = `export_dst_${suffix}`
  const other = `export_other_${suffix}`
  let dir: string
  let dumpPath: string
  const pools: UserDb[] = []

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aurboda-export-'))
    dumpPath = join(dir, 'dump.sql.gz')

    const db = await createUser(source)
    pools.push(db)
    const activityType = (await db.query('SELECT name FROM activity_type_definitions ORDER BY name LIMIT 1'))
      .rows[0].name as string
    await db.query(
      `INSERT INTO time_series (time, metric, value, unit, source)
       VALUES ('2026-11-01T08:00:00Z', 'heart_rate', 61, 'bpm', 'manual'),
              ('2026-11-01T08:01:00Z', 'heart_rate', 63, 'bpm', 'manual')`,
    )
    await db.query(
      `INSERT INTO activities (source, activity_type, start_time, end_time, title)
       VALUES ('manual', $1, '2026-11-01T09:00:00Z', '2026-11-01T10:00:00Z', 'Morning')`,
      [activityType],
    )
    await db.query(
      `INSERT INTO locations (source, time, location)
       VALUES ('owntracks', '2026-11-01T09:30:00Z', ST_SetSRID(ST_MakePoint(18.07, 59.33), 4326)::geography)`,
    )
    await seedSavedFeatures(db, source)
    const otherDb = await createUser(other)
    pools.push(otherDb)
    await otherDb.query(
      'INSERT INTO feed_image(content_type,data,width,height,byte_size) VALUES($1,$2,1,1,$3)',
      ['image/webp', otherImageBytes, otherImageBytes.length],
    )
    const otherJournal = await journal.createJournalEntry(
      other,
      createJournalEntryBodySchema.parse({
        title: 'OTHER TENANT JOURNAL',
        content: 'OTHER TENANT JOURNAL CONTENT',
        occurred_at: '2026-11-13T10:00:00Z',
      }),
    )
    await journal.addJournalAttachment(other, otherJournal.id, {
      filename: 'other.png',
      mime_type: 'image/png',
      bytes: otherJournalBytes,
    })
    await tasks.createTaskItem(other, createTaskItemBodySchema.parse({ title: 'OTHER TENANT TASK' }))
    await people.createPerson(
      other,
      createPersonBodySchema.parse({
        name: 'OTHER TENANT ONLY',
        relationship: 'friend',
        needs: ['maintain_friendship'],
        date_of_birth: '1990-01-01',
      }),
    )
  }, 120_000)

  afterAll(async () => {
    await Promise.all(pools.map((pool) => pool.end()))
    await withClient(adminUri().toString(), async (admin) => {
      for (const user of [source, target, other]) {
        await admin.query(format('DROP DATABASE IF EXISTS %I WITH (FORCE)', userDbName(user)))
        await admin.query(format('DROP USER IF EXISTS %I', user))
      }
    }).catch(() => {})
    if (dir) await rm(dir, { force: true, recursive: true })
  })

  test('the real pg_dump passes the version check against the server', async () => {
    expect(await createDumpExporter({ conn: conn() }).check(source)).toEqual({ ok: true })
  })

  test('ordinary database roles cannot read another account while privileged support access remains possible', async () => {
    const ownUri = new URL(databaseUri(userDbName(source)))
    ownUri.username = source
    ownUri.password = 'pw'
    await withClient(ownUri.toString(), async (ordinary) => {
      expect((await ordinary.query('SELECT id FROM journal_entries')).rowCount).toBeGreaterThan(0)
      expect((await ordinary.query('SELECT id FROM journal_attachments')).rowCount).toBeGreaterThan(0)
    })
    const otherUri = new URL(ownUri)
    otherUri.pathname = `/${userDbName(other)}`
    await withClient(otherUri.toString(), async (ordinary) => {
      await expect(ordinary.query('SELECT id FROM journal_entries')).rejects.toMatchObject({ code: '42501' })
      await expect(ordinary.query('SELECT bytes FROM journal_attachments')).rejects.toMatchObject({
        code: '42501',
      })
    })
    await withClient(databaseUri(userDbName(source)), async (privileged) => {
      const supportRecord = await privileged.query(
        `SELECT e.payload->>'content' AS content, a.bytes FROM journal_entries e
         JOIN journal_attachments a ON a.entry_id=e.id
         WHERE e.payload->>'title'='Synthetic backup reflection'`,
      )
      expect(supportRecord.rows).toEqual([{ content: 'Revised content', bytes: journalAudioBytes }])
    })
  })

  test('downloads the real pg_dump over HTTP and restores with the documented steps', async () => {
    const exporter = createDumpExporter({ conn: conn(), onExported: async () => {} })
    const tokens = createExportTokens('0123456789abcdef0123456789abcdef')
    const requestDumpLink = createDumpLinkIssuer({ apiBaseUrl: 'http://export.test', exporter, tokens })
    const app = express()
    app.use(
      '/export',
      createExportRouter({
        exporter,
        tokens,
        requestDumpLink,
        authMiddleware: (req, res, next) => {
          if (req.headers.authorization !== 'Bearer export-fixture') {
            res.status(401).json({ success: false, error: 'Unauthorized' })
            return
          }
          req.user = source
          next()
        },
      }),
    )
    expect((await supertest(app).post('/export/dump-link')).status).toBe(401)
    const link = await supertest(app).post('/export/dump-link').set('Authorization', 'Bearer export-fixture')
    expect(link.status).toBe(200)
    expect(link.body.success).toBe(true)
    const url = new URL(link.body.url)
    expect(tokens.verifyExportToken(url.searchParams.get('token') ?? '')?.user).toBe(source)
    const download = await supertest(app)
      .get(url.pathname + url.search)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('error', callback)
        response.on('end', () => callback(null, Buffer.concat(chunks)))
      })
    expect(download.status).toBe(200)
    expect(download.headers['content-type']).toBe('application/gzip')
    expect(download.headers['cache-control']).toBe('no-store')
    expect(download.headers['content-disposition']).toMatch(
      new RegExp(`^attachment; filename="aurboda-${source}-\\d{4}-\\d{2}-\\d{2}\\.sql\\.gz"$`),
    )
    expect(download.body.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]))
    expect(gunzipSync(download.body).toString('utf8').startsWith(DUMP_FORMAT_METADATA)).toBe(true)
    await writeFile(dumpPath, download.body)
    expect((await supertest(app).get(url.pathname + url.search)).status).toBe(401)

    // docs/data-export.md, "Restore": sign up as the user (here: createUser), then recreate
    // the database empty with its extensions, then feed the dump to psql as the user.
    execFileSync('gzip', ['-t', dumpPath])
    await createUser(target).then((pool) => pool.end())
    const database = userDbName(target)
    await withClient(adminUri().toString(), async (admin) => {
      await admin.query(format('DROP DATABASE %I WITH (FORCE)', database))
      await admin.query(format('CREATE DATABASE %I OWNER %I', database, target))
    })
    await withClient(databaseUri(database), async (db) => {
      await db.query('CREATE EXTENSION postgis')
      await db.query('CREATE EXTENSION pg_trgm')
      await db.query('CREATE EXTENSION unaccent')
    })

    const restore = `set -o pipefail; (echo 'SET ROLE "${target}";'; gunzip -c "$DUMP" | grep -v -e '^COMMENT ON EXTENSION' -e '^SET transaction_timeout') | psql -v ON_ERROR_STOP=1 --quiet "$TARGET_URI"`
    execFileSync('bash', ['-c', restore], {
      env: { ...process.env, DUMP: dumpPath, TARGET_URI: databaseUri(database) },
      stdio: ['ignore', 'ignore', 'pipe'],
    })

    const restored = createRolePool({ connectionString: databaseUri(database), max: 2 }, target)
    pools.push(restored)
    _setDbForUser(target, restored)

    expect(await counts(restored)).toEqual(await counts(pools[0]))
    expect(await counts(restored)).toMatchObject({ activities: 2, locations: 1 })
    const tableInventory = "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
    expect((await restored.query(tableInventory)).rows).toEqual((await pools[0].query(tableInventory)).rows)
    const expected = await savedRows(pools[0])
    for (const table of savedTables) {
      expect(expected[table], `${table} fixture must contain saved data`).not.toHaveLength(0)
    }
    expect(await savedRows(restored)).toEqual(expected)
    const reflection = (
      await restored.query(
        "SELECT id,area_id,payload,created_at,updated_at,deleted_at FROM journal_entries WHERE payload->>'title'='Synthetic backup reflection'",
      )
    ).rows[0]
    expect(reflection.payload).toMatchObject({
      content: 'Revised content',
      occurred_at: '2026-11-13T10:00:00Z',
      tags: ['backup', 'reflection'],
      favorite: true,
      pinned: true,
    })
    expect(reflection.deleted_at).toBeNull()
    expect(
      (await restored.query('SELECT name FROM journal_areas WHERE id=$1', [reflection.area_id])).rows,
    ).toEqual([{ name: 'Synthetic personal area' }])
    expect((await journal.listJournalRevisions(target, reflection.id))[0].snapshot.content).toBe(
      journalOriginalContent,
    )
    const attempts = (
      await restored.query(
        "SELECT id FROM journal_entries WHERE payload->>'title' LIKE 'Synthetic workbook %' ORDER BY payload->>'title'",
      )
    ).rows
    expect(attempts).toHaveLength(3)
    const states = []
    for (const { id } of attempts) {
      const attempt = await journal.getJournalEntry(target, id)
      const workbook = attempt.workbook
      if (!workbook) throw new Error('Expected restored workbook')
      expect(workbook.definition).toEqual(JOURNAL_CATALOG[0])
      expect(workbook.answers).toEqual({ [JOURNAL_CATALOG[0].sections[0].prompts[0].id]: workbookAnswer })
      expect(workbook.completed_sections).not.toHaveLength(0)
      expect(workbook.current_section).toBe(
        JOURNAL_CATALOG[0].sections[JOURNAL_CATALOG[0].sections.length - 1].id,
      )
      expect(attempt.links).toEqual([
        { kind: 'entry', record_id: reflection.id, label: 'Earlier reflection' },
      ])
      states.push(workbook.status)
    }
    expect(states.sort()).toEqual(['archived', 'completed', 'in_progress'])
    const restoredJournalMedia = (
      await restored.query(
        'SELECT id,entry_id,filename,mime_type,size,prompt_id,bytes FROM journal_attachments ORDER BY filename',
      )
    ).rows
    expect(
      restoredJournalMedia.map(({ filename, mime_type, size, prompt_id, bytes }) => ({
        filename,
        mime_type,
        size,
        prompt_id,
        bytes,
      })),
    ).toEqual([
      {
        filename: 'synthetic-image.png',
        mime_type: 'image/png',
        size: journalImageBytes.length,
        prompt_id: JOURNAL_CATALOG[0].sections[0].prompts[0].id,
        bytes: journalImageBytes,
      },
      {
        filename: 'synthetic-recording.webm',
        mime_type: 'audio/webm',
        size: journalAudioBytes.length,
        prompt_id: null,
        bytes: journalAudioBytes,
      },
      {
        filename: 'trashed-recording.webm',
        mime_type: 'audio/webm',
        size: journalAudioBytes.length,
        prompt_id: null,
        bytes: journalAudioBytes,
      },
    ])
    for (const media of restoredJournalMedia) {
      expect((await journal.getJournalAttachment(target, media.id)).bytes).toEqual(media.bytes)
      await expect(journal.getJournalAttachment(other, media.id)).rejects.toMatchObject({ status: 404 })
    }
    const trashed = (
      await restored.query(
        "SELECT id,deleted_at FROM journal_entries WHERE payload->>'title'='Synthetic trashed entry'",
      )
    ).rows[0]
    expect(trashed.deleted_at).toBeInstanceOf(Date)
    expect((await journal.listJournalRevisions(target, trashed.id))[0].snapshot.content).toBe(
      'Recoverable trash content',
    )
    expect(
      (await restored.query("SELECT id FROM journal_entries WHERE payload->>'title'='OTHER TENANT JOURNAL'"))
        .rows,
    ).toEqual([])
    expect(
      (await restored.query('SELECT id FROM journal_attachments WHERE bytes=$1', [otherJournalBytes])).rows,
    ).toEqual([])

    expect((await restored.query('SELECT data,byte_size FROM feed_image')).rows).toEqual([
      { data: storedImageBytes, byte_size: storedImageBytes.length },
    ])
    expect((await restored.query('SELECT data FROM uploaded_icons')).rows).toEqual(
      (await pools[0].query('SELECT data FROM uploaded_icons')).rows,
    )
    expect((await restored.query('SELECT id FROM feed_image WHERE data=$1', [otherImageBytes])).rows).toEqual(
      [],
    )
    expect(
      (await restored.query("SELECT profile FROM people WHERE profile->>'name'='OTHER TENANT ONLY'")).rows,
    ).toEqual([])
    expect(
      (await pools[1].query("SELECT profile FROM people WHERE profile->>'name'='OTHER TENANT ONLY'")).rows,
    ).toHaveLength(1)
    expect(
      (
        await restored.query(`SELECT e.event->'payload'->>'relationship_state_change' AS change
      FROM people_events e JOIN people p ON p.id=e.person_id
      WHERE e.event->>'type'='relationship_state' ORDER BY change`)
      ).rows,
    ).toEqual([{ change: 'ended' }, { change: 'started' }])
    expect(
      (
        await restored.query(`SELECT t.stable_key, r.value, v.snapshot->>'prompt' AS prompt
      FROM assessment_responses r JOIN assessments a ON a.id=r.assessment_id
      JOIN questionnaire_templates t ON t.id=a.template_id
      JOIN assessment_question_versions v ON v.question_id=r.question_id AND v.version=r.question_version
      ORDER BY t.stable_key`)
      ).rows,
    ).toEqual([
      { stable_key: 'fixture_mental_assessment', value: 4, prompt: 'Original fixture question?' },
      {
        stable_key: 'simple_food_daily_check',
        value: ['vegetables', 'beans'],
        prompt: 'Original fixture question?',
      },
    ])
    expect(
      (
        await restored.query(`SELECT a.dose, i.dose AS planned_dose, r.name, s.analysis_key
      FROM administration_events a JOIN regimen_items i ON i.id=a.regimen_item_id
      JOIN regimens r ON r.id=i.regimen_id JOIN substances s ON s.id=a.substance_id`)
      ).rows,
    ).toEqual([
      { dose: 5, planned_dose: 5, name: 'Fixture morning regimen', analysis_key: 'fixture_supplement' },
    ])

    expect(
      (
        await restored.query(
          "SELECT payload->>'title' AS title FROM task_items WHERE payload->>'title'='OTHER TENANT TASK'",
        )
      ).rows,
    ).toEqual([])
    expect(
      (
        await restored.query(
          "SELECT t.payload->>'title' AS title, t.payload->>'done' AS done, t.payload->>'workflow_status' AS workflow_status, p.payload->>'title' AS project FROM task_items t JOIN task_projects p ON p.id=t.project_id WHERE t.payload->>'title' <> 'Review household supplies' ORDER BY t.payload->>'title'",
        )
      ).rows,
    ).toEqual([
      { title: 'Check smoke alarm batteries', done: 'true', workflow_status: 'done', project: 'Household' },
      { title: 'Plan weekend walk', done: 'false', workflow_status: 'in_progress', project: 'Household' },
    ])

    expect(
      (
        await restored.query(`SELECT original.payload->>'recurrence' AS recurrence,
          original.payload->>'done' AS done, upcoming.payload->>'due_date' AS next_due,
          upcoming.payload->>'recurrence_anchor_day' AS anchor,
          upcoming.payload->>'workflow_status' AS next_status
          FROM task_items original JOIN task_items upcoming
            ON upcoming.id::text=original.payload->>'next_occurrence_id'
          WHERE original.payload->>'title'='Review household supplies'`)
      ).rows,
    ).toEqual([
      { recurrence: 'monthly', done: 'true', next_due: '2026-02-28', anchor: '31', next_status: 'todo' },
    ])

    expect(
      (await restored.query('SELECT columns FROM task_board_settings WHERE id=1')).rows[0].columns.map(
        (column: { id: string }) => column.id,
      ),
    ).toEqual([
      'todo',
      'in_progress',
      'done',
      (await restored.query('SELECT column_id FROM task_onboarding_seed WHERE id=1')).rows[0].column_id,
      'review',
    ])

    expect(
      (await restored.query("SELECT payload FROM task_items WHERE payload->>'title'='Plan weekend walk'"))
        .rows[0].payload,
    ).toMatchObject({
      column_id: 'review',
      position: 12,
      labels: ['family'],
      checklist: [{ id: 'boots', title: 'Pack boots', done: true }],
      custom_fields: [{ name: 'Trail', value: 'Lake' }],
      archived: true,
      blocked_reason: 'Weather',
    })
    expect(
      (await restored.query('SELECT columns FROM task_board_settings WHERE id=1')).rows[0].columns[4],
    ).toEqual({ id: 'review', title: 'Review', status: 'in_progress', color: '#123456', wip_limit: 3 })
    const owners = await restored.query<{ tableowner: string }>(
      `SELECT DISTINCT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'spatial_ref_sys'`,
    )
    expect(owners.rows.map((row) => row.tableowner)).toEqual([target])

    const seed = (await restored.query('SELECT * FROM task_onboarding_seed')).rows
    expect(seed).toHaveLength(1)
    expect(seed[0].catalog_key).toBe('optional-kanban-onboarding')
    const seeded = await restored.query(
      "SELECT payload->>'description' AS description FROM task_items WHERE payload->>'column_id'=$1 ORDER BY id",
      [seed[0].column_id],
    )
    expect(seeded.rows.length).toBeGreaterThan(0)
    expect(seeded.rows.every(({ description }) => description.length > 0)).toBe(true)
    expect(seeded.rows).toEqual(
      (
        await pools[0].query(
          "SELECT payload->>'description' AS description FROM task_items WHERE payload->>'column_id'=$1 ORDER BY id",
          [seed[0].column_id],
        )
      ).rows,
    )
    await expect(migrateSchemaIfNeeded(target)).resolves.toBeUndefined()
    expect((await restored.query('SELECT * FROM task_onboarding_seed')).rows).toEqual(seed)
    expect(await savedRows(restored)).toEqual(expected)
  }, 120_000)
})

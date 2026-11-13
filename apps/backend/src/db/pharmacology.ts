import type {
  AdministrationEvent,
  Assessment,
  AssessmentAnswer,
  AssessmentQuestion,
  ConfirmRegimenBody,
  ContextEvent,
  ContextEventType,
  CorrectAssessmentBody,
  CreateAdministrationBody,
  CreateContextEventBody,
  CreateContextEventTypeBody,
  CreateQuestionnaireBody,
  CreateRegimenBody,
  CreateSubstanceBody,
  CreateTreatmentSessionBody,
  CreateTreatmentTypeBody,
  PharmacologyExport,
  QuestionnaireTemplate,
  Regimen,
  RegimenItem,
  SubmitAssessmentBody,
  Substance,
  TreatmentSession,
  TreatmentType,
  UpdateAdministrationBody,
  UpdateContextEventBody,
  UpdateContextEventTypeBody,
  UpdateQuestionnaireBody,
  UpdateRegimenBody,
  UpdateSubstanceBody,
  UpdateTreatmentSessionBody,
  UpdateTreatmentTypeBody,
} from '@aurboda/api-spec'

import { query, withUserTransaction } from './connection.ts'
import type { Queryable } from './pool.ts'

type DbTarget = string | Queryable
type Row = Record<string, unknown>

const iso = (value: unknown): string => (value instanceof Date ? value : new Date(String(value))).toISOString()
const nullableIso = (value: unknown): string | null => (value == null ? null : iso(value))
const date = (value: unknown): string | null =>
  value == null ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
const json = <T>(value: unknown, fallback: T): T => (value == null ? fallback : (value as T))
const present = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null)) as T

const substanceFromRow = (row: Row): Substance =>
  present({
    id: String(row.id),
    analysis_key: String(row.analysis_key),
    display_name: String(row.display_name),
    generic_name: row.generic_name as string | null,
    brand_name: row.brand_name as string | null,
    category: row.category as Substance['category'],
    custom_category: row.custom_category as string | null,
    formulation: row.formulation as string | null,
    route: row.route as string | null,
    strength: row.strength == null ? null : Number(row.strength),
    strength_unit: row.strength_unit as string | null,
    default_dose: row.default_dose == null ? null : Number(row.default_dose),
    dose_unit: String(row.dose_unit),
    manufacturer: row.manufacturer as string | null,
    start_date: date(row.start_date),
    end_date: date(row.end_date),
    status: row.status as Substance['status'],
    notes: row.notes as string | null,
    tags: json<string[]>(row.tags, []),
    favorite: Boolean(row.favorite),
    version: Number(row.version),
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  })

const SUBSTANCE_COLUMNS = `id, analysis_key, display_name, generic_name, brand_name, category,
  custom_category, formulation, route, strength, strength_unit, default_dose, dose_unit,
  manufacturer, start_date, end_date, status, notes, tags, favorite, version, created_at, updated_at`

export const getSubstance = async (db: DbTarget, id: string): Promise<Substance | null> => {
  const result = await query(db, `SELECT ${SUBSTANCE_COLUMNS} FROM substances WHERE id = $1`, [id])
  return result.rows[0] ? substanceFromRow(result.rows[0]) : null
}

export const listSubstances = async (db: DbTarget, status?: string): Promise<Substance[]> => {
  const result = await query(
    db,
    `SELECT ${SUBSTANCE_COLUMNS} FROM substances
     ${status ? 'WHERE status = $1' : ''}
     ORDER BY favorite DESC, display_name`,
    status ? [status] : [],
  )
  return result.rows.map(substanceFromRow)
}

const analysisKey = (name: string): string => {
  const key = name
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/^_+|_+$/g, '')
    .slice(0, 20)
  return /^[a-z]/.test(key) ? key : `substance_${key || 'item'}`
}

const snapshotSubstance = async (db: DbTarget, substance: Substance, reason?: string): Promise<void> => {
  await query(
    db,
    `INSERT INTO substance_versions (substance_id, version, snapshot, reason)
     VALUES ($1, $2, $3::jsonb, $4) ON CONFLICT (substance_id, version) DO NOTHING`,
    [substance.id, substance.version, JSON.stringify(substance), reason ?? null],
  )
}

export const createSubstance = async (user: string, input: CreateSubstanceBody): Promise<Substance> =>
  withUserTransaction(user, async (tx) => {
    const result = await query(
      tx,
      `INSERT INTO substances
       (analysis_key, display_name, generic_name, brand_name, category, custom_category, formulation,
        route, strength, strength_unit, default_dose, dose_unit, manufacturer, start_date, end_date,
        status, notes, tags, favorite)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19)
       RETURNING ${SUBSTANCE_COLUMNS}`,
      [
        input.analysis_key ?? analysisKey(input.display_name), input.display_name, input.generic_name ?? null,
        input.brand_name ?? null, input.category, input.custom_category ?? null, input.formulation ?? null,
        input.route ?? null, input.strength ?? null, input.strength_unit ?? null, input.default_dose ?? null,
        input.dose_unit, input.manufacturer ?? null, input.start_date ?? null, input.end_date ?? null,
        input.status, input.notes ?? null, JSON.stringify(input.tags), input.favorite,
      ],
    )
    const substance = substanceFromRow(result.rows[0])
    await snapshotSubstance(tx, substance, 'created')
    return substance
  })

const SUBSTANCE_PATCH_COLUMNS: Record<string, string> = {
  analysis_key: 'analysis_key', display_name: 'display_name', generic_name: 'generic_name',
  brand_name: 'brand_name', category: 'category', custom_category: 'custom_category',
  formulation: 'formulation', route: 'route', strength: 'strength', strength_unit: 'strength_unit',
  default_dose: 'default_dose', dose_unit: 'dose_unit', manufacturer: 'manufacturer',
  start_date: 'start_date', end_date: 'end_date', status: 'status', notes: 'notes', tags: 'tags',
  favorite: 'favorite',
}

// eslint-disable-next-line complexity -- generic patch construction handles JSON columns and empty updates centrally
const patchRecord = async (
  db: DbTarget,
  table: string,
  id: string,
  input: Record<string, unknown>,
  columns: Record<string, string>,
  returning: string,
  extraSet: string[] = [],
): Promise<Row | null> => {
  const values: unknown[] = []
  const sets: string[] = []
  for (const [field, column] of Object.entries(columns)) {
    if (input[field] === undefined) continue
    values.push(field === 'tags' || field === 'reminder' || field === 'schedule' || field === 'metadata' || field === 'adverse_events' || field === 'follow_up_hours' || field === 'default_follow_up_hours' ? JSON.stringify(input[field]) : input[field])
    sets.push(`${column} = $${values.length}${field === 'tags' || field === 'reminder' || field === 'schedule' || field === 'metadata' || field === 'adverse_events' || field === 'follow_up_hours' || field === 'default_follow_up_hours' ? '::jsonb' : ''}`)
  }
  sets.push(...extraSet)
  if (sets.length === 0) {
    const current = await query(db, `SELECT ${returning} FROM ${table} WHERE id = $1`, [id])
    return current.rows[0] ?? null
  }
  values.push(id)
  const result = await query(db, `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING ${returning}`, values)
  return result.rows[0] ?? null
}

export const updateSubstance = async (
  user: string,
  id: string,
  input: UpdateSubstanceBody,
): Promise<Substance | null> =>
  withUserTransaction(user, async (tx) => {
    const existing = await getSubstance(tx, id)
    if (!existing) return null
    const row = await patchRecord(tx, 'substances', id, input, SUBSTANCE_PATCH_COLUMNS, SUBSTANCE_COLUMNS, [
      'version = version + 1',
      'updated_at = NOW()',
    ])
    const substance = substanceFromRow(row!)
    await snapshotSubstance(tx, substance, input.change_reason)
    return substance
  })

export const archiveSubstance = (user: string, id: string): Promise<Substance | null> =>
  updateSubstance(user, id, { status: 'archived', change_reason: 'archived' })

const regimenItemFromRow = (row: Row): RegimenItem =>
  present({
    id: String(row.id), regimen_id: String(row.regimen_id), substance_id: String(row.substance_id),
    dose: Number(row.dose), dose_unit: String(row.dose_unit), route: row.route as string | null,
    scheduled_local_time: row.scheduled_local_time == null ? null : String(row.scheduled_local_time).slice(0, 8),
    schedule_override: row.schedule_override as RegimenItem['schedule_override'], sort_order: Number(row.sort_order),
    paused: Boolean(row.paused), start_date: date(row.start_date), end_date: date(row.end_date),
    substance: { id: String(row.substance_id), analysis_key: String(row.analysis_key), display_name: String(row.display_name), status: row.substance_status as Substance['status'] },
  })

const REGIMEN_COLUMNS = `id, name, description, schedule, start_date, end_date, status, sort_order,
  reminder, version, created_at, updated_at`
const REGIMEN_ITEM_SELECT = `ri.id, ri.regimen_id, ri.substance_id, ri.dose, ri.dose_unit, ri.route,
  ri.scheduled_local_time, ri.schedule_override, ri.sort_order, ri.paused, ri.start_date, ri.end_date,
  s.analysis_key, s.display_name, s.status AS substance_status`

const getRegimenItems = async (db: DbTarget, regimenIds: string[]): Promise<Map<string, RegimenItem[]>> => {
  const grouped = new Map<string, RegimenItem[]>()
  if (regimenIds.length === 0) return grouped
  const result = await query(db, `SELECT ${REGIMEN_ITEM_SELECT} FROM regimen_items ri JOIN substances s ON s.id = ri.substance_id WHERE ri.regimen_id = ANY($1::uuid[]) ORDER BY ri.sort_order, ri.created_at`, [regimenIds])
  for (const row of result.rows) {
    const item = regimenItemFromRow(row)
    const items = grouped.get(item.regimen_id) ?? []
    items.push(item)
    grouped.set(item.regimen_id, items)
  }
  return grouped
}

const regimenFromRow = (row: Row, items: RegimenItem[]): Regimen =>
  present({ id: String(row.id), name: String(row.name), description: row.description as string | null,
    schedule: row.schedule as Regimen['schedule'], start_date: date(row.start_date), end_date: date(row.end_date),
    status: row.status as Regimen['status'], sort_order: Number(row.sort_order), reminder: json(row.reminder, { enabled: false, minutes_before: [] }),
    version: Number(row.version), items, created_at: iso(row.created_at), updated_at: iso(row.updated_at) })

export const getRegimen = async (db: DbTarget, id: string): Promise<Regimen | null> => {
  const result = await query(db, `SELECT ${REGIMEN_COLUMNS} FROM regimens WHERE id = $1`, [id])
  if (!result.rows[0]) return null
  const items = await getRegimenItems(db, [id])
  return regimenFromRow(result.rows[0], items.get(id) ?? [])
}

export const listRegimens = async (db: DbTarget, status?: string): Promise<Regimen[]> => {
  const result = await query(db, `SELECT ${REGIMEN_COLUMNS} FROM regimens ${status ? 'WHERE status = $1' : ''} ORDER BY sort_order, name`, status ? [status] : [])
  const ids = result.rows.map((row) => String(row.id))
  const items = await getRegimenItems(db, ids)
  return result.rows.map((row) => regimenFromRow(row, items.get(String(row.id)) ?? []))
}

const replaceRegimenItems = async (db: DbTarget, regimenId: string, items: CreateRegimenBody['items']): Promise<void> => {
  await query(db, `DELETE FROM regimen_items WHERE regimen_id = $1`, [regimenId])
  for (const item of items) {
    await query(db, `INSERT INTO regimen_items (id, regimen_id, substance_id, dose, dose_unit, route, scheduled_local_time, schedule_override, sort_order, paused, start_date, end_date) VALUES (COALESCE($1::uuid, gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12)`, [item.id ?? null, regimenId, item.substance_id, item.dose, item.dose_unit, item.route ?? null, item.scheduled_local_time ?? null, item.schedule_override == null ? null : JSON.stringify(item.schedule_override), item.sort_order, item.paused, item.start_date ?? null, item.end_date ?? null])
  }
}

const snapshotRegimen = async (db: DbTarget, regimen: Regimen, reason?: string): Promise<void> => {
  await query(db, `INSERT INTO regimen_versions (regimen_id, version, snapshot, reason) VALUES ($1,$2,$3::jsonb,$4) ON CONFLICT (regimen_id, version) DO NOTHING`, [regimen.id, regimen.version, JSON.stringify(regimen), reason ?? null])
}

export const createRegimen = async (user: string, input: CreateRegimenBody): Promise<Regimen> =>
  withUserTransaction(user, async (tx) => {
    const result = await query(tx, `INSERT INTO regimens (name, description, schedule, start_date, end_date, status, sort_order, reminder) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8::jsonb) RETURNING ${REGIMEN_COLUMNS}`, [input.name, input.description ?? null, JSON.stringify(input.schedule), input.start_date ?? null, input.end_date ?? null, input.status, input.sort_order, JSON.stringify(input.reminder)])
    const id = String(result.rows[0].id)
    await replaceRegimenItems(tx, id, input.items)
    const regimen = (await getRegimen(tx, id))!
    await snapshotRegimen(tx, regimen, 'created')
    return regimen
  })

const REGIMEN_PATCH_COLUMNS = { name: 'name', description: 'description', schedule: 'schedule', start_date: 'start_date', end_date: 'end_date', status: 'status', sort_order: 'sort_order', reminder: 'reminder' }

export const updateRegimen = async (user: string, id: string, input: UpdateRegimenBody): Promise<Regimen | null> =>
  withUserTransaction(user, async (tx) => {
    if (!(await getRegimen(tx, id))) return null
    await patchRecord(tx, 'regimens', id, input, REGIMEN_PATCH_COLUMNS, REGIMEN_COLUMNS, ['version = version + 1', 'updated_at = NOW()'])
    if (input.items) await replaceRegimenItems(tx, id, input.items)
    const regimen = (await getRegimen(tx, id))!
    await snapshotRegimen(tx, regimen, input.change_reason)
    return regimen
  })

export const archiveRegimen = (user: string, id: string): Promise<Regimen | null> =>
  updateRegimen(user, id, { status: 'archived', change_reason: 'archived' })

const administrationFromRow = (row: Row): AdministrationEvent =>
  present({ id: String(row.id), substance_id: String(row.substance_id), regimen_item_id: row.regimen_item_id as string | null,
    treatment_session_id: row.treatment_session_id as string | null, administered_at: iso(row.administered_at),
    scheduled_at: nullableIso(row.scheduled_at), timezone: String(row.timezone), dose: row.dose == null ? null : Number(row.dose),
    dose_unit: row.dose_unit as string | null, route: row.route as string | null, status: row.status as AdministrationEvent['status'],
    source: String(row.source), reason: row.reason as string | null, notes: row.notes as string | null,
    side_effects: json<string[]>(row.side_effects, []), idempotency_key: row.idempotency_key as string | null,
    deleted_at: nullableIso(row.deleted_at), created_at: iso(row.created_at), updated_at: iso(row.updated_at) })

const ADMIN_COLUMNS = `id, substance_id, regimen_item_id, treatment_session_id, administered_at,
  scheduled_at, timezone, dose, dose_unit, route, status, source, reason, notes, side_effects,
  idempotency_key, deleted_at, created_at, updated_at`

export const getAdministration = async (db: DbTarget, id: string): Promise<AdministrationEvent | null> => {
  const result = await query(db, `SELECT ${ADMIN_COLUMNS} FROM administration_events WHERE id = $1`, [id])
  return result.rows[0] ? administrationFromRow(result.rows[0]) : null
}

export const listAdministrations = async (db: DbTarget, start?: string, end?: string, limit = 200): Promise<AdministrationEvent[]> => {
  const values: unknown[] = []
  const clauses = ['deleted_at IS NULL']
  if (start) { values.push(start); clauses.push(`administered_at >= $${values.length}`) }
  if (end) { values.push(end); clauses.push(`administered_at <= $${values.length}`) }
  values.push(limit)
  const result = await query(db, `SELECT ${ADMIN_COLUMNS} FROM administration_events WHERE ${clauses.join(' AND ')} ORDER BY administered_at DESC, created_at DESC LIMIT $${values.length}`, values)
  return result.rows.map(administrationFromRow)
}

export interface ProjectionKey { substance_id: string; administered_at: string; timezone: string }

export const exposureStatus = (status: AdministrationEvent['status']): boolean =>
  status === 'taken' || status === 'delayed' || status === 'partially_taken'

export const localDateForInstant = (timestamp: string | Date, timezone: string): string => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(timestamp))
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

const metricUnitKey = (unit: string): string =>
  unit.toLowerCase().replaceAll(/[^a-z0-9]+/g, '_').replaceAll(/^_+|_+$/g, '').slice(0, 11) || 'unit'

export const recomputeExposureProjection = async (db: DbTarget, key: ProjectionKey): Promise<void> => {
  const localDate = localDateForInstant(key.administered_at, key.timezone)
  const substance = await getSubstance(db, key.substance_id)
  if (!substance) return
  const midnight = await query(db, `SELECT ($1::date::timestamp AT TIME ZONE $2) AS instant`, [localDate, key.timezone])
  const pointTime = midnight.rows[0].instant as Date
  const prefix = `pharmacology_${substance.analysis_key}`
  await query(db, `UPDATE time_series SET deleted_at = NOW(), updated_at = NOW() WHERE source = 'pharmacology' AND time = $1 AND metric LIKE $2 AND deleted_at IS NULL`, [pointTime, `${prefix}%`])
  const aggregate = await query(db, `SELECT dose_unit, COUNT(*)::int AS count, SUM(dose)::double precision AS total FROM administration_events WHERE substance_id = $1 AND timezone = $2 AND (administered_at AT TIME ZONE timezone)::date = $3::date AND deleted_at IS NULL AND status IN ('taken','delayed','partially_taken') GROUP BY dose_unit`, [key.substance_id, key.timezone, localDate])
  if (aggregate.rows.length === 0) return
  const eventCount = aggregate.rows.reduce((sum, row) => sum + Number(row.count), 0)
  const definitions = [
    { metric: `${prefix}_taken`, unit: 'flag', value: 1 },
    { metric: `${prefix}_event_count`, unit: 'count', value: eventCount },
    ...aggregate.rows.map((row) => ({ metric: `${prefix}_dose_${metricUnitKey(String(row.dose_unit))}`, unit: String(row.dose_unit), value: Number(row.total) })),
  ]
  for (const definition of definitions) {
    await query(db, `INSERT INTO custom_metrics (name, unit, description, include_in_daily_summary, aggregation) VALUES ($1,$2,$3,TRUE,'sum') ON CONFLICT (name) DO NOTHING`, [definition.metric, definition.unit, `Derived observed administration projection for ${substance.display_name}.`])
    await query(db, `INSERT INTO time_series (time, metric, value, unit, source, deleted_at, updated_at) VALUES ($1,$2,$3,$4,'pharmacology',NULL,NOW()) ON CONFLICT (time, metric, source) DO UPDATE SET value = EXCLUDED.value, unit = EXCLUDED.unit, deleted_at = NULL, updated_at = NOW()`, [pointTime, definition.metric, definition.value, definition.unit])
  }
}

const insertAdministration = async (db: DbTarget, input: CreateAdministrationBody): Promise<{ event: AdministrationEvent; created: boolean }> => {
  if (input.idempotency_key) {
    const existing = await query(db, `SELECT ${ADMIN_COLUMNS} FROM administration_events WHERE idempotency_key = $1`, [input.idempotency_key])
    if (existing.rows[0]) return { event: administrationFromRow(existing.rows[0]), created: false }
  }
  const result = await query(db, `INSERT INTO administration_events (substance_id, regimen_item_id, treatment_session_id, administered_at, scheduled_at, timezone, dose, dose_unit, route, status, source, reason, notes, side_effects, idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15) ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING RETURNING ${ADMIN_COLUMNS}`, [input.substance_id, input.regimen_item_id ?? null, input.treatment_session_id ?? null, input.administered_at, input.scheduled_at ?? null, input.timezone, input.dose ?? null, input.dose_unit ?? null, input.route ?? null, input.status, input.source, input.reason ?? null, input.notes ?? null, JSON.stringify(input.side_effects), input.idempotency_key ?? null])
  if (!result.rows[0] && input.idempotency_key) {
    const existing = await query(db, `SELECT ${ADMIN_COLUMNS} FROM administration_events WHERE idempotency_key = $1`, [input.idempotency_key])
    return { event: administrationFromRow(existing.rows[0]), created: false }
  }
  return { event: administrationFromRow(result.rows[0]), created: true }
}

export const createAdministration = async (user: string, input: CreateAdministrationBody): Promise<AdministrationEvent> =>
  withUserTransaction(user, async (tx) => {
    const { event, created } = await insertAdministration(tx, input)
    if (created) await recomputeExposureProjection(tx, event)
    return event
  })

const ADMIN_PATCH_COLUMNS = { substance_id: 'substance_id', regimen_item_id: 'regimen_item_id', treatment_session_id: 'treatment_session_id', administered_at: 'administered_at', scheduled_at: 'scheduled_at', timezone: 'timezone', dose: 'dose', dose_unit: 'dose_unit', route: 'route', status: 'status', source: 'source', reason: 'reason', notes: 'notes', side_effects: 'side_effects', idempotency_key: 'idempotency_key' }

const writeAdministrationRevision = async (db: DbTarget, event: AdministrationEvent, action: string, reason?: string): Promise<void> => {
  await query(db, `INSERT INTO administration_event_revisions (administration_event_id, revision, snapshot, action, reason) SELECT $1, COALESCE(MAX(revision),0)+1, $2::jsonb, $3, $4 FROM administration_event_revisions WHERE administration_event_id = $1`, [event.id, JSON.stringify(event), action, reason ?? null])
}

export const updateAdministration = async (user: string, id: string, input: UpdateAdministrationBody): Promise<AdministrationEvent | null> =>
  withUserTransaction(user, async (tx) => {
    const existing = await getAdministration(tx, id)
    if (!existing) return null
    await writeAdministrationRevision(tx, existing, input.status === 'entered_in_error' ? 'entered_in_error' : 'corrected', input.correction_reason)
    const row = await patchRecord(tx, 'administration_events', id, input, ADMIN_PATCH_COLUMNS, ADMIN_COLUMNS, ['updated_at = NOW()'])
    const updated = administrationFromRow(row!)
    await recomputeExposureProjection(tx, existing)
    await recomputeExposureProjection(tx, updated)
    return updated
  })

export const voidAdministration = async (user: string, id: string, reason?: string): Promise<AdministrationEvent | null> =>
  withUserTransaction(user, async (tx) => {
    const existing = await getAdministration(tx, id)
    if (!existing) return null
    if (existing.deleted_at) return existing
    await writeAdministrationRevision(tx, existing, 'voided', reason)
    const result = await query(tx, `UPDATE administration_events SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING ${ADMIN_COLUMNS}`, [id])
    await recomputeExposureProjection(tx, existing)
    return administrationFromRow(result.rows[0])
  })

export const confirmRegimenItems = async (user: string, regimenId: string, input: ConfirmRegimenBody): Promise<AdministrationEvent[] | null> =>
  withUserTransaction(user, async (tx) => {
    const regimen = await getRegimen(tx, regimenId)
    if (!regimen) return null
    const byId = new Map(regimen.items.map((item) => [item.id, item]))
    const events: AdministrationEvent[] = []
    for (const selected of input.items) {
      const item = byId.get(selected.item_id)
      if (!item) throw new Error(`Regimen item ${selected.item_id} does not belong to regimen ${regimenId}`)
      const result = await insertAdministration(tx, {
        substance_id: item.substance_id, regimen_item_id: item.id, administered_at: input.administered_at,
        scheduled_at: input.scheduled_at, timezone: input.timezone, dose: selected.dose ?? (exposureStatus(selected.status) ? item.dose : null),
        dose_unit: selected.dose_unit ?? (exposureStatus(selected.status) ? item.dose_unit : null), route: selected.route ?? item.route,
        status: selected.status, source: 'regimen_confirmation', reason: selected.reason, notes: selected.notes,
        side_effects: selected.side_effects, idempotency_key: `${input.idempotency_key}:${item.id}`,
      })
      if (result.created) await recomputeExposureProjection(tx, result.event)
      events.push(result.event)
    }
    return events
  })

const treatmentTypeFromRow = (row: Row): TreatmentType =>
  present({ id: String(row.id), key: String(row.key), display_name: String(row.display_name), category: String(row.category),
    description: row.description as string | null, active: Boolean(row.active), default_follow_up_hours: json<number[]>(row.default_follow_up_hours, []),
    created_at: iso(row.created_at), updated_at: iso(row.updated_at) })
const TREATMENT_TYPE_COLUMNS = 'id, key, display_name, category, description, active, default_follow_up_hours, created_at, updated_at'

export const listTreatmentTypes = async (db: DbTarget): Promise<TreatmentType[]> => {
  const result = await query(db, `SELECT ${TREATMENT_TYPE_COLUMNS} FROM treatment_types ORDER BY active DESC, CASE key WHEN 'chamomile' THEN 0 WHEN 'meditation' THEN 1 WHEN 'ketamine' THEN 3 ELSE 2 END, display_name`)
  return result.rows.map(treatmentTypeFromRow)
}
export const createTreatmentType = async (db: DbTarget, input: CreateTreatmentTypeBody): Promise<TreatmentType> => {
  const result = await query(db, `INSERT INTO treatment_types (key, display_name, category, description, active, default_follow_up_hours) VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING ${TREATMENT_TYPE_COLUMNS}`, [input.key, input.display_name, input.category, input.description ?? null, input.active, JSON.stringify(input.default_follow_up_hours)])
  return treatmentTypeFromRow(result.rows[0])
}
const TREATMENT_TYPE_PATCH_COLUMNS = { key: 'key', display_name: 'display_name', category: 'category', description: 'description', active: 'active', default_follow_up_hours: 'default_follow_up_hours' }
export const updateTreatmentType = async (db: DbTarget, id: string, input: UpdateTreatmentTypeBody): Promise<TreatmentType | null> => {
  const normalized = { ...input, ...(input.default_follow_up_hours ? { default_follow_up_hours: input.default_follow_up_hours } : {}) }
  const row = await patchRecord(db, 'treatment_types', id, normalized, TREATMENT_TYPE_PATCH_COLUMNS, TREATMENT_TYPE_COLUMNS, ['updated_at = NOW()'])
  return row ? treatmentTypeFromRow(row) : null
}

const TREATMENT_SESSION_SELECT = `ts.id, ts.treatment_type_id, ts.planned_at, ts.actual_start, ts.actual_end,
  ts.timezone, ts.status, ts.setting, ts.provider, ts.protocol_reference, ts.intention, ts.notes,
  ts.concerns, ts.preparation_notes, ts.adverse_events, ts.metadata, ts.follow_up_hours, ts.created_at,
  ts.updated_at, ts.deleted_at, tt.key AS type_key, tt.display_name AS type_display_name,
  tt.category AS type_category, tt.description AS type_description, tt.active AS type_active,
  tt.default_follow_up_hours AS type_default_follow_up_hours, tt.created_at AS type_created_at,
  tt.updated_at AS type_updated_at`
const treatmentSessionFromRow = (row: Row): TreatmentSession =>
  present({ id: String(row.id), treatment_type: treatmentTypeFromRow({ id: row.treatment_type_id, key: row.type_key,
    display_name: row.type_display_name, category: row.type_category, description: row.type_description,
    active: row.type_active, default_follow_up_hours: row.type_default_follow_up_hours,
    created_at: row.type_created_at, updated_at: row.type_updated_at }), planned_at: nullableIso(row.planned_at),
    actual_start: nullableIso(row.actual_start), actual_end: nullableIso(row.actual_end), timezone: String(row.timezone),
    status: row.status as TreatmentSession['status'], setting: row.setting as string | null, provider: row.provider as string | null,
    protocol_reference: row.protocol_reference as string | null, intention: row.intention as string | null,
    notes: row.notes as string | null, concerns: row.concerns as string | null, preparation_notes: row.preparation_notes as string | null,
    adverse_events: json<string[]>(row.adverse_events, []), metadata: json<Record<string, unknown>>(row.metadata, {}),
    follow_up_hours: json<number[]>(row.follow_up_hours, []), created_at: iso(row.created_at), updated_at: iso(row.updated_at),
    deleted_at: nullableIso(row.deleted_at) })

export const getTreatmentSession = async (db: DbTarget, id: string): Promise<TreatmentSession | null> => {
  const result = await query(db, `SELECT ${TREATMENT_SESSION_SELECT} FROM treatment_sessions ts JOIN treatment_types tt ON tt.id = ts.treatment_type_id WHERE ts.id = $1`, [id])
  return result.rows[0] ? treatmentSessionFromRow(result.rows[0]) : null
}
export const listTreatmentSessions = async (db: DbTarget, start?: string, end?: string, limit = 200): Promise<TreatmentSession[]> => {
  const values: unknown[] = []
  const clauses = ['ts.deleted_at IS NULL']
  if (start) { values.push(start); clauses.push(`COALESCE(ts.actual_start, ts.planned_at) >= $${values.length}`) }
  if (end) { values.push(end); clauses.push(`COALESCE(ts.actual_start, ts.planned_at) <= $${values.length}`) }
  values.push(limit)
  const result = await query(db, `SELECT ${TREATMENT_SESSION_SELECT} FROM treatment_sessions ts JOIN treatment_types tt ON tt.id = ts.treatment_type_id WHERE ${clauses.join(' AND ')} ORDER BY COALESCE(ts.actual_start, ts.planned_at) DESC NULLS LAST LIMIT $${values.length}`, values)
  return result.rows.map(treatmentSessionFromRow)
}
export const createTreatmentSession = async (db: DbTarget, input: CreateTreatmentSessionBody): Promise<TreatmentSession> => {
  const result = await query(db, `INSERT INTO treatment_sessions (treatment_type_id, planned_at, actual_start, actual_end, timezone, status, setting, provider, protocol_reference, intention, notes, concerns, preparation_notes, adverse_events, metadata, follow_up_hours) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16::jsonb) RETURNING id`, [input.treatment_type_id, input.planned_at ?? null, input.actual_start ?? null, input.actual_end ?? null, input.timezone, input.status, input.setting ?? null, input.provider ?? null, input.protocol_reference ?? null, input.intention ?? null, input.notes ?? null, input.concerns ?? null, input.preparation_notes ?? null, JSON.stringify(input.adverse_events), JSON.stringify(input.metadata), JSON.stringify(input.follow_up_hours)])
  return (await getTreatmentSession(db, String(result.rows[0].id)))!
}
const TREATMENT_SESSION_PATCH_COLUMNS = { treatment_type_id: 'treatment_type_id', planned_at: 'planned_at', actual_start: 'actual_start', actual_end: 'actual_end', timezone: 'timezone', status: 'status', setting: 'setting', provider: 'provider', protocol_reference: 'protocol_reference', intention: 'intention', notes: 'notes', concerns: 'concerns', preparation_notes: 'preparation_notes', adverse_events: 'adverse_events', metadata: 'metadata', follow_up_hours: 'follow_up_hours' }
export const updateTreatmentSession = async (db: DbTarget, id: string, input: UpdateTreatmentSessionBody): Promise<TreatmentSession | null> => {
  const row = await patchRecord(db, 'treatment_sessions', id, input, TREATMENT_SESSION_PATCH_COLUMNS, 'id', ['updated_at = NOW()'])
  return row ? getTreatmentSession(db, id) : null
}
export const deleteTreatmentSession = async (db: DbTarget, id: string): Promise<boolean> => {
  const result = await query(db, `UPDATE treatment_sessions SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`, [id])
  return (result.rowCount ?? 0) > 0
}

const questionFromRow = (row: Row): AssessmentQuestion =>
  present({ id: String(row.id), stable_key: String(row.stable_key), version: Number(row.version), prompt: String(row.prompt),
    response_type: row.response_type as AssessmentQuestion['response_type'], required: Boolean(row.required),
    enabled: Boolean(row.enabled), sort_order: Number(row.sort_order), metric_name: row.metric_name as string | null,
    unit: row.unit as string | null, anchors: json<Record<string, unknown>>(row.anchors, {}), config: json<Record<string, unknown>>(row.config, {}) })
const QUESTION_COLUMNS = 'id, template_id, stable_key, version, prompt, response_type, required, enabled, sort_order, metric_name, unit, anchors, config'
const TEMPLATE_COLUMNS = 'id, stable_key, display_name, description, moment, enabled, version, created_at, updated_at'
const QUESTION_VERSION_COLUMNS = `id, template_id, stable_key, version, prompt, response_type,
  required, enabled, sort_order, metric_name, unit, anchors, config`
const templateFromRow = (row: Row, questions: AssessmentQuestion[]): QuestionnaireTemplate =>
  present({ id: String(row.id), stable_key: String(row.stable_key), display_name: String(row.display_name), description: row.description as string | null,
    moment: row.moment as QuestionnaireTemplate['moment'], enabled: Boolean(row.enabled), version: Number(row.version), questions,
    created_at: iso(row.created_at), updated_at: iso(row.updated_at) })
const getQuestions = async (db: DbTarget, templateIds: string[]): Promise<Map<string, AssessmentQuestion[]>> => {
  const map = new Map<string, AssessmentQuestion[]>()
  if (templateIds.length === 0) return map
  const result = await query(db, `SELECT ${QUESTION_COLUMNS} FROM assessment_questions WHERE template_id = ANY($1::uuid[]) ORDER BY sort_order, created_at`, [templateIds])
  for (const row of result.rows) {
    const id = String(row.template_id)
    const values = map.get(id) ?? []
    values.push(questionFromRow(row))
    map.set(id, values)
  }
  return map
}
export const getQuestionnaire = async (db: DbTarget, id: string): Promise<QuestionnaireTemplate | null> => {
  const result = await query(db, `SELECT ${TEMPLATE_COLUMNS} FROM questionnaire_templates WHERE id = $1`, [id])
  if (!result.rows[0]) return null
  const questions = await getQuestions(db, [id])
  return templateFromRow(result.rows[0], questions.get(id) ?? [])
}
export const listQuestionnaires = async (db: DbTarget): Promise<QuestionnaireTemplate[]> => {
  const result = await query(db, `SELECT ${TEMPLATE_COLUMNS} FROM questionnaire_templates ORDER BY moment, CASE WHEN stable_key IN ('ketamine_pre_session', 'ketamine_post_session', 'ketamine_next_day') THEN 1 ELSE 0 END, display_name`)
  const ids = result.rows.map((row) => String(row.id))
  const questions = await getQuestions(db, ids)
  return result.rows.map((row) => templateFromRow(row, questions.get(String(row.id)) ?? []))
}
const replaceQuestions = async (db: DbTarget, templateId: string, questions: CreateQuestionnaireBody['questions']): Promise<void> => {
  const retained = questions.flatMap((question) => question.id ? [question.id] : [])
  const disabled = await query(
    db,
    `UPDATE assessment_questions
     SET enabled = FALSE, version = version + 1, updated_at = NOW()
     WHERE template_id = $1 AND enabled = TRUE AND NOT (id = ANY($2::uuid[]))
     RETURNING ${QUESTION_VERSION_COLUMNS}`,
    [templateId, retained],
  )
  for (const row of disabled.rows) {
    await query(
      db,
      `INSERT INTO assessment_question_versions (question_id, version, snapshot)
       VALUES ($1, $2, $3::jsonb) ON CONFLICT (question_id, version) DO NOTHING`,
      [row.id, row.version, JSON.stringify(row)],
    )
  }
  for (const question of questions) {
    const stored = await query(
      db,
      `INSERT INTO assessment_questions
       (id, template_id, stable_key, version, prompt, response_type, required, enabled, sort_order,
        metric_name, unit, anchors, config)
       VALUES (COALESCE($1::uuid,gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb)
       ON CONFLICT (template_id,stable_key) DO UPDATE SET
         version = assessment_questions.version + 1,
         prompt = EXCLUDED.prompt,
         response_type = EXCLUDED.response_type,
         required = EXCLUDED.required,
         enabled = EXCLUDED.enabled,
         sort_order = EXCLUDED.sort_order,
         metric_name = EXCLUDED.metric_name,
         unit = EXCLUDED.unit,
         anchors = EXCLUDED.anchors,
         config = EXCLUDED.config,
         updated_at = NOW()
       RETURNING ${QUESTION_VERSION_COLUMNS}`,
      [
        question.id ?? null,
        templateId,
        question.stable_key,
        question.version ?? 1,
        question.prompt,
        question.response_type,
        question.required,
        question.enabled,
        question.sort_order,
        question.metric_name ?? null,
        question.unit ?? null,
        JSON.stringify(question.anchors),
        JSON.stringify(question.config),
      ],
    )
    const row = stored.rows[0]
    await query(
      db,
      `INSERT INTO assessment_question_versions (question_id, version, snapshot)
       VALUES ($1, $2, $3::jsonb) ON CONFLICT (question_id, version) DO NOTHING`,
      [row.id, row.version, JSON.stringify(row)],
    )
  }
}
export const createQuestionnaire = async (user: string, input: CreateQuestionnaireBody): Promise<QuestionnaireTemplate> =>
  withUserTransaction(user, async (tx) => {
    const result = await query(tx, `INSERT INTO questionnaire_templates (stable_key, display_name, description, moment, enabled) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [input.stable_key, input.display_name, input.description ?? null, input.moment, input.enabled])
    const id = String(result.rows[0].id)
    await replaceQuestions(tx, id, input.questions)
    return (await getQuestionnaire(tx, id))!
  })
const TEMPLATE_PATCH_COLUMNS = { stable_key: 'stable_key', display_name: 'display_name', description: 'description', moment: 'moment', enabled: 'enabled' }
export const updateQuestionnaire = async (user: string, id: string, input: UpdateQuestionnaireBody): Promise<QuestionnaireTemplate | null> =>
  withUserTransaction(user, async (tx) => {
    if (!(await getQuestionnaire(tx, id))) return null
    await patchRecord(tx, 'questionnaire_templates', id, input, TEMPLATE_PATCH_COLUMNS, TEMPLATE_COLUMNS, ['version = version + 1', 'updated_at = NOW()'])
    if (input.questions) await replaceQuestions(tx, id, input.questions)
    return getQuestionnaire(tx, id)
  })

const assessmentFromRow = (row: Row, responses: AssessmentAnswer[]): Assessment =>
  present({ id: String(row.id), template_id: String(row.template_id), template_version: Number(row.template_version),
    treatment_session_id: row.treatment_session_id as string | null, stage: row.stage as string | null,
    assessed_at: iso(row.assessed_at), timezone: String(row.timezone), notes: row.notes as string | null, responses,
    created_at: iso(row.created_at), updated_at: iso(row.updated_at), deleted_at: nullableIso(row.deleted_at) })
const ASSESSMENT_COLUMNS = 'id, template_id, template_version, treatment_session_id, stage, assessed_at, timezone, notes, created_at, updated_at, deleted_at'
const responsesFor = async (db: DbTarget, assessmentIds: string[]): Promise<Map<string, AssessmentAnswer[]>> => {
  const map = new Map<string, AssessmentAnswer[]>()
  if (assessmentIds.length === 0) return map
  const result = await query(db, `SELECT assessment_id, question_id, question_version, value FROM assessment_responses WHERE assessment_id = ANY($1::uuid[]) ORDER BY created_at`, [assessmentIds])
  for (const row of result.rows) {
    const id = String(row.assessment_id)
    const values = map.get(id) ?? []
    values.push({ question_id: String(row.question_id), question_version: Number(row.question_version), value: row.value })
    map.set(id, values)
  }
  return map
}
export const getAssessment = async (db: DbTarget, id: string): Promise<Assessment | null> => {
  const result = await query(db, `SELECT ${ASSESSMENT_COLUMNS} FROM assessments WHERE id = $1`, [id])
  if (!result.rows[0]) return null
  const responses = await responsesFor(db, [id])
  return assessmentFromRow(result.rows[0], responses.get(id) ?? [])
}
export const listAssessments = async (db: DbTarget, start?: string, end?: string, limit = 200): Promise<Assessment[]> => {
  const values: unknown[] = []
  const clauses = ['deleted_at IS NULL']
  if (start) { values.push(start); clauses.push(`assessed_at >= $${values.length}`) }
  if (end) { values.push(end); clauses.push(`assessed_at <= $${values.length}`) }
  values.push(limit)
  const result = await query(db, `SELECT ${ASSESSMENT_COLUMNS} FROM assessments WHERE ${clauses.join(' AND ')} ORDER BY assessed_at DESC LIMIT $${values.length}`, values)
  const ids = result.rows.map((row) => String(row.id))
  const responses = await responsesFor(db, ids)
  return result.rows.map((row) => assessmentFromRow(row, responses.get(String(row.id)) ?? []))
}
// eslint-disable-next-line complexity -- projection supports both numeric scales and choice-to-number mappings without inventing values for unknowns
const writeAssessmentProjection = async (db: DbTarget, assessment: Assessment): Promise<void> => {
  const source = `assessment:${assessment.id}`
  await query(db, `UPDATE time_series SET deleted_at = NOW(), updated_at = NOW() WHERE source = $1 AND deleted_at IS NULL`, [source])
  if (assessment.deleted_at) return
  const ids = assessment.responses.map((response) => response.question_id)
  if (ids.length === 0) return
  const questions = await query(db, `SELECT id, response_type, metric_name, unit, prompt, config FROM assessment_questions WHERE id = ANY($1::uuid[])`, [ids])
  const byId = new Map(questions.rows.map((row) => [String(row.id), row]))
  for (const response of assessment.responses) {
    const question = byId.get(response.question_id)
    if (!question || !question.metric_name) continue
    let value: number | null = null
    if (['numeric', 'likert'].includes(String(question.response_type)) && typeof response.value === 'number') {
      value = response.value
    } else if (String(question.response_type) === 'single_choice' && typeof response.value === 'string') {
      const config = json<Record<string, unknown>>(question.config, {})
      const rawMap = config.numeric_map
      const mapped =
        rawMap && typeof rawMap === 'object' && !Array.isArray(rawMap)
          ? (rawMap as Record<string, unknown>)[response.value]
          : undefined
      if (typeof mapped === 'number' && Number.isFinite(mapped)) value = mapped
    }
    if (value === null) continue
    const metric = String(question.metric_name)
    const unit = String(question.unit ?? 'score')
    await query(db, `INSERT INTO custom_metrics (name, unit, description, aggregation) VALUES ($1,$2,$3,'avg') ON CONFLICT (name) DO NOTHING`, [metric, unit, `Questionnaire projection: ${String(question.prompt)}`])
    await query(db, `INSERT INTO time_series (time, metric, value, unit, source, deleted_at, updated_at) VALUES ($1,$2,$3,$4,$5,NULL,NOW()) ON CONFLICT (time,metric,source) DO UPDATE SET value=EXCLUDED.value, unit=EXCLUDED.unit, deleted_at=NULL, updated_at=NOW()`, [assessment.assessed_at, metric, value, unit, source])
  }
}
const replaceAssessmentResponses = async (db: DbTarget, assessmentId: string, responses: AssessmentAnswer[]): Promise<void> => {
  await query(db, `DELETE FROM assessment_responses WHERE assessment_id = $1`, [assessmentId])
  for (const response of responses) await query(db, `INSERT INTO assessment_responses (assessment_id, question_id, question_version, value) VALUES ($1,$2,$3,$4::jsonb)`, [assessmentId, response.question_id, response.question_version, JSON.stringify(response.value)])
}
export const createAssessment = async (user: string, input: SubmitAssessmentBody): Promise<Assessment> =>
  withUserTransaction(user, async (tx) => {
    const template = await getQuestionnaire(tx, input.template_id)
    if (!template) throw new Error('Questionnaire not found')
    const result = await query(tx, `INSERT INTO assessments (template_id, template_version, treatment_session_id, stage, assessed_at, timezone, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [input.template_id, template.version, input.treatment_session_id ?? null, input.stage ?? null, input.assessed_at, input.timezone, input.notes ?? null])
    const id = String(result.rows[0].id)
    await replaceAssessmentResponses(tx, id, input.responses)
    const assessment = (await getAssessment(tx, id))!
    await writeAssessmentProjection(tx, assessment)
    return assessment
  })
export const updateAssessment = async (user: string, id: string, input: CorrectAssessmentBody): Promise<Assessment | null> =>
  withUserTransaction(user, async (tx) => {
    if (!(await getAssessment(tx, id))) return null
    const template = input.template_id ? await getQuestionnaire(tx, input.template_id) : null
    if (input.template_id && !template) throw new Error('Questionnaire not found')
    const update = template ? { ...input, template_version: template.version } : input
    const columns = { template_id: 'template_id', template_version: 'template_version', treatment_session_id: 'treatment_session_id', stage: 'stage', assessed_at: 'assessed_at', timezone: 'timezone', notes: 'notes' }
    await patchRecord(tx, 'assessments', id, update, columns, ASSESSMENT_COLUMNS, ['updated_at = NOW()'])
    if (input.responses) await replaceAssessmentResponses(tx, id, input.responses)
    const assessment = (await getAssessment(tx, id))!
    await writeAssessmentProjection(tx, assessment)
    return assessment
  })
export const deleteAssessment = async (user: string, id: string): Promise<boolean> =>
  withUserTransaction(user, async (tx) => {
    const assessment = await getAssessment(tx, id)
    if (!assessment || assessment.deleted_at) return false
    await query(tx, `UPDATE assessments SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`, [id])
    const deleted = (await getAssessment(tx, id))!
    await writeAssessmentProjection(tx, deleted)
    return true
  })

const contextTypeFromRow = (row: Row): ContextEventType => present({ id: String(row.id), key: String(row.key), display_name: String(row.display_name), description: row.description as string | null, active: Boolean(row.active), created_at: iso(row.created_at), updated_at: iso(row.updated_at) })
const CONTEXT_TYPE_COLUMNS = 'id, key, display_name, description, active, created_at, updated_at'
const SIMPLE_FOOD_CONTEXT_METRICS: Record<string, { description: string; metric: string; unit: string }> = {
  simple_food_bloating: {
    metric: 'simple_food_bloating',
    unit: 'ordinal',
    description: 'Simple Food Tracker bloating severity check-in.',
  },
  simple_food_fullness: {
    metric: 'simple_food_fullness',
    unit: 'ordinal',
    description: 'Simple Food Tracker fullness check-in.',
  },
  simple_food_reflux: {
    metric: 'simple_food_reflux',
    unit: 'ordinal',
    description: 'Simple Food Tracker reflux severity check-in.',
  },
}
const simpleFoodContextProjectionSource = (eventId: string): string => `sfctx:${eventId}`
const writeContextEventProjection = async (db: DbTarget, event: ContextEvent): Promise<void> => {
  const projection = SIMPLE_FOOD_CONTEXT_METRICS[event.event_type.key]
  if (!projection) return
  const source = simpleFoodContextProjectionSource(event.id)
  await query(db, `UPDATE time_series SET deleted_at = NOW(), updated_at = NOW() WHERE source = $1 AND deleted_at IS NULL`, [source])
  if (event.deleted_at || event.intensity == null) return
  await query(db, `INSERT INTO custom_metrics (name, unit, description, aggregation, min_value, max_value, include_in_daily_summary) VALUES ($1,$2,$3,'avg',0,NULL,FALSE) ON CONFLICT (name) DO NOTHING`, [projection.metric, projection.unit, projection.description])
  await query(db, `INSERT INTO time_series (time, metric, value, unit, source, deleted_at, updated_at) VALUES ($1,$2,$3,$4,$5,NULL,NOW()) ON CONFLICT (time,metric,source) DO UPDATE SET value=EXCLUDED.value, unit=EXCLUDED.unit, deleted_at=NULL, updated_at=NOW()`, [event.started_at, projection.metric, event.intensity, projection.unit, source])
}
export const listContextEventTypes = async (db: DbTarget): Promise<ContextEventType[]> => (await query(db, `SELECT ${CONTEXT_TYPE_COLUMNS} FROM context_event_types ORDER BY active DESC, display_name`)).rows.map(contextTypeFromRow)
export const createContextEventType = async (db: DbTarget, input: CreateContextEventTypeBody): Promise<ContextEventType> => contextTypeFromRow((await query(db, `INSERT INTO context_event_types (key, display_name, description, active) VALUES ($1,$2,$3,$4) RETURNING ${CONTEXT_TYPE_COLUMNS}`, [input.key, input.display_name, input.description ?? null, input.active])).rows[0])
export const updateContextEventType = async (db: DbTarget, id: string, input: UpdateContextEventTypeBody): Promise<ContextEventType | null> => {
  const row = await patchRecord(db, 'context_event_types', id, input, { key: 'key', display_name: 'display_name', description: 'description', active: 'active' }, CONTEXT_TYPE_COLUMNS, ['updated_at = NOW()'])
  return row ? contextTypeFromRow(row) : null
}
const CONTEXT_EVENT_SELECT = `ce.id, ce.event_type_id, ce.started_at, ce.ended_at, ce.timezone, ce.intensity, ce.notes, ce.metadata, ce.created_at, ce.updated_at, ce.deleted_at, cet.key AS type_key, cet.display_name AS type_display_name, cet.description AS type_description, cet.active AS type_active, cet.created_at AS type_created_at, cet.updated_at AS type_updated_at`
const contextEventFromRow = (row: Row): ContextEvent => present({ id: String(row.id), event_type: contextTypeFromRow({ id: row.event_type_id, key: row.type_key, display_name: row.type_display_name, description: row.type_description, active: row.type_active, created_at: row.type_created_at, updated_at: row.type_updated_at }), started_at: iso(row.started_at), ended_at: nullableIso(row.ended_at), timezone: String(row.timezone), intensity: row.intensity == null ? null : Number(row.intensity), notes: row.notes as string | null, metadata: json<Record<string, unknown>>(row.metadata, {}), created_at: iso(row.created_at), updated_at: iso(row.updated_at), deleted_at: nullableIso(row.deleted_at) })
export const getContextEvent = async (db: DbTarget, id: string): Promise<ContextEvent | null> => { const result = await query(db, `SELECT ${CONTEXT_EVENT_SELECT} FROM context_events ce JOIN context_event_types cet ON cet.id=ce.event_type_id WHERE ce.id=$1`, [id]); return result.rows[0] ? contextEventFromRow(result.rows[0]) : null }
export const listContextEvents = async (db: DbTarget, start?: string, end?: string, limit=200): Promise<ContextEvent[]> => {
  const values: unknown[]=[]; const clauses=['ce.deleted_at IS NULL']; if(start){values.push(start);clauses.push(`ce.started_at >= $${values.length}`)} if(end){values.push(end);clauses.push(`ce.started_at <= $${values.length}`)} values.push(limit)
  return (await query(db, `SELECT ${CONTEXT_EVENT_SELECT} FROM context_events ce JOIN context_event_types cet ON cet.id=ce.event_type_id WHERE ${clauses.join(' AND ')} ORDER BY ce.started_at DESC LIMIT $${values.length}`, values)).rows.map(contextEventFromRow)
}
export const createContextEvent = async (db: DbTarget, input: CreateContextEventBody): Promise<ContextEvent> => {
  const result=await query(db, `INSERT INTO context_events (event_type_id,started_at,ended_at,timezone,intensity,notes,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING id`, [input.event_type_id,input.started_at,input.ended_at??null,input.timezone,input.intensity??null,input.notes??null,JSON.stringify(input.metadata)])
  const event = (await getContextEvent(db,String(result.rows[0].id)))!
  await writeContextEventProjection(db, event)
  return event
}
export const updateContextEvent = async (db: DbTarget,id:string,input:UpdateContextEventBody):Promise<ContextEvent|null>=>{
  const row=await patchRecord(db,'context_events',id,input,{event_type_id:'event_type_id',started_at:'started_at',ended_at:'ended_at',timezone:'timezone',intensity:'intensity',notes:'notes',metadata:'metadata'},'id',['updated_at = NOW()'])
  const event = row ? await getContextEvent(db,id) : null
  if (event) await writeContextEventProjection(db, event)
  return event
}
export const deleteContextEvent = async(db:DbTarget,id:string):Promise<boolean>=>{
  const event = await getContextEvent(db, id)
  if (!event || event.deleted_at) return false
  const deleted = (await query(db,`UPDATE context_events SET deleted_at=NOW(),updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL`,[id])).rowCount??0
  if (!deleted) return false
  const latest = (await getContextEvent(db, id))!
  await writeContextEventProjection(db, latest)
  return true
}

const EXPORT_TABLES = ['substances','substance_versions','regimens','regimen_items','regimen_versions','administration_events','administration_event_revisions','treatment_types','treatment_sessions','questionnaire_templates','assessment_questions','assessment_question_versions','assessments','assessment_responses','context_event_types','context_events'] as const
export const exportPharmacology = async (db: DbTarget): Promise<PharmacologyExport> => {
  const output: Record<string, unknown> = { exported_at: new Date().toISOString() }
  for (const table of EXPORT_TABLES) output[table] = (await query(db, `SELECT * FROM ${table}`)).rows
  return output as PharmacologyExport
}

export interface PharmacologyInsightData {
  administration_events: number
  exposure_events: number
  exposure_days: number
  concurrent_exposure_days: number
  missing_assessment_days: number
  duplicate_suspicions: number
  projected_metrics: Array<{ metric: string; unit: string; points: number }>
  mixed_route_substances: string[]
}

export const getPharmacologyInsightData = async (
  db: DbTarget,
  start: string,
  end: string,
  timezone: string,
): Promise<PharmacologyInsightData> => {
  const summary = await query(
    db,
    `WITH exposure AS (
       SELECT *, (administered_at AT TIME ZONE $3)::date AS local_date
       FROM administration_events
       WHERE deleted_at IS NULL AND administered_at >= ($1::date::timestamp AT TIME ZONE $3)
         AND administered_at < (($2::date + 1)::timestamp AT TIME ZONE $3)
     ), per_day AS (
       SELECT local_date, COUNT(DISTINCT substance_id) AS substances
       FROM exposure WHERE status IN ('taken','delayed','partially_taken') GROUP BY local_date
     ), duplicates AS (
       SELECT COUNT(*)::int AS count FROM (
         SELECT substance_id, date_trunc('minute', administered_at), dose, dose_unit
         FROM exposure WHERE status IN ('taken','delayed','partially_taken')
         GROUP BY substance_id, date_trunc('minute', administered_at), dose, dose_unit HAVING COUNT(*) > 1
       ) suspicious
     )
     SELECT COUNT(*)::int AS administration_events,
       COUNT(*) FILTER (WHERE status IN ('taken','delayed','partially_taken'))::int AS exposure_events,
       COUNT(DISTINCT local_date) FILTER (WHERE status IN ('taken','delayed','partially_taken'))::int AS exposure_days,
       COALESCE((SELECT COUNT(*) FROM per_day WHERE substances > 1),0)::int AS concurrent_exposure_days,
       (SELECT count FROM duplicates)::int AS duplicate_suspicions
     FROM exposure`,
    [start, end, timezone],
  )
  const assessmentDays = await query(
    db,
    `SELECT COUNT(DISTINCT (assessed_at AT TIME ZONE $3)::date)::int AS days
     FROM assessments WHERE deleted_at IS NULL
       AND assessed_at >= ($1::date::timestamp AT TIME ZONE $3)
       AND assessed_at < (($2::date + 1)::timestamp AT TIME ZONE $3)`,
    [start, end, timezone],
  )
  const metrics = await query(
    db,
    `SELECT metric, unit, COUNT(*)::int AS points FROM time_series
     WHERE (source IN ('pharmacology') OR source LIKE 'assessment:%')
       AND time >= ($1::date::timestamp AT TIME ZONE $3)
       AND time < (($2::date + 1)::timestamp AT TIME ZONE $3)
       AND deleted_at IS NULL GROUP BY metric, unit ORDER BY metric`,
    [start, end, timezone],
  )
  const routes = await query(
    db,
    `SELECT s.display_name FROM administration_events ae JOIN substances s ON s.id=ae.substance_id
     WHERE ae.deleted_at IS NULL AND ae.status IN ('taken','delayed','partially_taken')
       AND ae.administered_at >= ($1::date::timestamp AT TIME ZONE $3)
       AND ae.administered_at < (($2::date + 1)::timestamp AT TIME ZONE $3)
     GROUP BY s.id, s.display_name HAVING COUNT(DISTINCT COALESCE(ae.route,'')) > 1`,
    [start, end, timezone],
  )
  const rangeDays = Math.floor((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000) + 1
  const row = summary.rows[0]
  return {
    administration_events: Number(row.administration_events), exposure_events: Number(row.exposure_events),
    exposure_days: Number(row.exposure_days), concurrent_exposure_days: Number(row.concurrent_exposure_days),
    missing_assessment_days: Math.max(0, rangeDays - Number(assessmentDays.rows[0].days)),
    duplicate_suspicions: Number(row.duplicate_suspicions),
    projected_metrics: metrics.rows.map((metric) => ({ metric: String(metric.metric), unit: String(metric.unit), points: Number(metric.points) })),
    mixed_route_substances: routes.rows.map((route) => String(route.display_name)),
  }
}

import type { Regimen, RegimenItemInput, ScheduleRule, Substance } from '@aurboda/api-spec'

import { useMutation } from '@tanstack/react-query'
import { useState } from 'preact/hooks'

import { createRegimen, pharmacologyErrorMessage, updateRegimen } from '../../state/api'
import { isoToLocalDateTime, localDateTimeToIso } from './model'

type RuleType = ScheduleRule['type']
interface ScheduleDraft {
  type: RuleType
  weekdays: number[]
  intervalDays: string
  anchorDate: string
  weekday: string
  dayOfMonth: string
  date: string
  intervalHours: string
  anchorAt: string
  startDate: string
  endDate: string
}

const emptySchedule = (): ScheduleDraft => ({
  anchorAt: '',
  anchorDate: '',
  date: '',
  dayOfMonth: '1',
  endDate: '',
  intervalDays: '2',
  intervalHours: '8',
  startDate: '',
  type: 'daily',
  weekday: '1',
  weekdays: [1, 2, 3, 4, 5],
})

const scheduleDraft = (rule?: ScheduleRule | null): ScheduleDraft => {
  const draft = emptySchedule()
  if (!rule) return draft
  draft.type = rule.type
  if ('start_date' in rule) draft.startDate = rule.start_date ?? ''
  if ('end_date' in rule) draft.endDate = rule.end_date ?? ''
  if (rule.type === 'weekdays') draft.weekdays = rule.weekdays
  if (rule.type === 'every_n_days') {
    draft.intervalDays = String(rule.interval_days)
    draft.anchorDate = rule.anchor_date
  }
  if (rule.type === 'weekly') draft.weekday = String(rule.weekday)
  if (rule.type === 'monthly') draft.dayOfMonth = String(rule.day_of_month)
  if (rule.type === 'specific_date') draft.date = rule.date
  if (rule.type === 'interval') {
    draft.intervalHours = String(rule.interval_hours)
    draft.anchorAt = isoToLocalDateTime(rule.anchor_at)
  }
  return draft
}

const optionalDates = (draft: ScheduleDraft) => ({
  ...(draft.endDate && { end_date: draft.endDate }),
  ...(draft.startDate && { start_date: draft.startDate }),
})

const buildSchedule = (draft: ScheduleDraft): ScheduleRule => {
  switch (draft.type) {
    case 'daily':
    case 'as_needed':
    case 'none':
      return { type: draft.type, ...optionalDates(draft) }
    case 'weekdays':
      if (draft.weekdays.length === 0) throw new Error('Choose at least one weekday.')
      return { type: 'weekdays', weekdays: draft.weekdays, ...optionalDates(draft) }
    case 'every_n_days':
      if (!draft.anchorDate) throw new Error('Choose an anchor date.')
      return {
        anchor_date: draft.anchorDate,
        interval_days: Number(draft.intervalDays),
        type: 'every_n_days',
        ...optionalDates(draft),
      }
    case 'weekly':
      return { type: 'weekly', weekday: Number(draft.weekday), ...optionalDates(draft) }
    case 'monthly':
      return { day_of_month: Number(draft.dayOfMonth), type: 'monthly', ...optionalDates(draft) }
    case 'specific_date':
      if (!draft.date) throw new Error('Choose a schedule date.')
      return { date: draft.date, type: 'specific_date' }
    case 'interval':
      if (!draft.anchorAt) throw new Error('Choose an interval anchor time.')
      return {
        anchor_at: localDateTimeToIso(draft.anchorAt),
        interval_hours: Number(draft.intervalHours),
        type: 'interval',
        ...optionalDates(draft),
      }
  }
}

function ScheduleEditor({ draft, onChange }: { draft: ScheduleDraft; onChange: (draft: ScheduleDraft) => void }) {
  const patch = (updates: Partial<ScheduleDraft>) => onChange({ ...draft, ...updates })
  return (
    <div class="schedule-editor">
      <label class="field full-field">
        <span>Rule</span>
        <select value={draft.type} onChange={(event) => patch({ type: (event.target as HTMLSelectElement).value as RuleType })}>
          <option value="daily">Daily</option>
          <option value="weekdays">Selected weekdays</option>
          <option value="every_n_days">Every N days</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="specific_date">Specific date</option>
          <option value="interval">Interval in hours</option>
          <option value="as_needed">As needed</option>
          <option value="none">No schedule</option>
        </select>
      </label>
      {draft.type === 'weekdays' && (
        <fieldset class="chip-fieldset full-field"><legend>Weekdays</legend><div class="choice-chips weekday-chips">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, index) => { const day = index + 1; const active = draft.weekdays.includes(day); return <button class={active ? 'choice-chip selected' : 'choice-chip'} key={label} type="button" aria-pressed={active} onClick={() => patch({ weekdays: active ? draft.weekdays.filter((value) => value !== day) : [...draft.weekdays, day].sort() })}>{label}</button> })}</div></fieldset>
      )}
      {draft.type === 'every_n_days' && <><label class="field"><span>Every (days)</span><input min="1" max="365" required type="number" value={draft.intervalDays} onInput={(event) => patch({ intervalDays: (event.target as HTMLInputElement).value })} /></label><label class="field"><span>Anchor date</span><input required type="date" value={draft.anchorDate} onInput={(event) => patch({ anchorDate: (event.target as HTMLInputElement).value })} /></label></>}
      {draft.type === 'weekly' && <label class="field full-field"><span>Weekday</span><select value={draft.weekday} onChange={(event) => patch({ weekday: (event.target as HTMLSelectElement).value })}>{['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, index) => <option value={index + 1}>{day}</option>)}</select></label>}
      {draft.type === 'monthly' && <label class="field full-field"><span>Day of month</span><input min="1" max="31" required type="number" value={draft.dayOfMonth} onInput={(event) => patch({ dayOfMonth: (event.target as HTMLInputElement).value })} /></label>}
      {draft.type === 'specific_date' && <label class="field full-field"><span>Date</span><input required type="date" value={draft.date} onInput={(event) => patch({ date: (event.target as HTMLInputElement).value })} /></label>}
      {draft.type === 'interval' && <><label class="field"><span>Every (hours)</span><input min="0.1" step="any" required type="number" value={draft.intervalHours} onInput={(event) => patch({ intervalHours: (event.target as HTMLInputElement).value })} /></label><label class="field"><span>Anchor time</span><input required type="datetime-local" value={draft.anchorAt} onInput={(event) => patch({ anchorAt: (event.target as HTMLInputElement).value })} /></label></>}
      {draft.type !== 'specific_date' && (
        <><label class="field"><span>Starts (optional)</span><input type="date" value={draft.startDate} onInput={(event) => patch({ startDate: (event.target as HTMLInputElement).value })} /></label><label class="field"><span>Ends (optional)</span><input type="date" value={draft.endDate} onInput={(event) => patch({ endDate: (event.target as HTMLInputElement).value })} /></label></>
      )}
    </div>
  )
}

interface ItemDraft {
  id?: string
  substanceId: string
  dose: string
  doseUnit: string
  route: string
  scheduledLocalTime: string
  paused: boolean
  overrideEnabled: boolean
  override: ScheduleDraft
}

// eslint-disable-next-line complexity -- field defaults preserve every optional regimen-item override
const itemDraft = (item?: Regimen['items'][number]): ItemDraft => ({
  dose: String(item?.dose ?? ''),
  doseUnit: item?.dose_unit ?? '',
  id: item?.id,
  override: scheduleDraft(item?.schedule_override),
  overrideEnabled: !!item?.schedule_override,
  paused: item?.paused ?? false,
  route: item?.route ?? '',
  scheduledLocalTime: item?.scheduled_local_time?.slice(0, 5) ?? '',
  substanceId: item?.substance_id ?? '',
})

export function RegimenForm({
  onCancel,
  onSaved,
  regimen,
  substances,
}: {
  onCancel: () => void
  onSaved: (message: string) => void
  regimen?: Regimen
  substances: Substance[]
}) {
  const activeSubstances = substances.filter((substance) => substance.status === 'active' || regimen?.items.some((item) => item.substance_id === substance.id))
  const [name, setName] = useState(regimen?.name ?? '')
  const [description, setDescription] = useState(regimen?.description ?? '')
  const [status, setStatus] = useState(regimen?.status ?? 'active')
  const [schedule, setSchedule] = useState(() => scheduleDraft(regimen?.schedule))
  const [items, setItems] = useState<ItemDraft[]>(() => regimen?.items.map(itemDraft) ?? [itemDraft()])
  const [remindersEnabled, setRemindersEnabled] = useState(regimen?.reminder.enabled ?? false)
  const [reminderMinutes, setReminderMinutes] = useState(regimen?.reminder.minutes_before.join(', ') ?? '')
  const [error, setError] = useState('')
  const updateItem = (index: number, updates: Partial<ItemDraft>) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...updates } : item))
  const mutation = useMutation({
    mutationFn: () => {
      const bodyItems: RegimenItemInput[] = items.map((item, index) => {
        if (!item.substanceId || !item.dose || !item.doseUnit) throw new Error(`Complete item ${index + 1}.`)
        return {
          ...(item.id && { id: item.id }),
          dose: Number(item.dose),
          dose_unit: item.doseUnit,
          paused: item.paused,
          route: item.route || null,
          schedule_override: item.overrideEnabled ? buildSchedule(item.override) : null,
          scheduled_local_time: item.scheduledLocalTime || null,
          sort_order: index,
          substance_id: item.substanceId,
        }
      })
      const body = {
        description: description || undefined,
        items: bodyItems,
        name: name.trim(),
        reminder: {
          enabled: remindersEnabled,
          minutes_before: reminderMinutes.split(',').map((value) => Number(value.trim())).filter((value) => Number.isFinite(value) && value >= 0),
        },
        schedule: buildSchedule(schedule),
        sort_order: regimen?.sort_order ?? 0,
        status,
      }
      if (!body.name) throw new Error('Enter a regimen name.')
      return regimen ? updateRegimen(regimen.id, body) : createRegimen(body)
    },
    onError: (mutationError) => setError(pharmacologyErrorMessage(mutationError)),
    onSuccess: () => onSaved(regimen ? 'Regimen updated.' : 'Regimen created.'),
  })

  return (
    <form class="treatments-form wide-form" onSubmit={(event) => { event.preventDefault(); if (!mutation.isPending) mutation.mutate() }}>
      <div class="form-heading"><div><p class="treatments-kicker">Stack builder</p><h2>{regimen ? 'Edit regimen' : 'New regimen'}</h2></div><button class="icon-button" type="button" onClick={onCancel} aria-label="Close regimen form">×</button></div>
      <div class="form-grid">
        <label class="field"><span>Name</span><input required value={name} onInput={(event) => setName((event.target as HTMLInputElement).value)} /></label>
        <label class="field"><span>Status</span><select value={status} onChange={(event) => setStatus((event.target as HTMLSelectElement).value as Regimen['status'])}><option value="active">Active</option><option value="paused">Paused</option><option value="archived">Archived</option></select></label>
        <label class="field full-field"><span>Description</span><textarea value={description} onInput={(event) => setDescription((event.target as HTMLTextAreaElement).value)} /></label>
      </div>
      <fieldset class="form-panel"><legend>Schedule</legend><ScheduleEditor draft={schedule} onChange={setSchedule} /></fieldset>
      <fieldset class="form-panel"><legend>Items</legend><div class="builder-items">{items.map((item, index) => (
        <div class="builder-item" key={item.id ?? index}>
          <div class="builder-item-heading"><strong>Item {index + 1}</strong><button class="danger-link" disabled={items.length === 1} type="button" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></div>
          <div class="form-grid">
            <label class="field full-field"><span>Substance</span><select required value={item.substanceId} onChange={(event) => { const id = (event.target as HTMLSelectElement).value; const substance = activeSubstances.find((candidate) => candidate.id === id); updateItem(index, { dose: String(substance?.default_dose ?? item.dose), doseUnit: substance?.dose_unit ?? item.doseUnit, route: substance?.route ?? item.route, substanceId: id }) }}><option value="">Choose…</option>{activeSubstances.map((substance) => <option value={substance.id}>{substance.display_name}</option>)}</select></label>
            <label class="field"><span>Dose</span><input min="0" required step="any" type="number" value={item.dose} onInput={(event) => updateItem(index, { dose: (event.target as HTMLInputElement).value })} /></label>
            <label class="field"><span>Unit</span><input required value={item.doseUnit} onInput={(event) => updateItem(index, { doseUnit: (event.target as HTMLInputElement).value })} /></label>
            <label class="field"><span>Route</span><input value={item.route} onInput={(event) => updateItem(index, { route: (event.target as HTMLInputElement).value })} /></label>
            <label class="field"><span>Local time</span><input type="time" value={item.scheduledLocalTime} onInput={(event) => updateItem(index, { scheduledLocalTime: (event.target as HTMLInputElement).value })} /></label>
          </div>
          <div class="inline-toggles"><label class="check-label"><input type="checkbox" checked={item.paused} onChange={(event) => updateItem(index, { paused: (event.target as HTMLInputElement).checked })} />Paused</label><label class="check-label"><input type="checkbox" checked={item.overrideEnabled} onChange={(event) => updateItem(index, { overrideEnabled: (event.target as HTMLInputElement).checked })} />Override regimen schedule</label></div>
          {item.overrideEnabled && <ScheduleEditor draft={item.override} onChange={(override) => updateItem(index, { override })} />}
        </div>
      ))}</div><button class="btn-secondary" type="button" onClick={() => setItems((current) => [...current, itemDraft()])}>Add item</button></fieldset>
      <fieldset class="form-panel"><legend>Reminder metadata</legend><p class="form-hint">Saved for a future notification delivery layer; no notification is scheduled yet.</p><label class="check-label"><input type="checkbox" checked={remindersEnabled} onChange={(event) => setRemindersEnabled((event.target as HTMLInputElement).checked)} />Reminders enabled</label><label class="field full-field"><span>Minutes before (comma-separated)</span><input disabled={!remindersEnabled} value={reminderMinutes} onInput={(event) => setReminderMinutes((event.target as HTMLInputElement).value)} /></label></fieldset>
      {error && <p class="form-error" role="alert">{error}</p>}
      <div class="form-actions"><button class="btn-secondary" type="button" onClick={onCancel}>Cancel</button><button class="btn-primary" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Save regimen'}</button></div>
    </form>
  )
}

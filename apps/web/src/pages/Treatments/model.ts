import type {
  ConfirmRegimenBody,
  DueState,
  PharmacologyTimelineEntry as ApiPharmacologyTimelineEntry,
  Regimen,
  RegimenItem,
  ScheduleRule,
} from '@aurboda/api-spec'

export type PharmacologyTimelineEntry = ApiPharmacologyTimelineEntry

export type TreatmentsView = 'today' | 'journal' | 'library' | 'insights'

export const treatmentViews: { key: TreatmentsView; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'journal', label: 'Journal' },
  { key: 'library', label: 'Library' },
  { key: 'insights', label: 'Insights' },
]

export const dueStateLabels: Record<DueState, string> = {
  confirmed: 'Confirmed',
  not_yet_due: 'Not yet due',
  partial: 'Partial',
  pending: 'Pending',
  skipped: 'Skipped',
  unknown: 'Unknown',
}

const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export const scheduleSummary = (rule: ScheduleRule): string => {
  switch (rule.type) {
    case 'daily':
      return 'Every day'
    case 'weekdays':
      return rule.weekdays.map((day) => weekdayNames[day - 1]).join(', ')
    case 'every_n_days':
      return `Every ${rule.interval_days} day${rule.interval_days === 1 ? '' : 's'} from ${rule.anchor_date}`
    case 'weekly':
      return `Every ${weekdayNames[rule.weekday - 1]}`
    case 'monthly':
      return `Monthly on day ${rule.day_of_month}`
    case 'specific_date':
      return `On ${rule.date}`
    case 'interval':
      return `Every ${rule.interval_hours} hour${rule.interval_hours === 1 ? '' : 's'}`
    case 'as_needed':
      return 'As needed'
    case 'none':
      return 'No schedule'
  }
}

const pad = (value: number) => value.toString().padStart(2, '0')

export const isoToLocalDateTime = (iso: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export const localDateTimeToIso = (local: string): string => {
  const date = new Date(local)
  if (!local || Number.isNaN(date.getTime())) throw new Error('Enter a valid date and time.')
  return date.toISOString()
}

export const localDateKey = (date = new Date()): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

export const nowLocalDateTime = (): string => isoToLocalDateTime(new Date().toISOString())

export const actualVsScheduledLabel = (
  administeredAt: string,
  scheduledAt?: string | null,
): string => {
  const actual = new Date(administeredAt)
  const actualLabel = actual.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
  if (!scheduledAt) return `Administered ${actualLabel}`
  const scheduled = new Date(scheduledAt)
  const scheduledLabel = scheduled.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
  return `Administered ${actualLabel} · scheduled ${scheduledLabel}`
}

export const treatmentUrl = (
  currentSearch: string | URLSearchParams | Record<string, string | undefined>,
  changes: Record<string, string | undefined>,
): string => {
  const params =
    currentSearch instanceof URLSearchParams
      ? new URLSearchParams(currentSearch)
      : typeof currentSearch === 'string'
        ? new URLSearchParams(currentSearch.replace(/^\?/, ''))
        : new URLSearchParams(
            Object.entries(currentSearch).filter((entry): entry is [string, string] => entry[1] !== undefined),
          )
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) params.delete(key)
    else params.set(key, value)
  }
  const search = params.toString()
  return `/treatments${search ? `?${search}` : ''}`
}

export interface ConfirmItemDraft {
  selected: boolean
  item_id: string
  dose: string
  dose_unit: string
  route: string
  status: ConfirmRegimenBody['items'][number]['status']
}

export const regimenItemDrafts = (regimen: Regimen): ConfirmItemDraft[] =>
  regimen.items.map((item) => ({
    dose: String(item.dose),
    dose_unit: item.dose_unit,
    item_id: item.id,
    route: item.route ?? '',
    selected: true,
    status: 'taken',
  }))

export const buildConfirmRegimenBody = ({
  actualLocal,
  idempotencyKey,
  items,
  scheduledAt,
  timezone,
}: {
  actualLocal: string
  idempotencyKey: string
  items: ConfirmItemDraft[]
  scheduledAt?: string
  timezone: string
}): ConfirmRegimenBody => ({
  administered_at: localDateTimeToIso(actualLocal),
  idempotency_key: idempotencyKey,
  items: items
    .filter((item) => item.selected)
    .map((item) => ({
      dose: item.dose === '' ? null : Number(item.dose),
      dose_unit: item.dose_unit || null,
      item_id: item.item_id,
      route: item.route || null,
      side_effects: [],
      status: item.status,
    })),
  ...(scheduledAt && { scheduled_at: scheduledAt }),
  timezone,
})

export const regimenScheduledAt = (item: RegimenItem, day: string): string | undefined => {
  if (!item.scheduled_local_time) return undefined
  const local = `${day}T${item.scheduled_local_time}`
  const date = new Date(local)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

export const groupTimelineByDay = (
  entries: PharmacologyTimelineEntry[],
): [string, PharmacologyTimelineEntry[]][] => {
  const grouped = new Map<string, PharmacologyTimelineEntry[]>()
  for (const entry of [...entries].sort((left, right) => right.at.localeCompare(left.at))) {
    const key = new Date(entry.at).toLocaleDateString([], {
      day: 'numeric',
      month: 'long',
      weekday: 'long',
      year: 'numeric',
    })
    grouped.set(key, [...(grouped.get(key) ?? []), entry])
  }
  return [...grouped.entries()]
}

export const treatmentStageLabel = (stage: string): string =>
  stage
    .replaceAll('_', ' ')
    .replaceAll(/\b\w/g, (letter) => letter.toUpperCase())

export const stableActionKey = (prefix: string, createId: () => string): string => `${prefix}:${createId()}`

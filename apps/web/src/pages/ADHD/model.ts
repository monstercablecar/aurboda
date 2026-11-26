import type { AdhdObservation, AdhdRecord, AdhdObservationInput } from '@aurboda/api-spec'
export const itemIds = (pack: AdhdObservationInput['pack']) => {
  const core = ['energy_now_v1', 'clarity_now_v1', 'target_interest_v1', 'target_start_ease_v1']
  return pack === 'tiny_state'
    ? core.slice(0, 2)
    : pack === 'tiny_task'
      ? core.slice(2)
      : pack === 'full'
        ? [...core, 'strain_now_v1', 'pleasantness_now_v1']
        : pack === 'core_strain'
          ? [...core, 'strain_now_v1']
          : pack === 'focused'
            ? [
                ...core,
                'agency_v1',
                'demand_v1',
                'next_action_v1',
                'switching_v1',
                'physical_fatigue_v1',
                'creative_appetite_v1',
              ]
            : core
}
export const applicable = (id: string, context: AdhdObservationInput['context']) =>
  !(id.startsWith('target_') && !context.target) &&
  !(id === 'target_start_ease_v1' && context.phase !== 'pre_start') &&
  !(id === 'switching_v1' && !['ongoing', 'after'].includes(context.phase)) &&
  !(['agency_v1', 'demand_v1', 'next_action_v1', 'creative_appetite_v1'].includes(id) && !context.target)
export const arms = (rows: AdhdRecord[]) =>
  ['intervention', 'usual'].map((condition) => {
    const assigned = rows.filter((r) => r.kind === 'opportunity' && r.data.condition === condition),
      outcomes = assigned.map((r) => r.data.outcome as Record<string, unknown> | undefined)
    const known = outcomes.filter((o) => o?.within_five_minutes === 'yes' || o?.within_five_minutes === 'no')
    return {
      condition,
      assigned: assigned.length,
      exposed: assigned.filter((r) => r.data.action_window_started_at).length,
      used: assigned.filter((r) => r.data.used && !['none', 'unrecorded'].includes(String(r.data.used)))
        .length,
      declined: assigned.filter((r) => r.data.declined).length,
      starts: known.filter((o) => o?.within_five_minutes === 'yes').length,
      known: known.length,
      missing: assigned.length - known.length,
      days: new Set(assigned.map((r) => r.data.local_date)).size,
      interrupted: outcomes.filter(
        (o) => o && ['before_start', 'after_start'].includes(String(o.interruption)),
      ).length,
    }
  })
export const coverage = (observations: AdhdObservation[], zone: string) => {
  const bins = Array.from({ length: 8 }, (_, i) => ({
    label: `${i * 3}:00–${i * 3 + 3}:00`,
    n: 0,
    days: new Set<string>(),
    values: [] as number[],
  }))
  for (const o of observations) {
    if (
      o.scope !== 'current' ||
      o.precision !== 'minute' ||
      ['retrospective', 'imported'].includes(o.sampling)
    ) {
      continue
    }
    const date = new Date(o.observed_at),
      hour = Number(
        new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: 'numeric', hourCycle: 'h23' }).format(date),
      ),
      day = new Intl.DateTimeFormat('en-CA', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date),
      bin = bins[Math.floor(hour / 3)]
    bin.n++
    bin.days.add(day)
    if (typeof o.answers.clarity_now_v1 === 'number') bin.values.push(o.answers.clarity_now_v1)
  }
  return bins.map((b) => {
    const sorted = [...b.values].sort((left, right) => left - right),
      mid = Math.floor(sorted.length / 2)
    return {
      ...b,
      days: b.days.size,
      median: sorted.length ? (sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) : null,
    }
  })
}
export const supportIds = (barrier: string) =>
  ({
    'cannot choose': ['two_methods', 'smaller'],
    'cannot start': ['prepared_starter', 'externalize'],
    'foggy/tired': ['reset', 'recovery'],
    pressured: ['two_methods', 'smaller'],
    distracted: ['one_input', 'externalize'],
    'cannot stop': ['stopping_cue', 'smaller'],
    'need recovery': ['recovery', 'presence'],
  })[barrier] ?? ['prepared_starter', 'recovery']

export const displayObservationTime = (observation: AdhdObservation, zone: string) => {
  const date = new Date(observation.observed_at)
  const day = new Intl.DateTimeFormat(undefined, { timeZone: zone, dateStyle: 'medium' }).format(date)
  if (observation.precision === 'date') return `${day} · date only`
  if (observation.precision === 'uncertain') return `${day} · time uncertain`
  const time = new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    hour: '2-digit',
    ...(observation.precision === 'minute' ? { minute: '2-digit' as const } : {}),
  }).format(date)
  return `${day} ${time}${observation.precision === 'hour' ? ' · hour precision' : ''}`
}

export const coverageGrid = (observations: AdhdObservation[], zone: string) => {
  const days = new Map<string, number[]>()
  for (const o of observations) {
    if (
      o.scope !== 'current' ||
      o.precision !== 'minute' ||
      ['retrospective', 'imported'].includes(o.sampling)
    ) {
      continue
    }
    const at = new Date(o.observed_at),
      date = new Intl.DateTimeFormat('en-CA', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(at),
      hour = Number(
        new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: 'numeric', hourCycle: 'h23' }).format(at),
      )
    const counts = days.get(date) ?? Array<number>(8).fill(0)
    counts[Math.floor(hour / 3)]++
    days.set(date, counts)
  }
  return [...days.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([date, counts]) => ({ date, counts }))
}

export const resumableAttempts = (state: { records: AdhdRecord[] }, now = new Date()) =>
  state.records.filter((row) => {
    if (row.kind !== 'opportunity' || !row.data.condition || row.data.outcome || row.data.deleted_content) {
      return false
    }
    if (row.data.condition === 'self_chosen') {
      return now.getTime() - new Date(row.created_at).getTime() < 24 * 60 * 60 * 1000
    }
    const protocol = state.records.find((p) => p.id === row.parent_id)
    return protocol?.data.status === 'active' && new Date(String(protocol.data.ends_at)) > now
  })

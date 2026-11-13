import {
  computeWorkDayTotals,
  workSettingsSchema,
  type WorkSettings,
  type WorkDayBody,
} from '@aurboda/api-spec'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, endOfDay, format, isWithinInterval, startOfDay, startOfWeek, subDays } from 'date-fns'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'

import { Celebration } from '../../components/Celebration'
import { nextCelebration, type CelebrationEvent } from '../../components/celebration-catalog'
import {
  addCustomMetric,
  addActivityTypeDefinition,
  fetchBucketedMetrics,
  fetchActivityTypeDefinitions,
  fetchActivities,
  fetchComments,
  fetchCustomMetrics,
  fetchUserSettings,
  updateUserSettings,
} from '../../state/api'
import { saveWorkDay } from '../../state/api/work'
import { auth } from '../../state/auth'
import { loadedWorkDayState, responseDays } from './day-state'
import {
  calculateDerivedTotals,
  calculateRates,
  createWorkGridValues,
  deleteWorkDraft,
  inputGroups,
  readWorkDraft,
  sumWorkGridValues,
  type InputTotals,
  type WorkGridValues,
  sumDays,
  storedMetricNamesForProfile,
  shouldCelebrateWorkday,
  weeklyMetricTotals,
  type WorkDay,
  workMetricDefinitionsForProfile,
  writeWorkDraft,
} from './model'
import { createWorkTemplate, needsWorkOnboarding } from './onboarding'
import {
  goalTargetForDate,
  isRecruitingCompatibleProfile,
  resolveActiveWorkProfile,
  weeklyHiresGoalId,
} from './settings'
import { VisualCustomize } from './VisualCustomize'
import './style.css'

const todayKey = () => format(new Date(), 'yyyy-MM-dd')
const dateAtNoon = (date: string) => new Date(`${date}T12:00:00`)
const dateRange = (date: string) => ({
  end: endOfDay(dateAtNoon(date)),
  start: startOfDay(dateAtNoon(date)),
})
const workEntryActivityType = 'work_entry'
const percent = (value: number | null): string => (value === null ? '—' : `${Math.round(value * 100)}%`)

const count = (value: number | undefined): string => Math.round(value ?? 0).toLocaleString()

function MetricNumberInput({
  columnLabel,
  onChange,
  rowLabel,
  columnId,
  rowId,
  value,
}: {
  columnId: string
  columnLabel: string
  onChange: (rowId: string, columnId: string, value: number) => void
  rowId: string
  rowLabel: string
  value: number
}) {
  return (
    <input
      aria-label={`${columnLabel} ${rowLabel}`}
      class="work-count-input"
      min="0"
      step="1"
      type="number"
      value={value || ''}
      onInput={(event) => {
        const next = Math.max(0, Number.parseInt((event.target as HTMLInputElement).value || '0', 10))
        onChange(rowId, columnId, next)
      }}
    />
  )
}

function MetricGroup({
  columns,
  combined,
  group,
  onChange,
  totals,
  values,
  rows,
}: {
  columns: { id: string; label: string }[]
  combined: boolean
  group: { description?: string; id: string; label: string }
  onChange: (rowId: string, columnId: string, value: number) => void
  rows: { id: string; kind: string; label: string }[]
  totals: Record<string, number>
  values: WorkGridValues
}) {
  const gridStyle = {
    gridTemplateColumns:
      columns.length > 0
        ? `minmax(220px, 1.7fr) repeat(${columns.length}, minmax(90px, 0.7fr)) minmax(72px, 0.5fr)`
        : 'minmax(220px, 1.7fr) minmax(72px, 0.5fr)',
  }

  return (
    <section class="work-entry-section">
      <div class="work-section-heading">
        <div>
          <h2>{group.label}</h2>
          <p>{group.description}</p>
        </div>
      </div>
      <div class="work-grid-scroll">
        <div
          class={`work-entry-grid${combined ? ' work-entry-grid-combined' : ''}`}
          style={gridStyle}
          role="table"
          aria-label={group.label}
        >
          <div class="work-grid-header work-metric-label" role="columnheader">
            Metric
          </div>
          {combined ? (
            <div class="work-grid-header work-total-cell" role="columnheader">
              Combined daily total
            </div>
          ) : (
            <>
              {columns.map((column) => (
                <div class="work-grid-header" role="columnheader" key={column.id}>
                  {column.label}
                </div>
              ))}
              <div class="work-grid-header work-total-cell" role="columnheader">
                Total
              </div>
            </>
          )}

          {rows.map((metric) => (
            <div class="work-grid-row" role="row" key={metric.id}>
              <div class="work-metric-label" role="rowheader">
                {metric.label}
              </div>
              {combined ? (
                <div class="work-total-cell" role="cell">
                  {totals[metric.id] ?? 0}
                </div>
              ) : (
                <>
                  {columns.map((column) => (
                    <MetricNumberInput
                      columnId={column.id}
                      columnLabel={column.label}
                      key={column.id}
                      onChange={onChange}
                      rowId={metric.id}
                      rowLabel={metric.label}
                      value={values[metric.id]?.[column.id] ?? 0}
                    />
                  ))}
                  <div class="work-total-cell" role="cell">
                    {totals[metric.id] ?? 0}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Funnel({ totals }: { totals: Record<string, number> }) {
  const items = [
    ['Applications reviewed', totals.work_applications_reviewed],
    ['Invited', totals.work_invited_to_interview],
    ['Interview decisions', totals.work_interview_decisions],
    ['Sent for approval', totals.work_sent_for_approval],
    ['Approved', totals.work_approved],
    ['Hires', totals.work_hires],
  ] as const

  return (
    <div class="work-funnel" aria-label="Recruiting funnel">
      {items.map(([label, value], index) => (
        <div class="work-funnel-step" key={label}>
          <span>{label}</span>
          <strong>{count(value)}</strong>
          {index < items.length - 1 && <span class="work-funnel-arrow">›</span>}
        </div>
      ))}
    </div>
  )
}

function ConversionGrid({ totals }: { totals: Record<string, number> }) {
  const rates = calculateRates(totals)
  const items = [
    ['Invite rate', rates.invite_rate],
    ['Interview completion', rates.interview_completion_rate],
    ['No-show rate', rates.no_show_rate],
    ['Approval rate', rates.approval_rate],
    ['Offer acceptance', rates.offer_acceptance_rate],
    ['Application to hire', rates.application_to_hire_rate],
  ] as const

  return (
    <div class="work-conversion-grid">
      {items.map(([label, value]) => (
        <div class="work-stat-card" key={label}>
          <span>{label}</span>
          <strong>{percent(value)}</strong>
        </div>
      ))}
    </div>
  )
}

function WeeklyChart({
  days,
  goalForWeek,
  metricName,
  metricLabel,
}: {
  days: WorkDay[]
  goalForWeek: (weekStart: string) => number
  metricLabel: string
  metricName: string
}) {
  const weeks = weeklyMetricTotals(days, metricName)
    .slice(-10)
    .map((week) => ({ ...week, goal: goalForWeek(week.start) }))
  const max = Math.max(...weeks.flatMap((week) => [week.goal, week.total]), 1)

  if (weeks.length === 0) return null

  return (
    <section class="work-history-card">
      <div class="work-history-heading">
        <div>
          <h2>Weekly {metricLabel.toLowerCase()}</h2>
          <p>
            Goal: {weeks.at(-1)?.goal ?? goalForWeek(todayKey())} {metricLabel.toLowerCase()}
          </p>
        </div>
      </div>
      <div class="work-week-chart">
        {weeks.map((week) => (
          <div class="work-week-column" key={week.start}>
            <span class="work-week-value">{week.total}</span>
            <div class="work-week-bar-track">
              <div
                class={`work-week-bar${week.total >= week.goal ? ' goal-met' : ''}`}
                style={{ height: `${Math.max(4, (week.total / max) * 100)}%` }}
              />
            </div>
            <span class="work-week-label">{week.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function WorkPageMessage({ error, message }: { error?: boolean; message: string }) {
  return (
    <div class="work-page work-page-message">
      <h1>Work metrics</h1>
      <p class={error ? 'work-error' : undefined}>{message}</p>
    </div>
  )
}

const workPageStatus = ({
  error,
  isLoading,
  isLoggedIn,
}: {
  error: unknown
  isLoading: boolean
  isLoggedIn: boolean
}): { error?: boolean; message: string } | undefined => {
  if (!isLoggedIn) return { message: 'Please log in to track work metrics.' }
  if (isLoading) return { message: 'Loading work tracker…' }
  if (error) {
    return {
      error: true,
      message: error instanceof Error ? error.message : 'Could not load the work tracker.',
    }
  }
  return undefined
}

function HistoryTable({
  columns,
  days,
  onSelect,
}: {
  columns: { label: string; metric: string }[]
  days: WorkDay[]
  onSelect: (date: string) => void
}) {
  if (days.length === 0) return null

  return (
    <section class="work-history-card">
      <div class="work-history-heading">
        <div>
          <h2>Recent workdays</h2>
          <p>Select a row to review or correct it.</p>
        </div>
      </div>
      <div class="work-history-scroll">
        <table class="work-history-table">
          <thead>
            <tr>
              <th>Date</th>
              {columns.map((column) => (
                <th key={column.metric}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...days]
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 16)
              .map((day) => (
                <tr key={day.date} onClick={() => onSelect(day.date)}>
                  <td>{format(dateAtNoon(day.date), 'MMM d, yyyy')}</td>
                  {columns.map((column) => (
                    <td
                      class={column.metric === 'work_hires' ? 'work-hires-cell' : undefined}
                      key={column.metric}
                    >
                      {count(day.totals[column.metric])}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function WorkMetrics() {
  return <WorkMetricsForUser key={auth.value.user ?? auth.value.token ?? 'logged-out'} />
}

// eslint-disable-next-line complexity -- page-level orchestration for the Work tracker and profile editor is inherently multi-branch
function WorkMetricsForUser() {
  const queryClient = useQueryClient()
  const isLoggedIn = Boolean(auth.value.token)
  const draftUser = auth.value.user ?? ''
  const [date, setDate] = useState(todayKey)
  const [values, setValues] = useState<WorkGridValues>(() =>
    createWorkGridValues(resolveActiveWorkProfile(undefined)),
  )
  const [note, setNote] = useState('')
  const [savedAsCombined, setSavedAsCombined] = useState(false)
  const [status, setStatus] = useState('')
  const [celebration, setCelebration] = useState<({ hires: number; id: number } | CelebrationEvent) | null>(
    null,
  )
  const [customizeMode, setCustomizeMode] = useState(false)
  const [workDraftJson, setWorkDraftJson] = useState('')
  const workDraftJsonRef = useRef('')
  const updateWorkDraftJson = (next: string) => {
    workDraftJsonRef.current = next
    setWorkDraftJson(next)
  }
  const [workDraftError, setWorkDraftError] = useState('')

  const settingsQuery = useQuery({
    enabled: isLoggedIn,
    queryFn: fetchUserSettings,
    queryKey: ['work-user-settings', draftUser],
    staleTime: 60_000,
  })
  const activeProfile = useMemo(
    () => resolveActiveWorkProfile(settingsQuery.data?.work),
    [settingsQuery.data?.work],
  )
  const currentSelection = useRef({ date, profileId: activeProfile.id })
  currentSelection.current = { date, profileId: activeProfile.id }
  const savedThisSession = useRef(new Set<string>())
  useEffect(() => setCelebration(null), [date, activeProfile.id])
  const isRecruitingProfile = useMemo(() => isRecruitingCompatibleProfile(activeProfile), [activeProfile])
  const profileMetricDefinitions = useMemo(
    () => workMetricDefinitionsForProfile(activeProfile),
    [activeProfile],
  )
  const profileMetricNames = useMemo(() => storedMetricNamesForProfile(activeProfile), [activeProfile])
  const profileColumns = useMemo(
    () => activeProfile.category_columns.filter((column) => !column.archived_at && !column.hidden),
    [activeProfile],
  )
  const profileSections = useMemo(
    () => activeProfile.sections.filter((section) => !section.archived_at && !section.hidden),
    [activeProfile],
  )
  const profileMetricRows = useMemo(
    () => activeProfile.metric_rows.filter((metric) => !metric.archived_at),
    [activeProfile],
  )

  useEffect(() => {
    if (!customizeMode) return
    const work = {
      ...settingsQuery.data?.work,
      active_profile_id: activeProfile.id,
      profiles: settingsQuery.data?.work?.profiles?.length
        ? settingsQuery.data.work.profiles
        : [activeProfile],
      version: 1,
    }
    updateWorkDraftJson(JSON.stringify(work, null, 2))
    setWorkDraftError('')
  }, [activeProfile, customizeMode, settingsQuery.data?.work])

  const definitionsQuery = useQuery({
    enabled: isLoggedIn && settingsQuery.isSuccess,
    queryFn: async () => {
      const existing = new Set((await fetchCustomMetrics()).map((metric) => metric.name))
      for (const definition of profileMetricDefinitions) {
        if (!existing.has(definition.name)) await addCustomMetric(definition)
      }
      const existingActivityTypes = new Set((await fetchActivityTypeDefinitions()).map((type) => type.name))
      if (!existingActivityTypes.has(workEntryActivityType)) {
        await addActivityTypeDefinition({
          color: '#7c3aed',
          display_category: 'productivity',
          display_name: 'Work entry',
          name: workEntryActivityType,
          show_on_timeline: false,
        })
      }
      return true
    },
    queryKey: ['work-metric-definitions', draftUser, activeProfile.id, profileMetricNames],
    staleTime: Number.POSITIVE_INFINITY,
  })

  const range = dateRange(date)
  const dayQuery = useQuery({
    enabled: isLoggedIn && settingsQuery.isSuccess && definitionsQuery.isSuccess,
    queryFn: () => fetchBucketedMetrics(range.start, range.end, profileMetricNames, '1d'),
    queryKey: ['work-day', draftUser, activeProfile.id, date, profileMetricNames],
  })
  const dayTime = dateAtNoon(date)
  const dayEntityId = `${dayTime.toISOString()}|${activeProfile.storage_contract.day_marker_metric}|${activeProfile.storage_contract.daily_metric_source}`
  const noteQuery = useQuery({
    enabled: isLoggedIn && settingsQuery.isSuccess && definitionsQuery.isSuccess,
    queryFn: () => fetchComments('metric', dayEntityId),
    queryKey: ['work-day-note', draftUser, dayEntityId],
  })

  const entryQuery = useQuery({
    enabled: isLoggedIn && settingsQuery.isSuccess && definitionsQuery.isSuccess,
    queryFn: () => fetchActivities(range.start, range.end, [workEntryActivityType]),
    queryKey: ['work-entry', draftUser, activeProfile.id, date],
  })

  const historyQuery = useQuery({
    enabled: isLoggedIn && settingsQuery.isSuccess && definitionsQuery.isSuccess,
    queryFn: () =>
      fetchBucketedMetrics(
        new Date('2026-01-01T00:00:00'),
        endOfDay(addDays(new Date(), 1)),
        profileMetricNames,
        '1d',
      ),
    queryKey: ['work-history', draftUser, activeProfile.id, profileMetricNames],
  })

  useEffect(() => {
    const loaded = loadedWorkDayState(
      activeProfile,
      dayQuery.data,
      noteQuery.data,
      entryQuery.data,
      localStorage,
      draftUser,
      date,
    )
    if (!loaded) return
    setValues(loaded.values)
    setNote(loaded.note)
    setSavedAsCombined(loaded.savedAsCombined)
    setStatus(loaded.status)
  }, [
    activeProfile,
    date,
    dayQuery.dataUpdatedAt,
    draftUser,
    entryQuery.dataUpdatedAt,
    noteQuery.dataUpdatedAt,
  ])

  const rowTotals = useMemo(() => sumWorkGridValues(activeProfile, values), [activeProfile, values])
  const inputTotals = useMemo(() => {
    if (!isRecruitingProfile) return null
    return Object.fromEntries(
      inputGroups.flatMap((group) => group.metrics.map((metric) => [metric.key, rowTotals[metric.key] ?? 0])),
    ) as InputTotals
  }, [isRecruitingProfile, rowTotals])
  const liveTotals = useMemo(() => computeWorkDayTotals(activeProfile, values), [activeProfile, values])
  const historyDays = useMemo(
    () => responseDays(historyQuery.data, activeProfile.storage_contract.day_marker_metric),
    [activeProfile.storage_contract.day_marker_metric, historyQuery.data],
  )
  const selectedDate = dateAtNoon(date)
  const selectedWeekStart = startOfWeek(selectedDate, { weekStartsOn: 1 })
  const selectedWeekStartKey = format(selectedWeekStart, 'yyyy-MM-dd')
  const selectedGoal =
    activeProfile.goals.find((goal) => goal.id === weeklyHiresGoalId) ?? activeProfile.goals[0]
  const selectedWeekGoal = selectedGoal
    ? (goalTargetForDate(activeProfile, selectedGoal.id, selectedWeekStartKey) ??
      selectedGoal.revisions[0]?.target ??
      10)
    : 10
  const goalForWeek = useMemo(
    () => (weekStart: string) =>
      selectedGoal
        ? (goalTargetForDate(activeProfile, selectedGoal.id, weekStart) ??
          selectedGoal.revisions[0]?.target ??
          10)
        : 10,
    [activeProfile, selectedGoal],
  )
  const selectedWeekEnd = addDays(selectedWeekStart, 6)
  const weekDays = historyDays.filter((day) =>
    isWithinInterval(dateAtNoon(day.date), { end: selectedWeekEnd, start: selectedWeekStart }),
  )
  const weekTotals = sumDays(weekDays, activeProfile.storage_contract.day_marker_metric)
  const allTotals = sumDays(historyDays, activeProfile.storage_contract.day_marker_metric)
  const last28Totals = sumDays(
    historyDays.filter((day) => dateAtNoon(day.date) >= startOfDay(subDays(new Date(), 27))),
    activeProfile.storage_contract.day_marker_metric,
  )
  const derived = inputTotals ? calculateDerivedTotals(inputTotals) : null
  const historyColumns = useMemo(
    () =>
      isRecruitingProfile
        ? [
            { label: 'Applications', metric: 'work_applications_reviewed' },
            { label: 'Interviews', metric: 'work_interview_decisions' },
            { label: 'Sent', metric: 'work_sent_for_approval' },
            { label: 'Approved', metric: 'work_approved' },
            { label: 'Hires', metric: 'work_hires' },
          ]
        : profileMetricRows
            .filter((metric) => !metric.hidden)
            .slice(0, 5)
            .map((metric) => ({ label: metric.label, metric: metric.storage_metric })),
    [isRecruitingProfile, profileMetricRows],
  )
  const primaryGoal =
    activeProfile.goals.find((goal) => goal.id === weeklyHiresGoalId) ?? activeProfile.goals[0]
  const primaryMetric = primaryGoal
    ? activeProfile.metric_rows.find((metric) => metric.id === primaryGoal.metric_id)
    : undefined
  const primaryMetricName = primaryMetric?.storage_metric ?? activeProfile.storage_contract.day_marker_metric
  const primaryMetricLabel = primaryMetric?.label ?? primaryGoal?.label ?? 'Metric'
  const sectionDescriptions = new Map<string, string>(
    inputGroups.map((group) => [group.id, group.description]),
  )
  const assignedMetricIds = new Set(activeProfile.sections.flatMap((section) => section.metric_ids))
  const unassignedRows = profileMetricRows.filter(
    (metric) => !metric.hidden && !assignedMetricIds.has(metric.id),
  )

  const retainedCells = activeProfile.metric_rows
    .filter((metric) => metric.kind === 'input')
    .flatMap((metric) =>
      activeProfile.category_columns.flatMap((column) => {
        const value = values[metric.id]?.[column.id] ?? 0
        const sectionHidden = activeProfile.sections.some(
          (section) => section.metric_ids.includes(metric.id) && (section.hidden || section.archived_at),
        )
        return value > 0 &&
          (metric.hidden || metric.archived_at || column.hidden || column.archived_at || sectionHidden)
          ? [{ id: `${metric.id}:${column.id}`, label: `${metric.label} · ${column.label}`, value }]
          : []
      }),
    )

  const updateValue = (rowId: string, columnId: string, value: number) => {
    setValues((current) => {
      const next = {
        ...current,
        [rowId]: { ...current[rowId], [columnId]: value },
      }
      writeWorkDraft(localStorage, draftUser, date, next, note, activeProfile.id)
      return next
    })
    setSavedAsCombined(false)
    setStatus('')
  }

  const saveMutation = useMutation({
    mutationFn: (snapshot: {
      body: WorkDayBody
      draftUser: string
      noteKey: string
      hires?: number
      newDay: boolean
    }) => saveWorkDay(snapshot.body),
    onError: (error: Error) => setStatus(error.message),
    onSuccess: async (_result, snapshot) => {
      const currentDraft = readWorkDraft(
        localStorage,
        snapshot.draftUser,
        snapshot.body.work_date,
        snapshot.body.profile_id,
      )
      if (
        currentDraft &&
        currentDraft.note === snapshot.body.note &&
        JSON.stringify(currentDraft.values) === JSON.stringify(snapshot.body.values)
      ) {
        deleteWorkDraft(localStorage, snapshot.draftUser, snapshot.body.work_date, snapshot.body.profile_id)
      }
      const savedKey = `${snapshot.body.profile_id}:${snapshot.body.work_date}`
      const firstSave = snapshot.newDay && !savedThisSession.current.has(savedKey)
      savedThisSession.current.add(savedKey)
      if (
        currentSelection.current.date === snapshot.body.work_date &&
        currentSelection.current.profileId === snapshot.body.profile_id
      ) {
        setStatus('Workday saved')
        setSavedAsCombined(false)
        if (snapshot.hires !== undefined && shouldCelebrateWorkday(snapshot.hires)) {
          setCelebration({ hires: snapshot.hires, id: Date.now() })
        } else if (firstSave) {
          setCelebration(nextCelebration('workday'))
        }
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['work-day', snapshot.draftUser, snapshot.body.profile_id, snapshot.body.work_date],
        }),
        queryClient.invalidateQueries({ queryKey: ['work-day-note', snapshot.draftUser, snapshot.noteKey] }),
        queryClient.invalidateQueries({
          queryKey: ['work-entry', snapshot.draftUser, snapshot.body.profile_id, snapshot.body.work_date],
        }),
        queryClient.invalidateQueries({
          queryKey: ['work-history', snapshot.draftUser, snapshot.body.profile_id],
        }),
      ])
    },
  })

  const saveWorkSettingsMutation = useMutation({
    mutationFn: async (work?: WorkSettings) => {
      const parsed = workSettingsSchema.parse(work ?? JSON.parse(workDraftJsonRef.current))
      return updateUserSettings({ work: parsed })
    },
    onError: (error: Error) => setWorkDraftError(error.message),
    onSuccess: (result) => {
      queryClient.setQueryData(['work-user-settings', draftUser], result)
      setCustomizeMode(false)
      setWorkDraftError('')
      setStatus('Work settings saved')
    },
  })

  const pageStatus = workPageStatus({
    error:
      settingsQuery.error ??
      definitionsQuery.error ??
      dayQuery.error ??
      noteQuery.error ??
      entryQuery.error ??
      historyQuery.error,
    isLoading:
      settingsQuery.isPending ||
      definitionsQuery.isPending ||
      dayQuery.isPending ||
      noteQuery.isPending ||
      entryQuery.isPending ||
      historyQuery.isPending,
    isLoggedIn,
  })
  if (pageStatus) return <WorkPageMessage {...pageStatus} />

  const hasWorkHistory = Boolean(
    historyQuery.data?.buckets?.length ||
    entryQuery.data?.length ||
    readWorkDraft(localStorage, draftUser, date, activeProfile.id),
  )
  if (needsWorkOnboarding(settingsQuery.data?.work, hasWorkHistory)) {
    return (
      <section class="work-page work-entry-section">
        <h1>Set up your Work tracker</h1>
        <p>Choose a starting point. You can customize rows, columns, and goals afterward.</p>
        <div class="work-template-options">
          {(
            [
              ['recruiting', 'Recruiting', 'Applications, interviews, offers, and hiring goals.'],
              ['productivity', 'General Productivity', 'Tasks completed, focus sessions, and a weekly goal.'],
              ['blank', 'Blank tracker', 'Start with an empty section and add your own metrics.'],
            ] as const
          ).map(([template, label, description]) => (
            <button
              type="button"
              disabled={saveWorkSettingsMutation.isPending}
              onClick={() => saveWorkSettingsMutation.mutate(createWorkTemplate(template))}
              key={template}
            >
              <strong>{label}</strong>
              <span>{description}</span>
            </button>
          ))}
        </div>
        {workDraftError && (
          <p role="alert" class="work-error">
            {workDraftError}
          </p>
        )}
      </section>
    )
  }

  return (
    <div class="work-page">
      {celebration &&
        ('hires' in celebration ? (
          <Celebration
            icon="🎉"
            id={celebration.id}
            kind="work"
            message={`${celebration.hires} hires recorded today — fantastic work.`}
            title={celebration.hires === 3 ? 'Hiring hat trick!' : 'Hiring spree!'}
            onDone={() => setCelebration(null)}
          />
        ) : (
          <Celebration key={celebration.id} {...celebration} onDone={() => setCelebration(null)} />
        ))}
      <header class="work-page-header">
        <div>
          <p class="work-eyebrow">{isRecruitingProfile ? 'Career metrics' : 'Work profile'}</p>
          <h1>{activeProfile.name}</h1>
          <p>
            {isRecruitingProfile
              ? 'Enter counts by position. Aurboda saves the full grid and daily totals.'
              : 'Customize the profile structure, then enter values by section.'}
          </p>
        </div>
        <div class="work-date-controls">
          <button type="button" onClick={() => setDate(format(addDays(dateAtNoon(date), -1), 'yyyy-MM-dd'))}>
            Previous
          </button>
          <input
            aria-label="Workday date"
            type="date"
            max={todayKey()}
            value={date}
            onInput={(event) => {
              const nextDate = (event.target as HTMLInputElement).value
              if (nextDate) setDate(nextDate)
            }}
          />
          <button type="button" onClick={() => setDate(todayKey())}>
            Today
          </button>
          <button type="button" onClick={() => setCustomizeMode((current) => !current)}>
            {customizeMode ? 'Exit customize' : 'Customize'}
          </button>
        </div>
      </header>

      {customizeMode && (
        <section class="work-entry-section">
          <div class="work-section-heading">
            <div>
              <h2>Customize Work profile</h2>
              <p>
                Arrange your tracker. Renaming keeps historical records linked; archiving keeps their values.
              </p>
            </div>
          </div>
          {(() => {
            try {
              const work = workSettingsSchema.parse(JSON.parse(workDraftJson))
              return (
                <VisualCustomize
                  work={work}
                  onChange={(next) => updateWorkDraftJson(JSON.stringify(next, null, 2))}
                />
              )
            } catch {
              return <p class="work-error">Fix the Advanced configuration to return to visual editing.</p>
            }
          })()}
          <details>
            <summary>Advanced configuration (JSON)</summary>
            <textarea
              rows={18}
              value={workDraftJson}
              onInput={(event) => updateWorkDraftJson((event.target as HTMLTextAreaElement).value)}
              placeholder="Edit Work settings JSON"
              aria-label="Advanced Work settings JSON"
            />
          </details>
          <div class="work-save-bar">
            <div class={workDraftError ? 'work-error' : 'work-save-status'}>
              {workDraftError || 'Changes apply when you save settings.'}
            </div>
            <button class="work-clear-button" type="button" onClick={() => setCustomizeMode(false)}>
              Cancel
            </button>
            <button
              class="work-save-button"
              disabled={saveWorkSettingsMutation.isPending}
              type="button"
              onClick={() => saveWorkSettingsMutation.mutate(undefined)}
            >
              {saveWorkSettingsMutation.isPending ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </section>
      )}

      {savedAsCombined && (
        <div class="work-info">
          <span>
            {isRecruitingProfile
              ? 'This legacy day has combined totals only. Editing starts with those totals in the first column.'
              : 'This older day has combined totals only. Editing starts with those totals in the first column.'}
          </span>
          <button type="button" onClick={() => setSavedAsCombined(false)}>
            Edit this day
          </button>
        </div>
      )}

      {isRecruitingProfile ? (
        <>
          <Funnel totals={liveTotals} />
          <div class="work-today-summary">
            <div>
              <span>Application declines</span>
              <strong>{derived?.application_declines ?? 0}</strong>
            </div>
            <div>
              <span>Interview appointments</span>
              <strong>{derived?.interview_appointments ?? 0}</strong>
            </div>
            <div>
              <span>Approval denials</span>
              <strong>{derived?.approval_denials ?? 0}</strong>
            </div>
            <div class="work-today-hires">
              <span>Hires</span>
              <strong>{derived?.hires ?? 0}</strong>
            </div>
          </div>
        </>
      ) : (
        <div class="work-today-summary">
          <div>
            <span>{primaryMetricLabel} this week</span>
            <strong>{count(weekTotals[primaryMetricName])}</strong>
          </div>
          <div>
            <span>{primaryMetricLabel} last 28 days</span>
            <strong>{count(last28Totals[primaryMetricName])}</strong>
          </div>
          <div>
            <span>Recorded workdays</span>
            <strong>{historyDays.length}</strong>
          </div>
          <div class="work-today-hires">
            <span>{selectedGoal?.label ?? 'Goal'}</span>
            <strong>{selectedWeekGoal}</strong>
          </div>
        </div>
      )}

      {profileSections.map((section) => {
        const rows = section.metric_ids
          .map((metricId) => activeProfile.metric_rows.find((metric) => metric.id === metricId))
          .filter(
            (metric): metric is (typeof profileMetricRows)[number] =>
              metric !== undefined && !metric.hidden && !metric.archived_at,
          )

        if (rows.length === 0) return null

        return (
          <MetricGroup
            columns={profileColumns.map((column) => ({ id: column.id, label: column.label }))}
            combined={savedAsCombined}
            group={{
              description: sectionDescriptions.get(section.id),
              id: section.id,
              label: section.label,
            }}
            key={section.id}
            onChange={updateValue}
            rows={rows.map((metric) => ({ id: metric.id, kind: metric.kind, label: metric.label }))}
            totals={Object.fromEntries(
              activeProfile.metric_rows.map((metric) => [metric.id, liveTotals[metric.storage_metric] ?? 0]),
            )}
            values={values}
          />
        )
      })}

      {unassignedRows.length > 0 && (
        <MetricGroup
          columns={profileColumns.map((column) => ({ id: column.id, label: column.label }))}
          combined={savedAsCombined}
          group={{
            description: 'Metrics that are not assigned to a section yet.',
            id: 'unassigned',
            label: 'Other metrics',
          }}
          onChange={updateValue}
          rows={unassignedRows.map((metric) => ({ id: metric.id, kind: metric.kind, label: metric.label }))}
          totals={Object.fromEntries(
            activeProfile.metric_rows.map((metric) => [metric.id, liveTotals[metric.storage_metric] ?? 0]),
          )}
          values={values}
        />
      )}

      {retainedCells.length > 0 && (
        <details class="work-entry-section">
          <summary>Hidden and archived values for this workday</summary>
          <p>
            These saved values still contribute to totals. Restore or show the items in Customize to edit
            them.
          </p>
          <ul>
            {retainedCells.map((cell) => (
              <li key={cell.id}>
                {cell.label}: {count(cell.value)}
              </li>
            ))}
          </ul>
        </details>
      )}

      <section class="work-entry-section work-note-section">
        <div class="work-section-heading">
          <div>
            <h2>Notes</h2>
            <p>Optional context for this workday.</p>
          </div>
        </div>
        <textarea
          rows={3}
          value={note}
          placeholder="Training, unusual workload, coverage, process changes…"
          onInput={(event) => {
            const next = (event.target as HTMLTextAreaElement).value
            setNote(next)
            writeWorkDraft(localStorage, draftUser, date, values, next, activeProfile.id)
            setStatus('')
          }}
        />
      </section>

      <div class="work-save-bar">
        <div class={status && status !== 'Workday saved' ? 'work-error' : 'work-save-status'}>{status}</div>
        <button
          class="work-clear-button"
          type="button"
          onClick={() => {
            deleteWorkDraft(localStorage, draftUser, date, activeProfile.id)
            setValues(createWorkGridValues(activeProfile))
            setNote('')
            setSavedAsCombined(false)
            setStatus('')
          }}
        >
          Clear form
        </button>
        <button
          class="work-save-button"
          disabled={saveMutation.isPending}
          type="button"
          onClick={() =>
            saveMutation.mutate({
              body: {
                profile_id: activeProfile.id,
                work_date: date,
                timestamp: dayTime.toISOString(),
                values,
                totals: liveTotals,
                note,
              },
              draftUser,
              noteKey: dayEntityId,
              hires: derived?.hires,
              newDay:
                dayQuery.isSuccess &&
                entryQuery.isSuccess &&
                !dayQuery.data?.buckets?.some((bucket) => Object.keys(bucket.metrics).length > 0) &&
                !entryQuery.data?.some(
                  (entry) => entry.data?.profile_id === activeProfile.id && entry.data?.work_date === date,
                ),
            })
          }
        >
          {saveMutation.isPending ? 'Saving…' : 'Save workday'}
        </button>
      </div>

      <section class="work-performance-section">
        <div class="work-performance-heading">
          <div>
            <p class="work-eyebrow">Performance history</p>
            <h2>Week of {format(selectedWeekStart, 'MMM d')}</h2>
          </div>
          <div class="work-goal-summary">
            <span>{selectedGoal?.label ?? 'Weekly target'}</span>
            <strong>
              {count(weekTotals[primaryMetricName])} / {selectedWeekGoal}
            </strong>
          </div>
        </div>
        {isRecruitingProfile ? (
          <>
            <Funnel totals={weekTotals} />
            <ConversionGrid totals={weekTotals} />
          </>
        ) : (
          <div class="work-period-grid">
            <div class="work-period-card">
              <span>{primaryMetricLabel} this week</span>
              <strong>{count(weekTotals[primaryMetricName])}</strong>
              <small>
                {selectedGoal?.label ?? 'Goal'} target {selectedWeekGoal}
              </small>
            </div>
            <div class="work-period-card">
              <span>{primaryMetricLabel} last 28 days</span>
              <strong>{count(last28Totals[primaryMetricName])}</strong>
              <small>{historyDays.length} recorded workdays</small>
            </div>
          </div>
        )}
      </section>

      {isRecruitingProfile && (
        <div class="work-period-grid">
          <div class="work-period-card">
            <span>Last 28 days</span>
            <strong>{count(last28Totals.work_hires)} hires</strong>
            <small>{count(last28Totals.work_applications_reviewed)} applications reviewed</small>
          </div>
          <div class="work-period-card">
            <span>Imported history</span>
            <strong>{count(allTotals.work_hires)} hires</strong>
            <small>{historyDays.length} recorded workdays</small>
          </div>
        </div>
      )}

      <WeeklyChart
        days={historyDays}
        goalForWeek={goalForWeek}
        metricLabel={primaryMetricLabel}
        metricName={primaryMetricName}
      />
      <HistoryTable columns={historyColumns} days={historyDays} onSelect={setDate} />
    </div>
  )
}

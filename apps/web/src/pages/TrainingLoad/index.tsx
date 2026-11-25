import type { TrainingLoadPoint, TrainingLoadResult, WorkoutTrimp } from '@aurboda/api-spec'

import { signal } from '@preact/signals'
import { useQuery } from '@tanstack/react-query'
import { format, startOfDay, subDays } from 'date-fns'
import { useState } from 'preact/hooks'

import { fetchTrainingLoad } from '../../state/api'
import { auth } from '../../state/auth'
import { formState, newestFirst } from '../../utils/trainingLoad'
import { ATL_COLOR, CTL_COLOR, TSB_FATIGUED_COLOR, TSB_FRESH_COLOR } from '../Timeline/drawTrainingLoadTrack'
import { TrainingLoadChart } from './TrainingLoadChart'
import './style.css'

const RANGES = [30, 90, 180, 365]
const WORKOUTS_SHOWN = 20
const daysBack = signal(90)

const signed = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}`

export function FormSummary({ point }: { point: TrainingLoadPoint }) {
  const form = formState(point.tsb)
  const gap = Math.abs(point.tsb).toFixed(1)
  return (
    <section class="tl-summary">
      <div class={`tl-form tl-form-${form}`}>
        <div class="tl-form-label">
          {point.tsb >= 0 ? 'Long-term load ≥ short-term load' : 'Short-term load > long-term load'}
        </div>
        <p>
          {form === 'fresh'
            ? `Long-term modeled load exceeds short-term modeled load by ${gap}.`
            : `Short-term modeled load exceeds long-term modeled load by ${gap}.`}
        </p>
      </div>
      <div class="tl-stats">
        <div class="tl-stat">
          <div class="tl-stat-label">Long-term load (CTL)</div>
          <div class="tl-stat-value" style={{ color: CTL_COLOR }}>
            {point.ctl.toFixed(1)}
          </div>
        </div>
        <div class="tl-stat">
          <div class="tl-stat-label">Short-term load (ATL)</div>
          <div class="tl-stat-value" style={{ color: ATL_COLOR }}>
            {point.atl.toFixed(1)}
          </div>
        </div>
        <div class="tl-stat">
          <div class="tl-stat-label">Load difference (TSB)</div>
          <div
            class="tl-stat-value"
            style={{ color: form === 'fresh' ? TSB_FRESH_COLOR : TSB_FATIGUED_COLOR }}
          >
            {signed(point.tsb)}
          </div>
        </div>
      </div>
    </section>
  )
}

function WorkoutsTable({ workouts }: { workouts: WorkoutTrimp[] }) {
  const [showAll, setShowAll] = useState(false)
  if (workouts.length === 0) return <p class="tl-muted">No workouts in this range.</p>
  const sorted = newestFirst(workouts)
  const shown = showAll ? sorted : sorted.slice(0, WORKOUTS_SHOWN)
  const maxTrimp = Math.max(...workouts.map((w) => w.trimp), 1)
  return (
    <>
      <table class="tl-workouts">
        <thead>
          <tr>
            <th>Date</th>
            <th>Workout</th>
            <th class="tl-wide">Duration</th>
            <th class="tl-wide">Avg HR</th>
            <th>TRIMP</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((w) => {
            const meta = [
              `${Math.round(w.duration_minutes)} min`,
              ...(w.avg_hr ? [`${Math.round(w.avg_hr)} bpm`] : []),
            ].join(' · ')
            const estimated = w.trimp_basis === 'duration_estimate'
            return (
              <tr key={w.activity_id ?? w.start_time}>
                <td class="tl-date">{format(new Date(w.start_time), 'EEE MMM d')}</td>
                <td>
                  {w.activity_id ? (
                    <a href={`/detail/activity/${encodeURIComponent(w.activity_id)}`}>
                      {w.title ?? 'Workout'}
                    </a>
                  ) : (
                    (w.title ?? 'Workout')
                  )}
                  <div class="tl-narrow tl-muted">{meta}</div>
                </td>
                <td class="tl-wide">{Math.round(w.duration_minutes)} min</td>
                <td class="tl-wide">{w.avg_hr ? `${Math.round(w.avg_hr)} bpm` : '–'}</td>
                <td class="tl-trimp">
                  <div class="tl-trimp-cell">
                    <span
                      class="tl-trimp-value"
                      title={estimated ? 'Estimated from duration (no usable heart rate)' : undefined}
                    >
                      {Math.round(w.trimp)}
                      {estimated && '*'}
                    </span>
                    <span class="tl-trimp-track">
                      <span class="tl-trimp-bar" style={{ width: `${(w.trimp / maxTrimp) * 100}%` }} />
                    </span>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {sorted.some((w) => w.trimp_basis === 'duration_estimate') && (
        <p class="tl-muted tl-footnote">
          * Estimated from duration: no usable heart rate during the workout.
        </p>
      )}
      {sorted.length > WORKOUTS_SHOWN && (
        <button type="button" class="tl-show-all" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer' : `Show all ${sorted.length} workouts`}
        </button>
      )}
    </>
  )
}

function EstimatedNote({ data }: { data: TrainingLoadResult }) {
  const { estimated_impulse: basis } = data
  if (basis.estimated_workouts === 0 || basis.estimated_share === null) return null
  return (
    <p class="tl-note">
      {basis.estimated_workouts} of {basis.workouts} workouts in this range (
      {Math.round(basis.estimated_share * 100)}% of their TRIMP) are estimated from duration, so long-term and
      short-term load are partly estimated.
    </p>
  )
}

export function LoadOverview({ data }: { data: TrainingLoadResult }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const { points } = data
  const latest = points.at(-1)
  if (!latest || !points.some((p) => p.ctl > 0 || p.atl > 0)) {
    return (
      <p class="tl-muted">
        No training load in this range yet. It builds from exercise sessions (scored from heart rate when it
        was recorded) and active calories.
      </p>
    )
  }
  const readout = (hoverIndex !== null ? points[hoverIndex] : undefined) ?? latest
  return (
    <>
      <p class="tl-note">
        Recorded load is a model estimate, not a measurement of recovery or readiness. Source coverage is
        unknown: a gap does not show rest or recovery. Sleep, illness and other life demands are not included.
      </p>
      <FormSummary point={latest} />
      <EstimatedNote data={data} />

      <section class="tl-section">
        <h2>Modeled training load</h2>
        <div class="tl-legend">
          <span class="tl-legend-item">
            <span class="tl-swatch" style={{ background: CTL_COLOR }} /> Long-term load (CTL)
          </span>
          <span class="tl-legend-item">
            <span class="tl-swatch" style={{ background: ATL_COLOR }} /> Short-term load (ATL)
          </span>
          <span class="tl-legend-item">
            <span class="tl-swatch" style={{ background: TSB_FRESH_COLOR }} />
            <span class="tl-swatch" style={{ background: TSB_FATIGUED_COLOR }} /> Load difference (TSB)
          </span>
        </div>
        <TrainingLoadChart points={points} bootstrapping={data.bootstrapping} onHover={setHoverIndex} />
        <p class="tl-readout">
          <strong>{format(new Date(readout.time), 'EEE MMM d')}</strong> · Long-term load{' '}
          {readout.ctl.toFixed(1)} · Short-term load {readout.atl.toFixed(1)} · Difference{' '}
          {signed(readout.tsb)}
          {readout.training_impulse > 0 && ` · Training ${readout.training_impulse.toFixed(0)}`}
        </p>
      </section>

      <section class="tl-section">
        <h2>Data coverage</h2>
        <p class="tl-muted">
          Source coverage is unknown. Model bands are unavailable; gaps may be missing recordings or
          inactivity.
        </p>
      </section>
    </>
  )
}

export function TrainingLoad() {
  const isLoggedIn = Boolean(auth.value.token)
  const days = daysBack.value

  const { data, isLoading, error } = useQuery({
    enabled: isLoggedIn,
    queryFn: () => fetchTrainingLoad(startOfDay(subDays(new Date(), days)), new Date(), '1d'),
    queryKey: ['trainingLoadPage', days],
    staleTime: 5 * 60 * 1000,
  })

  if (!isLoggedIn) {
    return (
      <div class="training-load-page">
        <p>Please log in to see your training load.</p>
      </div>
    )
  }

  return (
    <div class="training-load-page">
      <div class="tl-header">
        <div>
          <h1>Training load</h1>
          <p class="tl-subtitle">
            Modeled training load from your workouts and daily movement (Banister model).{' '}
            <a href="/settings#training-load">Time constants</a>
          </p>
        </div>
        <select
          class="tl-range"
          aria-label="Date range"
          value={days}
          onChange={(e) => {
            daysBack.value = parseInt((e.target as HTMLSelectElement).value, 10)
          }}
        >
          {RANGES.map((n) => (
            <option key={n} value={n}>
              Last {n} days
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p class="tl-muted">Loading training load...</p>}
      {error && <p class="tl-error">Could not load training load.</p>}

      {data && (
        <>
          <LoadOverview key={days} data={data} />
          <section class="tl-section">
            <h2>Workouts</h2>
            <WorkoutsTable workouts={data.workouts} />
          </section>
          <p class="tl-muted tl-footnote">
            Short-term load (ATL) uses a {data.settings.tau_acute ?? 7}-day time constant and long-term load
            (CTL) a {data.settings.tau_chronic ?? 42}-day one.{' '}
            <a href="/settings#training-load">Change them in Settings</a>.
          </p>
        </>
      )}
    </div>
  )
}

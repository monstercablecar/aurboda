import type {
  AdhdCommand,
  AdhdCommandBody,
  AdhdContext,
  AdhdObservationInput,
  AdhdRecord,
  AdhdResponse,
  AdhdState,
  AdhdItem,
  AdhdHypothesisInput,
  AdhdSettings,
} from '@aurboda/api-spec'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useEffect, useRef, useState } from 'preact/hooks'

import { API_URL } from '../../config'
import { listTasks } from '../../state/api/tasks'
import { auth } from '../../state/auth'
import { currentSessionGeneration } from '../../state/sessionBoundary'
import { loadPrivate, storePrivate, removePrivate, sessionGuard } from './drafts'
import {
  applicable,
  arms,
  coverage,
  coverageGrid,
  displayObservationTime,
  itemIds,
  supportIds,
  resumableAttempts,
} from './model'
import './style.css'

const emptyContext: AdhdContext = {
  target: '',
  phase: 'none',
  task_class: '',
  context: 'other',
  main_sleep_confirmed: false,
}
const headers = () => ({ Authorization: `Bearer ${auth.value.token}` })
const requestState = async () =>
  (await axios.get<AdhdResponse>(`${API_URL}/adhd`, { headers: headers() })).data.data!
type Send = (command: AdhdCommand) => Promise<boolean>
const field = (event: Event) => (event.currentTarget as HTMLInputElement).value
const errorText = (e: unknown) =>
  axios.isAxiosError(e)
    ? String(
        e.response?.data?.error ?? 'Connection uncertain. Your request is retained; retry with the same key.',
      )
    : e instanceof Error
      ? e.message
      : 'Save failed.'

function Questions({
  items,
  pack,
  context,
  values,
  onChange,
}: {
  items: AdhdItem[]
  pack: AdhdObservationInput['pack']
  context: AdhdContext
  values: Record<string, number>
  onChange: (v: Record<string, number>) => void
}) {
  const [position, setPosition] = useState(0)
  const available = items.filter((item) => itemIds(pack).includes(item.id) && applicable(item.id, context))
  const index = Math.min(position, Math.max(0, available.length - 1))
  const item = available[index]
  if (!item) return <p>No questions apply to this task phase.</p>
  return (
    <div class="adhd-questions">
      <div class="adhd-question-progress">
        <span>
          {index + 1} / {available.length}
        </span>
        <span>{context.target || 'Just checking in'}</span>
      </div>
      <div class="adhd-progress" aria-hidden="true">
        {available.map((question, n) => (
          <i class={n === index ? 'current' : Object.hasOwn(values, question.id) ? 'answered' : ''} />
        ))}
      </div>
      <fieldset key={item.id}>
        <legend>{item.prompt.replace('[target task]', context.target || 'the selected task')}</legend>
        <div class="adhd-ratings">
          {item.anchors.map((label, n) => (
            <label>
              <input
                type="radio"
                name={item.id}
                value={n + 1}
                checked={values[item.id] === n + 1}
                onChange={() => onChange({ ...values, [item.id]: n + 1 })}
              />
              <span>
                <b>{n + 1}</b>
                <small>{label}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div class="adhd-flow-actions">
        <button type="button" disabled={index === 0} onClick={() => setPosition(index - 1)}>
          Back
        </button>
        <button
          type="button"
          class="adhd-text"
          onClick={() => {
            const next = { ...values }
            delete next[item.id]
            onChange(next)
            if (index < available.length - 1) setPosition(index + 1)
          }}
        >
          Skip question
        </button>
        <button
          type="button"
          disabled={index === available.length - 1}
          onClick={() => setPosition(index + 1)}
        >
          Next question →
        </button>
      </div>
      {index === available.length - 1 && (
        <p class="adhd-hint">That’s the last question. You can save with any items skipped.</p>
      )}
    </div>
  )
}

function Context({
  value,
  onChange,
  recent,
}: {
  value: AdhdContext
  onChange: (c: AdhdContext) => void
  recent: string[]
}) {
  const tasks = useQuery({
    queryKey: ['adhd-task-picker'],
    queryFn: () => listTasks(),
    enabled: !!auth.value.token,
  })
  return (
    <div class="adhd-context">
      <label>
        What are you doing?
        <input
          list="adhd-recent-targets"
          maxLength={300}
          placeholder="Just checking in"
          value={value.target}
          onInput={(e) =>
            onChange({
              ...value,
              target: field(e),
              task_id: undefined,
              phase: field(e) ? (value.phase === 'none' ? 'pre_start' : value.phase) : 'none',
            })
          }
        />
        <datalist id="adhd-recent-targets">
          {recent.map((t) => (
            <option value={t} />
          ))}
        </datalist>
      </label>
      <label>
        Where are you with it?
        <select
          value={value.phase}
          onChange={(e) => onChange({ ...value, phase: field(e) as AdhdContext['phase'] })}
        >
          <option value="none">No target</option>
          <option value="pre_start">Before starting</option>
          <option value="ongoing">Already doing it</option>
          <option value="after">Just finished</option>
        </select>
      </label>
      <details class="adhd-context-more">
        <summary>Link a task or add context</summary>
        <label>
          Existing task
          <select
            value={value.task_id ?? ''}
            onChange={(e) => {
              const id = field(e),
                t = tasks.data?.data?.find((candidate) => candidate.id === id)
              onChange({
                ...value,
                task_id: id || undefined,
                target: t?.title ?? '',
                phase: id ? 'pre_start' : 'none',
                project_id: t?.project_id ?? undefined,
              })
            }}
          >
            <option value="">Use a temporary label</option>
            {tasks.data?.data?.map((t) => (
              <option value={t.id}>{t.title}</option>
            ))}
          </select>
        </label>
        <label>
          Task class
          <input
            value={value.task_class}
            maxLength={100}
            placeholder="e.g. brief writing"
            onInput={(e) => onChange({ ...value, task_class: field(e) })}
          />
        </label>
        <label>
          Context
          <select
            value={value.context}
            onChange={(e) => onChange({ ...value, context: field(e) as AdhdContext['context'] })}
          >
            {['work', 'leave', 'care', 'recovery', 'connection', 'play', 'other'].map((c) => (
              <option value={c}>{c}</option>
            ))}
          </select>
        </label>{' '}
      </details>
    </div>
  )
}
// eslint-disable-next-line complexity -- explicit independent optional measurements and lifecycle states must remain distinct
function Outcome({ row, state, send }: { row: AdhdRecord; state: AdhdState; send: Send }) {
  const generation = useRef(currentSessionGeneration()).current
  type OutcomeDraft = {
    actualUse: 'prepared_starter' | 'usual' | 'stopping_cue' | 'other' | 'none' | 'unrecorded'
    starter: string
    start: 'yes' | 'no' | 'unknown'
    five: 'yes' | 'no' | 'unknown'
    endpoint: 'yes' | 'partly' | 'no' | 'interrupted' | 'not_applicable' | 'unknown'
    interruption: 'none' | 'before_start' | 'after_start' | 'unknown'
    other: 'none' | 'rest' | 'connection' | 'play' | 'another_task' | 'unknown'
    strain: string
    overrun: string
    reuse: 'yes' | 'no' | 'unsure'
    times: { start: string; end: string }
  }
  const saved = useRef(loadPrivate<OutcomeDraft>(`outcome:${row.id}`, generation)).current
  const [actualUse, setActualUse] = useState<
      'prepared_starter' | 'usual' | 'stopping_cue' | 'other' | 'none' | 'unrecorded'
    >(saved?.actualUse ?? 'unrecorded'),
    [starter, setStarter] = useState(saved?.starter ?? ''),
    [start, setStart] = useState<'yes' | 'no' | 'unknown'>(saved?.start ?? 'unknown'),
    [five, setFive] = useState<'yes' | 'no' | 'unknown'>(saved?.five ?? 'unknown'),
    [endpoint, setEndpoint] = useState<
      'yes' | 'partly' | 'no' | 'interrupted' | 'not_applicable' | 'unknown'
    >(saved?.endpoint ?? 'unknown'),
    [interruption, setInterruption] = useState<'none' | 'before_start' | 'after_start' | 'unknown'>(
      saved?.interruption ?? 'none',
    ),
    [other, setOther] = useState<'none' | 'rest' | 'connection' | 'play' | 'another_task' | 'unknown'>(
      saved?.other ?? 'none',
    ),
    [strain, setStrain] = useState(saved?.strain ?? ''),
    [overrun, setOverrun] = useState(saved?.overrun ?? ''),
    [reuse, setReuse] = useState<'yes' | 'no' | 'unsure'>(saved?.reuse ?? 'unsure'),
    [times, setTimes] = useState(saved?.times ?? { start: '', end: '' })
  useEffect(() => {
    if (
      !row.data.outcome &&
      (start !== 'unknown' ||
        endpoint !== 'unknown' ||
        strain ||
        starter ||
        overrun ||
        times.start ||
        times.end ||
        actualUse !== 'unrecorded')
    ) {
      storePrivate(
        `outcome:${row.id}`,
        { actualUse, starter, start, five, endpoint, interruption, other, strain, overrun, reuse, times },
        generation,
      )
    }
  }, [actualUse, starter, start, five, endpoint, interruption, other, strain, overrun, reuse, times])
  const protocol = state.records.find((r) => r.id === row.parent_id)
  const outcome = row.data.outcome as Record<string, unknown> | undefined,
    ctx = row.data.context as AdhdContext
  const firstDisplay = useRef(new Date().toISOString()),
    exposing = useRef(false)
  useEffect(() => {
    if (
      row.data.condition !== 'self_chosen' &&
      protocol?.data.status === 'active' &&
      !state.settings.paused &&
      new Date(String(protocol.data.ends_at)) > new Date() &&
      !row.data.action_window_started_at &&
      !row.data.outcome &&
      !exposing.current
    ) {
      exposing.current = true
      void send({
        operation: 'expose',
        id: row.id,
        expected_revision: row.revision,
        displayed_at: firstDisplay.current,
        uncertainty: 'interface_acknowledged',
      }).finally(() => {
        exposing.current = false
      })
    }
  }, [row.id, row.revision, send])
  if (outcome) {
    return (
      <article>
        <h3>{ctx?.target || 'Chosen action'}</h3>
        <p>
          Saved outcome · start: {String(outcome.start)} · endpoint: {String(outcome.endpoint)}. Session end
          does not complete the task.
        </p>
        {outcome.started_at && outcome.ended_at && (
          <p>
            Self-reported elapsed:{' '}
            {Math.round(
              (new Date(String(outcome.ended_at)).getTime() -
                new Date(String(outcome.started_at)).getTime()) /
                60000,
            )}{' '}
            min; original estimate {String(row.data.estimated_minutes ?? 'Unrecorded')} min. Interruption:{' '}
            {String(outcome.interruption)}. This is elapsed session time, not verified work time.
          </p>
        )}
      </article>
    )
  }
  return (
    <article>
      <span class="adhd-eyebrow">YOUR CURRENT ACTION</span>
      <h3>{ctx?.target}</h3>
      <p>Chosen endpoint: {String(row.data.endpoint)}</p>
      {row.data.condition === 'self_chosen' ? (
        <p>Self-chosen support · {String(row.data.used)}</p>
      ) : (
        <>
          <p>
            <strong>
              {row.data.condition === 'intervention'
                ? protocol?.data.kind === 'stopping_cue'
                  ? 'Use your chosen finite endpoint and stopping cue.'
                  : 'Prepared starter: choose one visible substantive first action with a two-minute end.'
                : 'Usual acceptable approach: begin in your normal way. Both approaches are welcome.'}
            </strong>
          </p>
          {row.data.condition === 'intervention' && (
            <label>
              My concrete first action / stopping cue
              <input
                value={starter}
                onInput={(e) => setStarter(field(e))}
                placeholder={String(row.data.support_snapshot ?? 'One visible substantive action')}
              />
            </label>
          )}
          <p>
            Your approach stays the same after refresh.{' '}
            {row.data.action_window_started_at
              ? `First shown at ${new Date(String(row.data.action_window_started_at)).toLocaleTimeString()}. `
              : 'Confirming first display…'}
          </p>
          {!row.data.action_window_started_at && (
            <button
              onClick={() =>
                send({
                  operation: 'expose',
                  id: row.id,
                  expected_revision: row.revision,
                  displayed_at: firstDisplay.current,
                  uncertainty: 'delayed_or_uncertain',
                })
              }
            >
              I can see the condition — mark display now
            </button>
          )}
        </>
      )}
      <details>
        <summary>Accept, decline, or use another method</summary>
        <p>Declining a method and later starting may both be true.</p>
        <button
          onClick={() =>
            send({
              operation: 'method',
              id: row.id,
              expected_revision: row.revision,
              accepted: true,
              declined: false,
              used: actualUse,
              starter,
            })
          }
        >
          Accept assigned method
        </button>
        <button
          onClick={() =>
            send({
              operation: 'method',
              id: row.id,
              expected_revision: row.revision,
              accepted: false,
              declined: true,
              used: actualUse,
            })
          }
        >
          Decline assigned method
        </button>
        <label>
          Support actually used (separate from acceptance)
          <select value={actualUse} onChange={(e) => setActualUse(field(e) as typeof actualUse)}>
            {['unrecorded', 'none', 'prepared_starter', 'usual', 'stopping_cue', 'other'].map((v) => (
              <option value={v}>{v.replaceAll('_', ' ')}</option>
            ))}
          </select>
        </label>
        <button
          onClick={() =>
            send({
              operation: 'method',
              id: row.id,
              expected_revision: row.revision,
              accepted: typeof row.data.accepted === 'boolean' ? row.data.accepted : null,
              declined: Boolean(row.data.declined),
              used: actualUse,
              starter,
            })
          }
        >
          Record actual support use
        </button>
      </details>
      <details class="adhd-outcome-entry">
        <summary>Ready to reflect? Record what happened →</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send({
              operation: 'outcome',
              id: row.id,
              expected_revision: row.revision,
              start,
              within_five_minutes: row.data.action_window_started_at ? five : 'unknown',
              latency:
                start === 'yes' && five === 'yes'
                  ? '1_to_5_min'
                  : start === 'yes' && five === 'no'
                    ? 'over_5_min'
                    : 'unknown',
              endpoint,
              interruption,
              other_action: other,
              ...(strain ? { strain: Number(strain) } : {}),
              ...(overrun ? { overrun_minutes: Number(overrun) } : {}),
              ...(protocol?.data.kind === 'stopping_cue' ? { reuse } : {}),
              ...(times.start ? { started_at: new Date(times.start).toISOString() } : {}),
              ...(times.end ? { ended_at: new Date(times.end).toISOString() } : {}),
              time_precision: times.start || times.end ? 'minute' : 'unknown',
            }).then((ok) => {
              if (ok) removePrivate(`outcome:${row.id}`, generation)
            })
          }}
        >
          <label>
            Did the predefined substantive action actually start?
            <select
              value={start === 'yes' ? `yes_${five}` : start}
              onChange={(e) => {
                const value = field(e)
                setStart(value.startsWith('yes_') ? 'yes' : (value as typeof start))
                setFive(value === 'yes_yes' ? 'yes' : value === 'yes_no' || value === 'no' ? 'no' : 'unknown')
              }}
            >
              <option value="unknown">Unrecorded / unknown</option>
              {row.data.action_window_started_at && (
                <>
                  <option value="yes_yes">Yes, within five minutes of first displayed condition</option>
                  <option value="yes_no">Yes, later than five minutes</option>
                </>
              )}
              <option value="yes_unknown">Yes, timing unknown</option>
              <option value="no">No</option>
            </select>
          </label>
          <label>
            Chosen endpoint reached?
            <select value={endpoint} onChange={(e) => setEndpoint(field(e) as typeof endpoint)}>
              {['unknown', 'yes', 'partly', 'no', 'interrupted', 'not_applicable'].map((v) => (
                <option value={v}>{v.replace('_', ' ')}</option>
              ))}
            </select>
          </label>
          {protocol?.data.strain_guardrail && (
            <label>
              Internal pressure or tension now (optional)
              <select value={strain} onChange={(e) => setStrain(field(e))}>
                <option value="">Skip / Unrecorded</option>
                {['None', 'Mild', 'Moderate', 'High', 'Overwhelming'].map((a, i) => (
                  <option value={i + 1}>
                    {i + 1} {a}
                  </option>
                ))}
              </select>
            </label>
          )}
          <details>
            <summary>Optional interruption, action and timing details</summary>
            <label>
              Interruption
              <select value={interruption} onChange={(e) => setInterruption(field(e) as typeof interruption)}>
                {['none', 'before_start', 'after_start', 'unknown'].map((v) => (
                  <option value={v}>{v.replaceAll('_', ' ')}</option>
                ))}
              </select>
            </label>
            <label>
              Chose another action
              <select value={other} onChange={(e) => setOther(field(e) as typeof other)}>
                {['none', 'rest', 'connection', 'play', 'another_task', 'unknown'].map((v) => (
                  <option value={v}>{v.replaceAll('_', ' ')}</option>
                ))}
              </select>
            </label>
            <label>
              Actual start (self-report, browser local timezone, optional)
              <input
                type="datetime-local"
                value={times.start}
                onInput={(e) => setTimes({ ...times, start: field(e) })}
              />
            </label>
            <label>
              Actual end (self-report, browser local timezone, optional)
              <input
                type="datetime-local"
                value={times.end}
                onInput={(e) => setTimes({ ...times, end: field(e) })}
              />
            </label>
            {row.data.estimated_minutes != null && (
              <p>
                Estimate: {String(row.data.estimated_minutes)} minutes. Confirm actual times to compare;
                app-open time is not work.
              </p>
            )}
            {protocol?.data.kind === 'stopping_cue' && (
              <label>
                Would you choose this stopping method again?
                <select value={reuse} onChange={(e) => setReuse(field(e) as typeof reuse)}>
                  <option value="unsure">Unsure</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
            )}
            <label>
              Minutes beyond chosen stop endpoint
              <input type="number" min="0" max="1440" value={overrun} onInput={(e) => setOverrun(field(e))} />
            </label>
          </details>
          <button type="submit">Save outcome and finish</button>
        </form>
      </details>
      <p>Rest, an honest no, or stopping on time are useful observations.</p>
    </article>
  )
}
function Now({ state, send, generation }: { state: AdhdState; send: Send; generation: number }) {
  const activeInvite = state.records.find(
    (r) => r.kind === 'invitation' && r.data.status === 'opened' && new Date(String(r.data.end)) > new Date(),
  )
  const saved = useRef(
    loadPrivate<{ context: AdhdContext; pack: AdhdObservationInput['pack']; values: Record<string, number> }>(
      'check',
      generation,
    ),
  ).current
  const [context, setContext] = useState(saved?.context ?? emptyContext),
    [pack, setPack] = useState<AdhdObservationInput['pack']>(saved?.pack ?? 'core'),
    [values, setValues] = useState<Record<string, number>>(saved?.values ?? {}),
    [barrier, setBarrier] = useState('cannot start'),
    [showCheck, setShowCheck] = useState(!!activeInvite),
    [chosen, setChosen] = useState(''),
    [endpoint, setEndpoint] = useState(''),
    [estimate, setEstimate] = useState(''),
    [sampling, setSampling] = useState<AdhdObservationInput['sampling']>('self_initiated'),
    [scope, setScope] = useState<AdhdObservationInput['scope']>('current'),
    [observed, setObserved] = useState(''),
    [tags, setTags] = useState(''),
    [precision, setPrecision] = useState<AdhdObservationInput['precision']>('minute')
  useEffect(() => {
    if (showCheck || saved) storePrivate('check', { context, pack, values }, generation)
  }, [context, pack, values, showCheck])
  const recent = [...new Set(state.observations.map((o) => o.context.target).filter(Boolean))].slice(0, 12),
    cards = state.strategies.filter((s) => supportIds(barrier).includes(s.id))
  return (
    <>
      {resumableAttempts(state)
        .slice(0, 1)
        .map((row) => (
          <Outcome key={row.id} row={row} state={state} send={send} />
        ))}
      <section class="adhd-hero">
        <div class="adhd-eyebrow">
          <span class="adhd-spark" aria-hidden="true">
            ✦
          </span>{' '}
          A LITTLE LESS FRICTION
        </div>
        <h2>
          What would help
          <br />
          right now?
        </h2>
        <p class="adhd-lead">Pick what’s getting in the way. One small action is enough.</p>
        {!chosen ? (
          <>
            <div class="adhd-chips" role="group" aria-label="What is getting in the way?">
              {[
                ['cannot choose', '◇', 'Too many choices'],
                ['cannot start', '↗', 'Hard to start'],
                ['foggy/tired', '☁', 'Low energy'],
                ['pressured', '≋', 'Too much pressure'],
                ['distracted', '◎', 'Pulled away'],
                ['cannot stop', 'Ⅱ', 'Hard to stop'],
                ['need recovery', '☾', 'Need a break'],
              ].map(([value, icon, label]) => (
                <button aria-pressed={barrier === value} onClick={() => setBarrier(value)}>
                  <span aria-hidden="true">{icon}</span>
                  {label}
                </button>
              ))}
            </div>
            <div class="adhd-options">
              {cards.slice(0, 2).map((support, n) => (
                <article class={`adhd-support adhd-support-${n}`}>
                  <span class="adhd-card-icon" aria-hidden="true">
                    {n === 0 ? '↗' : '◇'}
                  </span>
                  <h3>{support.title}</h3>
                  <p>{support.steps[0]}</p>
                  <button class="adhd-primary" onClick={() => setChosen(support.id)}>
                    Try this →
                  </button>
                  <details>
                    <summary>Why it might help</summary>
                    <p>{support.benefit}</p>
                    <p>{support.cost}</p>
                    <p>{support.evidence}</p>
                  </details>
                </article>
              ))}
            </div>
            <p class="adhd-hint">Rest or leaving this for later is a valid choice.</p>
          </>
        ) : (
          <div class="adhd-current-action" role="status">
            <span class="adhd-eyebrow">YOUR NEXT SMALL STEP</span>
            <h3>{state.strategies.find((support) => support.id === chosen)?.title}</h3>
            <ol>
              {state.strategies
                .find((support) => support.id === chosen)
                ?.steps.map((step) => (
                  <li>{step}</li>
                ))}
            </ol>
            <div class="adhd-flow-actions">
              <button class="adhd-primary" onClick={() => setChosen('')}>
                Done for now ✓
              </button>
              <button class="adhd-text" onClick={() => setChosen('')}>
                Choose something else
              </button>
            </div>
            <details>
              <summary>Save this session</summary>
              <Context value={context} onChange={setContext} recent={recent} />
              <label>
                Small endpoint
                <input
                  value={endpoint}
                  onInput={(e) => setEndpoint(field(e))}
                  placeholder="Write one useful sentence"
                />
              </label>
              <label>
                Optional estimate (minutes)
                <input
                  type="number"
                  min="1"
                  max="240"
                  value={estimate}
                  onInput={(e) => setEstimate(field(e))}
                />
              </label>
              <button
                disabled={!context.target || !endpoint || state.settings.paused}
                onClick={() =>
                  send({
                    operation: 'session',
                    context,
                    endpoint,
                    strategy_id: chosen,
                    ...(estimate ? { estimated_minutes: Number(estimate) } : {}),
                  })
                }
              >
                Save action
              </button>
            </details>
          </div>
        )}
      </section>
      <section>
        <div class="adhd-panel-heading">
          <span class="adhd-card-icon" aria-hidden="true">
            ◈
          </span>
          <div>
            <h2>How’s this moment?</h2>
            <p>A short check, only if useful.</p>
          </div>
        </div>
        <button onClick={() => setShowCheck(!showCheck)}>
          {showCheck ? 'Close check' : 'Take a quick check →'}
        </button>
        {showCheck && (
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              const ok = await send({
                operation: 'observe',
                observation: {
                  observed_at: observed ? new Date(observed).toISOString() : new Date().toISOString(),
                  timezone: state.settings.timezone,
                  precision,
                  scope,
                  sampling: activeInvite ? 'scheduled' : sampling,
                  ...(activeInvite ? { invitation_id: activeInvite.id } : {}),
                  pack,
                  context,
                  expected_instrument_version: 'adhd_custom_v1',
                  items: Object.fromEntries(
                    Object.entries(values)
                      .filter(([id]) => itemIds(pack).includes(id) && applicable(id, context))
                      .map(([id, value]) => [id, { status: 'answered', value }]),
                  ),
                  user_tags: tags
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean),
                },
              })
              if (ok) {
                setValues({})
                removePrivate('check', generation)
                setShowCheck(false)
              }
            }}
          >
            <details open={!context.target}>
              <summary>
                {context.target || 'Choose a task, or just check in'} · {pack.replaceAll('_', ' ')}
              </summary>
              <Context value={context} onChange={setContext} recent={recent} />
              <label>
                Check size
                <select
                  value={pack}
                  onChange={(e) => {
                    setPack(field(e) as typeof pack)
                    setValues({})
                  }}
                >
                  <option value="tiny_state">Tiny · energy and clarity</option>
                  <option value="tiny_task">Tiny · target interest and start ease</option>
                  <option value="core">Core · four items with a target</option>
                  <option value="full">Full · six items</option>
                  <option value="focused">Optional deeper check · 1–3 minutes, choose relevant items</option>
                </select>
              </label>
            </details>
            <Questions
              items={state.items}
              pack={pack}
              context={context}
              values={values}
              onChange={setValues}
            />
            <details>
              <summary>Observation time, tags and sampling</summary>
              <label>
                Optional chosen descriptions (comma separated)
                <input
                  value={tags}
                  onInput={(e) => setTags(field(e))}
                  placeholder="Your own words; no algorithmic assignment"
                />
              </label>
              <label>
                Timestamp precision
                <select value={precision} onChange={(e) => setPrecision(field(e) as typeof precision)}>
                  {['minute', 'hour', 'date', 'uncertain'].map((v) => (
                    <option value={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                Scope
                <select value={scope} onChange={(e) => setScope(field(e) as typeof scope)}>
                  <option value="current">Current moment</option>
                  <option value="day">Day appraisal</option>
                  <option value="retrospective">Retrospective reflection</option>
                </select>
              </label>
              <label>
                Source
                <select value={sampling} onChange={(e) => setSampling(field(e) as typeof sampling)}>
                  <option value="self_initiated">Self-initiated</option>
                  <option value="help_request">Help request</option>
                  <option value="retrospective">Retrospective</option>
                </select>
              </label>
              <label>
                Assessed time (browser local timezone; leave empty for now)
                <input type="datetime-local" value={observed} onInput={(e) => setObserved(field(e))} />
              </label>
            </details>
            <p>You can leave questions unanswered. Your draft is saved automatically.</p>
            <button type="submit">Save check-in</button>
          </form>
        )}
      </section>
    </>
  )
}
// eslint-disable-next-line complexity -- explicit independent optional measurements and lifecycle states must remain distinct
function Experiments({ state, send }: { state: AdhdState; send: Send }) {
  const generation = useRef(currentSessionGeneration()).current
  const saved = useRef(
    loadPrivate<{
      context: AdhdContext
      endpoint: string
      eligible: { ten: boolean; safe: boolean; either: boolean }
      values: Record<string, number>
      baseline: boolean
    }>('opportunity', generation),
  ).current
  const [kind, setKind] = useState<'prepared_starter' | 'stopping_cue'>('prepared_starter'),
    [taskClass, setTaskClass] = useState('brief writing'),
    [days, setDays] = useState<7 | 14>(7),
    [start, setStart] = useState('09:00'),
    [end, setEnd] = useState('20:00'),
    [threshold, setThreshold] = useState(2),
    [guardrail, setGuardrail] = useState(true),
    [consent, setConsent] = useState(false),
    [context, setContext] = useState<AdhdContext>(saved?.context ?? { ...emptyContext, phase: 'pre_start' }),
    [endpoint, setEndpoint] = useState(saved?.endpoint ?? ''),
    [eligible, setEligible] = useState(saved?.eligible ?? { ten: false, safe: false, either: false }),
    [values, setValues] = useState<Record<string, number>>(saved?.values ?? {}),
    [baseline, setBaseline] = useState(saved?.baseline ?? true)
  const protocols = state.records.filter((r) => r.kind === 'protocol'),
    active = protocols.find(
      (r) => r.data.status === 'active' && new Date(String(r.data.ends_at)) > new Date(),
    ),
    due = protocols.find((r) => r.data.status === 'active' && new Date(String(r.data.ends_at)) <= new Date())
  useEffect(() => {
    if (
      context.target ||
      endpoint ||
      eligible.ten ||
      eligible.safe ||
      eligible.either ||
      Object.keys(values).length
    ) {
      storePrivate('opportunity', { context, endpoint, eligible, values, baseline }, generation)
    }
  }, [context, endpoint, eligible, values, baseline])
  const clock = active
    ? new Intl.DateTimeFormat('en-GB', {
        timeZone: String(active.data.timezone),
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(new Date())
    : ''
  const today = active
    ? new Intl.DateTimeFormat('en-CA', {
        timeZone: String(active.data.timezone),
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date())
    : ''
  const assignedToday = state.records.some(
    (r) =>
      r.kind === 'opportunity' &&
      r.parent_id === active?.id &&
      r.data.local_date === today &&
      r.data.condition,
  )
  const awakeStart = String(active?.data.awake_start ?? ''),
    awakeEnd = String(active?.data.awake_end ?? '')
  const inWindow =
    awakeStart < awakeEnd
      ? clock >= awakeStart && clock < awakeEnd
      : awakeStart > awakeEnd && (clock >= awakeStart || clock < awakeEnd)
  return (
    <>
      <div class="adhd-view-intro">
        <span class="adhd-eyebrow">ONE SMALL COMPARISON</span>
        <h2>Find what helps you.</h2>
        <p>Try two acceptable approaches. Keep what’s useful.</p>
      </div>
      <ol class="adhd-steps" aria-label="Experiment steps">
        {['Set up', 'Opportunity', 'Try it', 'Reflect', 'Review'].map((label, n) => (
          <li class={n === (active ? (assignedToday ? 2 : 1) : 0) ? 'current' : ''}>
            <span>{n + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      {resumableAttempts(state).map((row) => (
        <Outcome key={row.id} row={row} state={state} send={send} />
      ))}
      <section>
        <h2>{active ? 'Your experiment' : 'Make a small plan'}</h2>
        <p>Start with seven days. Reminders are optional; an unclear result is still an honest result.</p>
        {active ? (
          <>
            <h3>{active.data.kind === 'stopping_cue' ? 'Stopping cue' : 'Prepared starter'} pilot</h3>
            <p>
              {String(active.data.task_class)} · {String(active.data.awake_start)}–
              {String(active.data.awake_end)} · {String(active.data.timezone)}
            </p>
            <p>
              Review {new Date(String(active.data.review_at)).toLocaleDateString()}. Worthwhile for you:{' '}
              {String(active.data.benefit_threshold)}{' '}
              {active.data.kind === 'stopping_cue' ? 'fewer minutes overrun' : 'more starts per 10 chances'}.
            </p>
            <button
              onClick={() =>
                send({
                  operation: 'protocol_status',
                  id: active.id,
                  expected_revision: active.revision,
                  status: 'paused',
                })
              }
            >
              Pause experiment
            </button>
            <button
              onClick={() =>
                send({
                  operation: 'protocol_status',
                  id: active.id,
                  expected_revision: active.revision,
                  status: 'withdrawn',
                })
              }
            >
              Stop experiment
            </button>
            <p role="status">
              {inWindow
                ? 'Within your chosen awake window.'
                : 'Outside your frozen awake window right now. Keep your draft or return in the chosen window; no assignment will be made.'}
            </p>
            {assignedToday && <p>Your approach for today is set.</p>}
            {!assignedToday && (
              <details open={!!saved}>
                <summary>Ready for one small task? →</summary>
                <Context
                  value={{ ...context, task_class: String(active.data.task_class) }}
                  onChange={setContext}
                  recent={[]}
                />
                <label>
                  Chosen small endpoint
                  <input value={endpoint} onInput={(e) => setEndpoint(field(e))} />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={eligible.ten}
                    onChange={(e) => setEligible({ ...eligible, ten: e.currentTarget.checked })}
                  />
                  Roughly ten minutes available
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={eligible.safe}
                    onChange={(e) => setEligible({ ...eligible, safe: e.currentTarget.checked })}
                  />
                  Safe and interruptible
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={eligible.either}
                    onChange={(e) => setEligible({ ...eligible, either: e.currentTarget.checked })}
                  />
                  Either approach is acceptable
                </label>
                <p>You don’t need to feel ready. You do need a safe, available opportunity.</p>
                <label>
                  <input
                    type="checkbox"
                    checked={baseline}
                    onChange={(e) => setBaseline(e.currentTarget.checked)}
                  />
                  Add a brief check before trying (you can skip questions)
                </label>
                {baseline && (
                  <Questions
                    items={state.items}
                    pack={active.data.strain_guardrail ? 'core_strain' : 'core'}
                    context={{ ...context, task_class: String(active.data.task_class) }}
                    values={values}
                    onChange={setValues}
                  />
                )}
                <button
                  disabled={
                    !inWindow ||
                    !context.target ||
                    !endpoint ||
                    !eligible.ten ||
                    !eligible.safe ||
                    !eligible.either ||
                    state.settings.paused
                  }
                  onClick={() => {
                    const ctx = { ...context, task_class: String(active.data.task_class) }
                    void send({
                      operation: 'opportunity',
                      protocol_id: active.id,
                      expected_protocol_revision: active.revision,
                      context: ctx,
                      endpoint,
                      ten_minutes: eligible.ten,
                      safe_interruptible: eligible.safe,
                      either_acceptable: eligible.either,
                      availability: 'eligible',
                      ...(baseline
                        ? {
                            baseline: {
                              observed_at: new Date().toISOString(),
                              timezone: String(active.data.timezone),
                              precision: 'minute',
                              scope: 'current',
                              sampling: 'experiment_baseline',
                              pack: active.data.strain_guardrail ? 'core_strain' : 'core',
                              context: ctx,
                              expected_instrument_version: 'adhd_custom_v1',
                              items: Object.fromEntries(
                                Object.entries(values)
                                  .filter(([id]) => applicable(id, ctx))
                                  .map(([id, value]) => [id, { status: 'answered', value }]),
                              ),
                              user_tags: [],
                            },
                          }
                        : {}),
                    }).then((ok) => {
                      if (ok) {
                        removePrivate('opportunity', generation)
                        setContext({ ...emptyContext, phase: 'pre_start' })
                        setEndpoint('')
                        setEligible({ ten: false, safe: false, either: false })
                        setValues({})
                      }
                    })
                  }}
                >
                  Choose approach for today →
                </button>

                <button
                  onClick={() =>
                    send({
                      operation: 'opportunity',
                      protocol_id: active.id,
                      expected_protocol_revision: active.revision,
                      context,
                      endpoint: endpoint || 'No suitable endpoint',
                      ten_minutes: false,
                      safe_interruptible: false,
                      either_acceptable: false,
                      availability: 'unavailable',
                    })
                  }
                >
                  No suitable opportunity
                </button>
                <button
                  onClick={() =>
                    send({
                      operation: 'opportunity',
                      protocol_id: active.id,
                      expected_protocol_revision: active.revision,
                      context,
                      endpoint: endpoint || 'Declined opportunity',
                      ten_minutes: eligible.ten,
                      safe_interruptible: eligible.safe,
                      either_acceptable: eligible.either,
                      availability: 'declined',
                    })
                  }
                >
                  Decline this opportunity
                </button>
              </details>
            )}
          </>
        ) : (
          <>
            <p>
              {due
                ? 'Your pilot is due for review. Keep its history and close/review it before creating a new version.'
                : 'No active pilot. Help now remains available.'}
            </p>
            {due && (
              <button
                onClick={() =>
                  send({
                    operation: 'protocol_status',
                    id: due.id,
                    expected_revision: due.revision,
                    status: 'completed',
                  })
                }
              >
                Close pilot for review
              </button>
            )}
            <details>
              <summary>Set up an experiment →</summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void send({
                    operation: 'protocol',
                    protocol: {
                      kind,
                      task_class: taskClass,
                      timezone: state.settings.timezone,
                      days,
                      awake_start: start,
                      awake_end: end,
                      benefit_threshold: threshold,
                      strain_guardrail: guardrail,
                      acceptable_conditions: true,
                      burden_seconds: 60,
                    },
                  })
                }}
              >
                <label>
                  Comparison
                  <select value={kind} onChange={(e) => setKind(field(e) as typeof kind)}>
                    <option value="prepared_starter">Prepared starter vs usual start</option>
                    <option value="stopping_cue">Stopping cue vs ordinary self-management</option>
                  </select>
                </label>
                <label>
                  What kind of task?
                  <input required value={taskClass} onInput={(e) => setTaskClass(field(e))} />
                </label>
                <label>
                  Try for
                  <select value={days} onChange={(e) => setDays(Number(field(e)) as 7 | 14)}>
                    <option value="7">Seven days</option>
                    <option value="14">Fourteen days</option>
                  </select>
                </label>
                <label>
                  Times that work for you · from
                  <input type="time" required value={start} onInput={(e) => setStart(field(e))} />
                </label>
                <label>
                  Ends
                  <input type="time" required value={end} onInput={(e) => setEnd(field(e))} />
                </label>
                <label>
                  Worthwhile improvement:{' '}
                  {kind === 'stopping_cue' ? 'fewer minutes overrun' : 'more starts per 10 chances'}
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={threshold}
                    onInput={(e) => setThreshold(Number(field(e)))}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={guardrail}
                    onChange={(e) => setGuardrail(e.currentTarget.checked)}
                  />
                  Also check tension before and after
                </label>
                <details>
                  <summary>How this comparison works</summary>
                  <p>
                    Try one suitable task per day. Your approach is chosen in random balanced pairs and stays
                    the same after refresh. Choose the task before seeing the approach. Reading and setup
                    count in the same five-minute start window for either approach.
                  </p>
                  <p>Use safe everyday tasks. This is not a medication or sleep-deprivation experiment.</p>
                </details>
                <label>
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.currentTarget.checked)}
                  />
                  Both approaches work for me. I can pause or stop at any time.
                </label>
                <button type="submit" disabled={!consent || !!due || state.settings.paused}>
                  Start this experiment
                </button>
              </form>
            </details>
          </>
        )}
      </section>
      {!!protocols.length && (
        <details class="adhd-review-details">
          <summary>Review results & experiment history</summary>
          {protocols.map((p) => (
            <Result key={p.id} protocol={p} state={state} send={send} />
          ))}
        </details>
      )}
    </>
  )
}
function Result({ protocol, state, send: _send }: { protocol: AdhdRecord; state: AdhdState; send: Send }) {
  const records = state.records.filter((r) => r.parent_id === protocol.id && r.kind === 'opportunity'),
    summary = arms(records)
  const strains = records
      .filter((r) => r.kind === 'opportunity')
      .map((r) => {
        const pre = state.observations.find((o) => o.id === r.data.pre_observation_id),
          post = state.observations.find((o) => o.id === r.data.post_observation_id)
        return typeof pre?.answers.strain_now_v1 === 'number' &&
          typeof post?.answers.strain_now_v1 === 'number'
          ? post.answers.strain_now_v1 - pre.answers.strain_now_v1
          : null
      }),
    known = strains.filter((v) => v !== null)
  return (
    <section>
      <h3>
        {protocol.data.kind === 'stopping_cue' ? 'Stopping cue' : 'Prepared starter'} ·{' '}
        {String(protocol.data.status)}
      </h3>
      <div class="adhd-scroll">
        <table>
          <caption>Assigned-condition ledger; each fraction shows its actual denominator</caption>
          <thead>
            <tr>
              <th>Arm</th>
              <th>Assigned / days</th>
              <th>Exposed</th>
              <th>Actual support used</th>
              <th>Declined</th>
              <th>Within-five-minute starts / known</th>
              <th>Unrecorded</th>
              <th>Interrupted</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((a) => (
              <tr>
                <th>{a.condition === 'intervention' ? 'Chosen support' : 'Usual'}</th>
                <td>
                  {a.assigned} / {a.days}
                </td>
                <td>{a.exposed}</td>
                <td>{a.used}</td>
                <td>{a.declined}</td>
                <td>
                  {a.starts} / {a.known}
                </td>
                <td>{a.missing}</td>
                <td>{a.interrupted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Rates among known outcomes are selected complete cases, not intention-to-treat. Missing outcomes are
        not failures. Assigned but unexposed conditions have no timed failure. Actual support used counts any
        explicitly reported support, including another method, and does not imply use of the assigned method.
        Actual-use comparisons are more confounded; overrides remain in the ledger.
      </p>
      {protocol.data.kind === 'stopping_cue' && (
        <p>
          Overrun reports:{' '}
          {records
            .filter(
              (r) => (r.data.outcome as Record<string, unknown> | undefined)?.overrun_minutes !== undefined,
            )
            .map(
              (r) =>
                `${r.data.condition}: ${(r.data.outcome as Record<string, unknown>).overrun_minutes} min`,
            )
            .join('; ') || 'Unrecorded'}
          . Progress, strain and stopping tradeoffs matter alongside time.
        </p>
      )}
      <p>
        {known.length
          ? `Strain changes measured in ${known.length}/${strains.length} attempts: ${known.join(', ')} on the same 1–5 item. These are descriptive, not a passed guardrail.`
          : 'Strain tradeoff not assessed.'}
      </p>
      <p>
        Effectiveness remains inconclusive without comparable opportunities, acceptable tradeoffs and
        sufficient coverage. Review feasibility now; there is no automatic extension or favorable-result
        requirement.
      </p>
      <details>
        <summary>Individual opportunity records</summary>
        {records.map((r) => (
          <article>
            <p>
              {new Date(String(r.data.assigned_at ?? r.created_at)).toLocaleString()} ·{' '}
              {String((r.data.context as AdhdContext)?.target ?? '')} ·{' '}
              {r.data.deleted_content
                ? 'Content deleted; structural assignment retained'
                : String(r.data.availability)}{' '}
              · {String(r.data.condition ?? 'unassigned')}
            </p>
            <p>
              Endpoint: {String(r.data.endpoint ?? 'Unrecorded')} · actual start:{' '}
              {String((r.data.outcome as Record<string, unknown> | undefined)?.start ?? 'Unrecorded')}
            </p>
          </article>
        ))}
      </details>
    </section>
  )
}
function HypothesisEditor({
  initial,
  row,
  send,
}: {
  initial: AdhdHypothesisInput
  row?: AdhdRecord
  send: Send
}) {
  const [draft, setDraft] = useState(initial),
    [source, setSource] = useState<'observation' | 'opportunity' | 'legacy_assessment' | 'journal'>(
      'observation',
    ),
    [evidence, setEvidence] = useState('')
  return (
    <details>
      <summary>
        {draft.statement} · {draft.status}
      </summary>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send({
            operation: 'hypothesis',
            ...(row ? { id: row.id, expected_revision: row.revision } : {}),
            hypothesis: {
              ...draft,
              evidence: evidence ? [...draft.evidence, { source, id: evidence }] : draft.evidence,
            },
          })
        }}
      >
        {(
          [
            'statement',
            'prediction',
            'alternatives',
            'weakening_evidence',
            'eligible_context',
            'next_test',
          ] as const
        ).map((key) => (
          <label>
            {key.replaceAll('_', ' ')}
            <textarea required value={draft[key]} onInput={(e) => setDraft({ ...draft, [key]: field(e) })} />
          </label>
        ))}
        <label>
          Claim
          <select
            value={draft.claim}
            onChange={(e) => setDraft({ ...draft, claim: field(e) as typeof draft.claim })}
          >
            <option value="descriptive">Descriptive pattern</option>
            <option value="causal">Causal/intervention hypothesis</option>
          </select>
        </label>
        <label>
          Required stable measure IDs (comma separated)
          <input
            value={draft.required_measures.join(', ')}
            onInput={(e) =>
              setDraft({
                ...draft,
                required_measures: field(e)
                  .split(',')
                  .map((v) => v.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
        <p>
          Required measures: {draft.required_measures.join(', ')}. Pattern, explanation and intervention
          evidence remain separate.
        </p>
        <label>
          Status
          <select
            value={draft.status}
            onChange={(e) => setDraft({ ...draft, status: field(e) as typeof draft.status })}
          >
            {[
              'Untested',
              'Observing',
              'Testing',
              'Inconclusive',
              'Tentative support',
              'Mixed',
              'Weakened',
            ].map((s) => (
              <option value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Optional supporting record
          <select value={source} onChange={(e) => setSource(field(e) as typeof source)}>
            {['observation', 'opportunity', 'legacy_assessment', 'journal'].map((s) => (
              <option value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Evidence record ID
          <input
            value={evidence}
            onInput={(e) => setEvidence(field(e))}
            placeholder="Record ID from this account"
          />
        </label>
        <p>{draft.evidence.length} saved evidence references. A label is not independent corroboration.</p>
        <button type="submit">{row ? 'Save new hypothesis version' : 'Save idea'}</button>
      </form>
    </details>
  )
}
function Patterns({ state, send }: { state: AdhdState; send: Send }) {
  const [context, setContext] = useState('all'),
    [source, setSource] = useState('all'),
    [measure, setMeasure] = useState('clarity_now_v1'),
    [taskClass, setTaskClass] = useState('all')
  const obs = state.observations.filter(
      (o) =>
        (context === 'all' || o.context.context === context) &&
        (source === 'all' || o.sampling === source) &&
        (taskClass === 'all' || o.context.task_class === taskClass),
    ),
    bins = coverage(obs, state.settings.timezone)
  const pairs = obs.filter(
      (o) =>
        typeof o.answers.target_interest_v1 === 'number' &&
        typeof o.answers.target_start_ease_v1 === 'number' &&
        o.context.phase === 'pre_start' &&
        o.context.target,
    ),
    pleasant = obs.filter(
      (o) => typeof o.answers.energy_now_v1 === 'number' && typeof o.answers.pleasantness_now_v1 === 'number',
    )
  const sampledDays = new Set(
    obs.map((o) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: state.settings.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(o.observed_at)),
    ),
  ).size
  const plot = (rows: typeof obs, x: string, y: string, label: string) => (
    <figure>
      <figcaption>{label}</figcaption>
      {rows.length ? (
        <svg viewBox="0 0 340 250" role="img" aria-label={`${label}. Data table follows.`}>
          <path d="M40 10V210H320" fill="none" stroke="currentColor" />
          {[1, 2, 3, 4, 5].map((v) => (
            <>
              <text x={40 + (v - 1) * 65} y="232">
                {v}
              </text>
              <text x="15" y={210 - (v - 1) * 45}>
                {v}
              </text>
            </>
          ))}
          {rows.map((o) => (
            <circle
              cx={40 + (Number(o.answers[x]) - 1) * 65}
              cy={210 - (Number(o.answers[y]) - 1) * 45}
              r="5"
              fill="currentColor"
            >
              <title>
                {o.context.target || 'No task'} · {o.observed_at} · {o.answers[x]}, {o.answers[y]}
              </title>
            </circle>
          ))}
        </svg>
      ) : (
        <p class="adhd-hint">No paired answers yet. A check with both questions will appear here.</p>
      )}
      <details>
        <summary>See individual records</summary>
        <div class="adhd-scroll">
          <table>
            <caption>{label} individual records; no synthetic score</caption>
            <thead>
              <tr>
                <th>Time / target</th>
                <th>{state.items.find((i) => i.id === x)?.construct} (1–5)</th>
                <th>{state.items.find((i) => i.id === y)?.construct} (1–5)</th>
                <th>Actual start</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const attempt = state.records.find((r) => r.data.pre_observation_id === o.id)
                return (
                  <tr>
                    <td>
                      {displayObservationTime(o, state.settings.timezone)} · {o.context.target || 'No task'}
                    </td>
                    <td>{String(o.answers[x])}</td>
                    <td>{String(o.answers[y])}</td>
                    <td>
                      {String(
                        (attempt?.data.outcome as Record<string, unknown> | undefined)?.start ?? 'Unrecorded',
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
  return (
    <>
      <section>
        <span class="adhd-eyebrow">NOTICE, DON’T GRADE</span>
        <h2>A few things to explore.</h2>
        <a href="/data?hide=activity,location,media,meal,report,screentime&data_filter=adhd_">
          See answers in Data →
        </a>
        <p>
          {obs.length
            ? 'These are snapshots, not a verdict on your day.'
            : 'Your first check will appear here. There’s no history to catch up on.'}
        </p>
        <label>
          Context
          <select value={context} onChange={(e) => setContext(field(e))}>
            {['all', 'work', 'leave', 'care', 'recovery', 'connection', 'play', 'other'].map((v) => (
              <option value={v}>{v}</option>
            ))}
          </select>
        </label>
        <details>
          <summary>More filters</summary>
          <label>
            Sampling source
            <select value={source} onChange={(e) => setSource(field(e))}>
              {[
                'all',
                'self_initiated',
                'help_request',
                'experiment_baseline',
                'experiment_outcome',
                'scheduled',
                'retrospective',
                'imported',
              ].map((v) => (
                <option value={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Task class
            <select value={taskClass} onChange={(e) => setTaskClass(field(e))}>
              <option value="all">All sampled classes</option>
              {[...new Set(state.observations.map((o) => o.context.task_class).filter(Boolean))].map(
                (value) => (
                  <option value={value}>{value}</option>
                ),
              )}
            </select>
          </label>
        </details>
        <p class="adhd-hint">
          {obs.length} check-in{obs.length === 1 ? '' : 's'} · {sampledDays} sampled day
          {sampledDays === 1 ? '' : 's'}
        </p>
        <h3>When did you check in?</h3>
        <div class="adhd-coverage-bars">
          {bins.map((bin) => (
            <div>
              <span>{bin.label}</span>
              <meter min="0" max={Math.max(1, ...bins.map((b) => b.n))} value={bin.n} />
              <b>{bin.n}</b>
              <small>{bin.days} days</small>
            </div>
          ))}
        </div>
        <details>
          <summary>Coverage table & interpretation</summary>
          <p>
            Help requests overrepresent friction; these snapshots do not measure time spent in a state. Hours
            since confirmed main sleep remain unknown; a recent ended sleep could be a nap.
          </p>
          <p>
            Display zone: {state.settings.timezone}. Current, minute-precision observations only. Original
            UTC/timezone remain in each record. No hourly productivity or permanent best-hour claim.
          </p>
          <table>
            <thead>
              <tr>
                <th>Local window</th>
                <th>Observations</th>
                <th>Distinct days</th>
                <th>Clarity samples</th>
                <th>Clarity median (1–5)</th>
              </tr>
            </thead>
            <tbody>
              {bins.map((b) => (
                <tr>
                  <th>{b.label}</th>
                  <td>{b.n}</td>
                  <td>{b.days}</td>
                  <td>{b.values.length}</td>
                  <td>{b.median ?? 'Unrecorded'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <details>
            <summary>Hour/day sampling coverage</summary>
            <div class="adhd-scroll">
              <table>
                <caption>
                  Compatible current observations per local day and broad hour bin · {state.settings.timezone}
                </caption>
                <thead>
                  <tr>
                    <th>Day</th>
                    {bins.map((bin) => (
                      <th>{bin.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {coverageGrid(obs, state.settings.timezone).map((day) => (
                    <tr>
                      <th>{day.date}</th>
                      {day.counts.map((n) => (
                        <td>{n || 'Unrecorded'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <p>
            Unequal coverage or task/context differences can create an apparent time pattern. The next useful
            observation is the same item in a comparable, acceptable undersampled window; no fixed count
            guarantees an answer.
          </p>
        </details>
        <div class="adhd-plot-grid">
          {plot(
            pairs,
            'target_interest_v1',
            'target_start_ease_v1',
            'Same target: interest (horizontal) and anticipated start ease (vertical)',
          )}
          {plot(
            pleasant,
            'energy_now_v1',
            'pleasantness_now_v1',
            'Energy (horizontal) and pleasantness (vertical)',
          )}
        </div>
        <details>
          <summary>How to read these pairs</summary>{' '}
          <p>
            Low anticipated ease can coexist with an actual start. Low energy can coexist with pleasantness.
            Neither implies extra capacity, flexible stopping, or a diagnosis.
          </p>
        </details>
      </section>
      <details class="adhd-review-details">
        <summary>History & working ideas</summary>
        <section>
          <h3>History</h3>
          <label>
            Measure
            <select value={measure} onChange={(e) => setMeasure(field(e))}>
              {state.items.map((i) => (
                <option value={i.id}>{i.construct}</option>
              ))}
            </select>
          </label>
          {!obs.length && <p>No observations yet. Help now needs no history.</p>}
          {obs.map((o) => (
            <details>
              <summary>
                {displayObservationTime(o, state.settings.timezone)} · {o.context.target || 'No task'} ·{' '}
                {Object.hasOwn(o.answers, measure) ? String(o.answers[measure]) : 'Unrecorded'}
              </summary>
              <p>
                Record {o.id} · canonical answer {o.answer_id}
              </p>
              <p>
                Observed: {o.observed_at}; recorded: {o.recorded_at}; {o.timezone}; {o.precision}; {o.scope};{' '}
                {o.sampling}; pack {o.pack}; {o.context.phase}. User tags: {o.user_tags.join(', ') || 'None'}.
                Algorithmic tags: none; core alone cannot establish contentment, pressured focus or flexible
                stopping.
              </p>
              <dl>
                {state.items.map((i) => (
                  <>
                    <dt>
                      {i.prompt.replace('[target task]', o.context.target || 'the selected task')} · {i.id}
                    </dt>
                    <dd>
                      {Object.hasOwn(o.answers, i.id)
                        ? `${o.answers[i.id]} · ${i.anchors[Number(o.answers[i.id]) - 1]}`
                        : (o.items[i.id]?.status ?? 'not_asked')}
                    </dd>
                  </>
                ))}
              </dl>
            </details>
          ))}
        </section>
        <section>
          <h3>Hypotheses: how each idea could lose support</h3>
          <p>
            Workflow statuses are not calibrated probabilities. Preserve contradictory observations; a
            strategy effect does not prove its mechanism.
          </p>
          {state.records
            .filter((r) => r.kind === 'hypothesis')
            .map((r) => (
              <HypothesisEditor
                key={r.id + ':' + r.revision}
                initial={r.data as AdhdHypothesisInput}
                row={r}
                send={send}
              />
            ))}
          <details>
            <summary>Generic starting templates · no personal evidence seeded</summary>
            {state.hypotheses.map((h, i) => (
              <HypothesisEditor key={i} initial={h} send={send} />
            ))}
          </details>
        </section>
        <section>
          <h3>Legacy source ledger</h3>
          <p>
            Canonical legacy assessments only; numeric time-series projections are not extra samples. Old
            general motivation is not new same-task interest; fatigue is not inverted into energy.
            Template/question versions remain separate until an explicit reviewed equivalence map exists.
          </p>
          {state.legacy.length === 0 ? (
            <p>No legacy records available in this account.</p>
          ) : (
            state.legacy.map((r) => (
              <details>
                <summary>
                  {new Date(r.observed_at).toLocaleString()} · template {r.template_id} v{r.version}
                </summary>
                <p>
                  ID {r.id} · {r.time_scope}
                </p>
                <pre>{JSON.stringify(r.answers, null, 2)}</pre>
              </details>
            ))
          )}
        </section>{' '}
      </details>
    </>
  )
}
function Toolkit({ state, send }: { state: AdhdState; send: Send }) {
  const [toolView, setToolView] = useState('Supports')
  const [search, setSearch] = useState(''),
    [bottleneck, setBottleneck] = useState('cannot start'),
    [strategy, setStrategy] = useState('prepared_starter'),
    [steps, setSteps] = useState(''),
    [stop, setStop] = useState(''),
    [review, setReview] = useState({
      mattered: 'Recovery',
      helped: 'Unsure',
      difficult: 'Starting',
      tracking_worthwhile: 'unsure' as 'yes' | 'no' | 'unsure',
      next: 'Keep help optional',
    })
  return (
    <>
      <div class="adhd-view-intro">
        <span class="adhd-eyebrow">KEEP A FEW GOOD TOOLS</span>
        <h2>A lighter way through.</h2>
      </div>
      <div class="adhd-chips" role="group" aria-label="Toolkit sections">
        {['Supports', 'My recipes', 'Weekly review', 'Recent actions', 'About ADHD'].map((view) => (
          <button aria-pressed={toolView === view} onClick={() => setToolView(view)}>
            {view}
          </button>
        ))}
      </div>
      <section hidden={toolView !== 'Supports'}>
        <h2>Find your next useful tool</h2>
        <label>
          Find a support
          <input type="search" value={search} onInput={(e) => setSearch(field(e))} />
        </label>
        <div class="adhd-tool-grid">
          {state.strategies
            .filter((s) => `${s.title} ${s.barriers.join(' ')}`.toLowerCase().includes(search.toLowerCase()))
            .map((s) => (
              <details>
                <summary>
                  <span class="adhd-tool-title">{s.title}</span>
                  <span class="adhd-tool-benefit">{s.benefit}</span>
                </summary>
                <p>{s.setup}</p>
                <ol>
                  {s.steps.map((step) => (
                    <li>{step}</li>
                  ))}
                </ol>
                <p>
                  Expected benefit: {s.benefit} Possible cost: {s.cost}
                </p>
                <p>{s.evidence}</p>
                {s.sources.map((url, i) => (
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    Source {i + 1}{' '}
                  </a>
                ))}
                <p>
                  Stable strategy {s.id} v{s.version}; optional measurement {s.pack}. Personal sessions using
                  this: {state.records.filter((r) => r.kind === 'opportunity' && r.data.used === s.id).length}
                  . Counts do not establish benefit.
                </p>
              </details>
            ))}
        </div>
      </section>
      <section hidden={toolView !== 'My recipes'}>
        <h3>Friction detective / reusable stop rule</h3>
        <p>
          Choose one bottleneck and support. Save a small recipe; try it through Help now, then record an
          outcome only if useful.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send({
              operation: 'recipe',
              title: `${bottleneck}: ${state.strategies.find((s) => s.id === strategy)?.title}`,
              barrier: bottleneck,
              strategy_id: strategy,
              steps,
              stopping_rule: stop,
            })
          }}
        >
          <label>
            One bottleneck
            <select value={bottleneck} onChange={(e) => setBottleneck(field(e))}>
              {[
                'cannot choose',
                'cannot start',
                'foggy/tired',
                'pressured',
                'distracted',
                'cannot stop',
                'need recovery',
              ].map((v) => (
                <option value={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            One support
            <select value={strategy} onChange={(e) => setStrategy(field(e))}>
              {state.strategies.map((s) => (
                <option value={s.id}>{s.title}</option>
              ))}
            </select>
          </label>
          <label>
            Small physical or digital action
            <textarea required value={steps} onInput={(e) => setSteps(field(e))} />
          </label>
          <label>
            Finite stopping point / cue
            <input required value={stop} onInput={(e) => setStop(field(e))} />
          </label>
          <button type="submit">Save recipe</button>
        </form>
        {state.records
          .filter((r) => r.kind === 'recipe')
          .map((r) => (
            <article>
              <h4>{String(r.data.title)}</h4>
              <p>{String(r.data.steps)}</p>
              <p>Stop: {String(r.data.stopping_rule)}</p>
              <button
                onClick={() =>
                  send({
                    operation: 'session',
                    recipe_id: r.id,
                    context: {
                      ...emptyContext,
                      target: String(r.data.steps).slice(0, 300),
                      phase: 'pre_start',
                      task_class: 'saved recipe',
                    },
                    endpoint: String(r.data.stopping_rule),
                    strategy_id: String(r.data.strategy_id),
                  })
                }
              >
                Start a session
              </button>
            </article>
          ))}
      </section>
      <section hidden={toolView !== 'Weekly review'}>
        <h3>Optional weekly review · one or two minutes</h3>
        <p>Original reflection, not a validated symptom questionnaire.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send({ operation: 'review', ...review })
          }}
        >
          {(['mattered', 'helped', 'difficult', 'next'] as const).map((key) => (
            <label>
              {
                {
                  mattered: 'What mattered?',
                  helped: 'What helped?',
                  difficult: 'What remained difficult?',
                  next: 'One thing to keep or test next?',
                }[key]
              }
              <input
                list={`review-${key}`}
                value={review[key]}
                onInput={(e) => setReview({ ...review, [key]: field(e) })}
                required
              />
              <datalist id={`review-${key}`}>
                {[
                  'Recovery',
                  'Connection',
                  'Play',
                  'Meaningful action',
                  'Starting',
                  'Stopping on time',
                  'Fewer decisions',
                  'Nothing yet',
                  'Less tracking',
                  'Keep help optional',
                ].map((v) => (
                  <option value={v} />
                ))}
              </datalist>
            </label>
          ))}
          <label>
            Did tracking help enough to justify its effort?
            <select
              value={review.tracking_worthwhile}
              onChange={(e) =>
                setReview({ ...review, tracking_worthwhile: field(e) as typeof review.tracking_worthwhile })
              }
            >
              <option value="unsure">Unsure</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <button type="submit">Save review</button>
        </form>
        {state.records
          .filter((r) => r.kind === 'review')
          .map((r) => (
            <details>
              <summary>Review {new Date(r.created_at).toLocaleDateString()}</summary>
              <p>
                What mattered: {String(r.data.mattered)}. Helped: {String(r.data.helped)}. Difficult:{' '}
                {String(r.data.difficult)}. Tracking worthwhile: {String(r.data.tracking_worthwhile)}. Next:{' '}
                {String(r.data.next)}
              </p>
            </details>
          ))}
      </section>
      <section hidden={toolView !== 'Recent actions'}>
        <h3>Recent actions and time estimates</h3>
        {state.records
          .filter((r) => r.kind === 'opportunity' && r.data.condition === 'self_chosen')
          .map((r) => (
            <Outcome key={r.id} row={r} state={state} send={send} />
          ))}
        {!state.records.some((r) => r.data.condition === 'self_chosen') && (
          <p>Your saved sessions will appear here.</p>
        )}
      </section>
      <section hidden={toolView !== 'About ADHD'}>
        <h3>ADHD information</h3>
        <p>
          Recognized presentations are predominantly inattentive, predominantly hyperactive-impulsive, and
          combined; they can change over time. This page does not assign a presentation. Personal working
          states are editable descriptions, not diagnoses or discovered clusters.
        </p>
        <p>
          Demand avoidance is an experience to understand. The proposed PDA profile is contested, has limited
          research and is not an established ADHD subtype. Pressure, worry, fatigue, uncertainty and an
          unwanted task are distinct possibilities.
        </p>
        <p>
          Structured ADHD-focused support and environmental modifications have a clinical basis. This app
          borrows practical skills; it has not inherited validation from therapist-delivered CBT. Body
          doubling, music, autonomy wording and rewards have narrow, mixed or indirect evidence and are
          personal experiments.
        </p>
        <p>
          <a
            href="https://www.cdc.gov/adhd/signs-symptoms/index.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            CDC presentations
          </a>{' '}
          ·{' '}
          <a
            href="https://www.nice.org.uk/guidance/ng87/chapter/recommendations"
            target="_blank"
            rel="noopener noreferrer"
          >
            NICE guidance
          </a>{' '}
          ·{' '}
          <a
            href="https://www.autism.org.uk/advice-and-guidance/behaviour/demand-avoidance"
            target="_blank"
            rel="noopener noreferrer"
          >
            Demand avoidance evidence
          </a>
        </p>
        <p>
          Optional established screening:{' '}
          <a
            href="https://www.hcp.med.harvard.edu/ncs//ftpdir/adhd/6Q_ASRS_English.pdf"
            target="_blank"
            rel="noopener noreferrer"
          >
            official ASRS v1.1 six-item form
          </a>{' '}
          and{' '}
          <a
            href="https://license.tov.med.nyu.edu/product/asrs6Qscreener"
            target="_blank"
            rel="noopener noreferrer"
          >
            official use terms
          </a>
          . Six-month recall; screening is not a diagnosis or a daily outcome. No screening result is needed
          for support.
        </p>
      </section>
    </>
  )
}
function Settings({ state, send }: { state: AdhdState; send: Send }) {
  const [draft, setDraft] = useState<AdhdSettings>(state.settings),
    [times, setTimes] = useState(state.settings.prompt_times.join(','))
  const patch = (p: Partial<AdhdSettings>) => setDraft({ ...draft, ...p })
  return (
    <details>
      <summary>Page settings</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send({
            operation: 'settings',
            expected_revision: state.settings_revision,
            settings: {
              ...draft,
              prompt_times: times
                .split(',')
                .map((v) => v.trim())
                .filter(Boolean),
            },
          })
        }}
      >
        <label>
          <input
            type="checkbox"
            checked={draft.reminders_enabled}
            onChange={(e) => patch({ reminders_enabled: e.currentTarget.checked })}
          />
          Enable optional reminders
        </label>
        <label>
          IANA timezone
          <input value={draft.timezone} onInput={(e) => patch({ timezone: field(e) })} />
        </label>
        <label>
          Daily contact budget
          <select value={draft.daily_budget} onChange={(e) => patch({ daily_budget: Number(field(e)) })}>
            {[1, 2, 3].map((n) => (
              <option value={n}>
                {n}
                {n === 3 ? ' · fuller sampling opt-in' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Prompt local times (comma separated)
          <input value={times} onInput={(e) => setTimes(field(e))} placeholder="12:30,17:00" />
        </label>
        <label>
          Protected sleep / quiet window starts
          <input type="time" value={draft.quiet_start} onInput={(e) => patch({ quiet_start: field(e) })} />
        </label>
        <label>
          Ends
          <input type="time" value={draft.quiet_end} onInput={(e) => patch({ quiet_end: field(e) })} />
        </label>
        <label>
          Finite acknowledgement
          <select
            value={draft.novelty}
            onChange={(e) => patch({ novelty: field(e) as typeof draft.novelty })}
          >
            <option value="off">Off</option>
            <option value="acknowledgement">Brief acknowledgement</option>
            <option value="curiosity">One curiosity prompt</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={draft.low_stimulation}
            onChange={(e) => patch({ low_stimulation: e.currentTarget.checked })}
          />
          Low stimulation
        </label>
        <button type="submit">Save preferences</button>
      </form>
    </details>
  )
}
// eslint-disable-next-line complexity -- explicit independent optional measurements and lifecycle states must remain distinct
export function ADHD() {
  const generation = useRef(currentSessionGeneration()).current,
    client = useQueryClient(),
    [tab, setTab] = useState('Now'),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [pending, setPending] = useState<AdhdCommandBody | null>(() =>
      auth.value.token ? loadPrivate('pending', generation) : null,
    )
  const pendingRef = useRef(pending),
    dispatchBusy = useRef(false)
  const query = useQuery({ queryKey: ['adhd'], queryFn: requestState, enabled: !!auth.value.token }),
    state = query.data
  const dispatch = async (body: AdhdCommandBody): Promise<boolean> => {
    if (dispatchBusy.current) return false
    dispatchBusy.current = true
    try {
      sessionGuard(generation)
      if (pendingRef.current && pendingRef.current.request_id !== body.request_id) return false
      pendingRef.current = body
      setBusy(true)
      setError('')
      setPending(body)
      storePrivate('pending', body, generation)
      sessionGuard(generation)
      const response = (
        await axios.post<AdhdResponse>(`${API_URL}/adhd/commands`, body, { headers: headers() })
      ).data
      sessionGuard(generation)
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Server did not confirm this save.')
      }
      client.setQueryData(['adhd'], response.data)
      removePrivate('pending', generation)
      pendingRef.current = null
      setPending(null)
      setMessage('Saved.')
      return true
    } catch (e) {
      if (currentSessionGeneration() === generation) {
        if (axios.isAxiosError(e) && e.response && e.response.status >= 400 && e.response.status < 500) {
          removePrivate('pending', generation)
          pendingRef.current = null
          setPending(null)
          setError(
            `${errorText(e)} Not saved; your draft remains. Reload changed records before trying again.`,
          )
        } else setError(errorText(e))
      }
      return false
    } finally {
      dispatchBusy.current = false
      if (currentSessionGeneration() === generation) setBusy(false)
    }
  }
  const activePilot = state?.records.find(
    (r) =>
      r.kind === 'protocol' && r.data.status === 'active' && new Date(String(r.data.ends_at)) > new Date(),
  )
  const reward = activePilot?.data.novelty_snapshot ?? state?.settings.novelty
  const send: Send = async (command) => {
    sessionGuard(generation)
    if (pendingRef.current) {
      setError(
        'Resolve the pending save first using Retry same request. Help without logging remains available.',
      )
      return false
    }
    setMessage('')
    return dispatch({ request_id: crypto.randomUUID(), command })
  }
  if (!auth.value.token) {
    return (
      <div class="adhd">
        <h1>ADHD</h1>
        <p>Sign in to use ADHD.</p>
      </div>
    )
  }
  return (
    <main class={`adhd ${state?.settings.low_stimulation ? 'low-stimulation' : ''}`} aria-busy={busy}>
      <header>
        <div>
          <span class="adhd-eyebrow">SPACE TO GET UNSTUCK</span>
          <h1>ADHD</h1>
        </div>
        {state && (
          <button
            onClick={() =>
              send({
                operation: 'settings',
                expected_revision: state.settings_revision,
                settings: { ...state.settings, paused: !state.settings.paused },
              })
            }
          >
            {state.settings.paused ? 'Resume gently' : 'Pause now'}
          </button>
        )}
      </header>
      <nav aria-label="ADHD views">
        {['Now', 'Experiments', 'Patterns', 'Toolkit'].map((t) => (
          <button
            aria-current={tab === t ? 'page' : undefined}
            onClick={() => {
              setTab(t)
              setMessage('')
            }}
          >
            <span class="adhd-nav-icon" aria-hidden="true">
              {{ Now: '↗', Experiments: '◇', Patterns: '◈', Toolkit: '▤' }[t]}
            </span>
            {t}
          </button>
        ))}
      </nav>
      {busy && <p role="status">Saving… waiting for server confirmation.</p>}
      {error && <p role="alert">{error}</p>}
      {pending && (
        <aside>
          <p>
            Pending retry · the server may already have accepted this action. The same request key is retained
            across reloads.
          </p>
          <button disabled={busy} onClick={() => dispatch(pending)}>
            Retry same request
          </button>
          <button disabled={busy} onClick={() => query.refetch()}>
            Reload saved state for review
          </button>
        </aside>
      )}
      {message && (
        <p role="status">
          {message}
          {reward === 'acknowledgement'
            ? ' Honest observations, rest and sensible stopping all count as useful information.'
            : reward === 'curiosity'
              ? ' One curiosity: what would make the next step lighter?'
              : ''}
        </p>
      )}
      {query.isLoading && <p>Loading…</p>}
      {query.error && (
        <p role="alert">
          Could not load your page. <button onClick={() => query.refetch()}>Try again</button>
        </p>
      )}
      {state && (
        <>
          {state.settings.paused && (
            <aside>
              Paused. No catch-up queue or missed-day debt. Help without logging remains available; history
              stays intact.
            </aside>
          )}
          {state.records
            .filter(
              (r) =>
                r.kind === 'invitation' &&
                ['planned', 'delivery_attempted', 'opened', 'snoozed'].includes(String(r.data.status)) &&
                new Date(String(r.data.end)) > new Date(),
            )
            .map((r) => (
              <aside>
                <p>
                  Optional reflection window · {String(r.data.status)}. Not an obligation or evidence of task
                  opportunity.
                </p>
                <button
                  onClick={() =>
                    send({
                      operation: 'invitation',
                      id: r.id,
                      expected_revision: r.revision,
                      action: 'opened',
                    }).then((ok) => {
                      if (ok) setTab('Now')
                    })
                  }
                >
                  Mark opened
                </button>
                <button
                  onClick={() =>
                    send({ operation: 'invitation', id: r.id, expected_revision: r.revision, action: 'skip' })
                  }
                >
                  Skip
                </button>
                <button
                  onClick={() =>
                    send({
                      operation: 'invitation',
                      id: r.id,
                      expected_revision: r.revision,
                      action: 'snooze',
                    })
                  }
                >
                  Snooze ten minutes within window
                </button>
              </aside>
            ))}
          {tab === 'Now' ? (
            <Now state={state} send={send} generation={generation} />
          ) : tab === 'Experiments' ? (
            <Experiments state={state} send={send} />
          ) : tab === 'Patterns' ? (
            <Patterns state={state} send={send} />
          ) : (
            <Toolkit state={state} send={send} />
          )}
          <Settings key={state.settings_revision} state={state} send={send} />
          <details>
            <summary>Instrument definitions and interpretation</summary>
            <p>
              Custom tracking questions v1 are not validated ADHD severity scales. No synthetic readiness
              score. All item versions and wording are frozen; user tags and algorithmic suggestions are
              separate evidence. No algorithmic state assignment is currently made.
            </p>
            {state.items.map((i) => (
              <article>
                <h4>
                  {i.id} v{i.version}
                </h4>
                <p>{i.prompt}</p>
                <p>{i.anchors.map((a, n) => `${n + 1} ${a}`).join('; ')}</p>
                <p>
                  Construct: {i.construct}. Recall: {i.recall}. Applicable: {i.applicability}. Decision:{' '}
                  {i.decision}.
                </p>
              </article>
            ))}
          </details>
        </>
      )}
    </main>
  )
}

import CorsiBlocks from '@jspsych-contrib/plugin-corsi-blocks'
import HtmlButtonResponse from '@jspsych/plugin-html-button-response'
import HtmlKeyboardResponse from '@jspsych/plugin-html-keyboard-response'
import { initJsPsych } from 'jspsych'

import './frame.css'
import {
  advanceMemory,
  blocks,
  foreperiod,
  memoryMetrics,
  protocolVersion,
  randomSequence,
  reactionDuration,
  reactionMetrics,
  reactionOutcome,
  round,
  type Game,
  type GameResult,
  type InputMode,
  type MemoryTrial,
  type ReactionTrial,
} from './protocol'

const params = new URLSearchParams(location.hash.slice(1))
const token = params.get('token')
const game: Game = params.get('game') === 'memory' ? 'memory' : 'reaction'
const mode: InputMode = game === 'memory' || params.get('mode') === 'pointer' ? 'pointer' : 'keyboard'
const send = (type: string, result?: GameResult) =>
  parent.postMessage({ type, token, result }, location.origin)
const display = document.querySelector<HTMLElement>('#experiment')
if (!display) throw new Error('Missing experiment container')
let active = false
let canceled = false
const jsPsych = initJsPsych({
  display_element: display,
  on_finish: () => {
    active = false
  },
})
const cancel = () => {
  if (!active || canceled) return
  canceled = true
  active = false
  jsPsych.abortExperiment('Run canceled. Return to Home to start again.')
  send('canceled')
}
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') cancel()
})
window.addEventListener('blur', cancel)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancel()
})
window.addEventListener('pagehide', cancel)
const started = performance.now()
const complete = (trials: MemoryTrial[] | ReactionTrial[], metrics: Record<string, number>) => {
  if (canceled) return
  active = false
  send('complete', {
    game,
    protocol: protocolVersion[game],
    completed_at: new Date().toISOString(),
    duration_ms: round(performance.now() - started),
    input_mode: mode,
    device: navigator.userAgent,
    trials,
    metrics,
  })
}

async function memory() {
  const trials: MemoryTrial[] = []
  let length = 2
  let sequence = randomSequence(2)
  let practice = true
  const shared = {
    type: CorsiBlocks,
    blocks,
    display_width: 'min(calc(100vw - 24px), 360px)',
    display_height: 'min(calc(100vw - 24px), 360px)',
    block_size: 12,
    pre_stim_duration: 500,
    sequence_block_duration: 1000,
    sequence_gap_duration: 250,
    response_animation_duration: 500,
    block_color: '#123044',
    highlight_color: '#5ffbf1',
    correct_color: '#5ffbf1',
    incorrect_color: '#b89cff',
    sequence: () => sequence,
  }
  await jsPsych.run([
    {
      timeline: [
        {
          ...shared,
          mode: 'display',
          prompt: () => `<span class="phase">${practice ? 'PRACTICE · ' : ''}WATCH</span>`,
        },
        {
          ...shared,
          mode: 'input',
          prompt: '<span class="phase">YOUR TURN</span>',
          on_finish: (data: { response: number[]; rt: number[]; correct: boolean }) => {
            trials.push({
              sequence: [...sequence],
              response: data.response,
              rt: data.rt,
              correct: data.correct,
              practice,
            })
          },
        },
        {
          type: HtmlKeyboardResponse,
          choices: 'NO_KEYS',
          trial_duration: 750,
          stimulus: () =>
            `<div class="round-feedback">${trials.at(-1)?.correct ? '◇' : '↺'}<span>${practice ? 'PRACTICE COMPLETE' : ''}</span></div>`,
        },
      ],
      loop_function: () => {
        if (practice) {
          practice = false
          sequence = randomSequence(2)
          return true
        }
        const next = advanceMemory(trials, length)
        if (next === null) return false
        length = next
        sequence = randomSequence(length)
        return true
      },
    },
  ])
  complete(trials, memoryMetrics(trials))
}

async function reaction() {
  const trials: ReactionTrial[] = []
  const origin = performance.now()
  const remaining = () => Math.max(0, reactionDuration - (performance.now() - origin))
  let current: ReactionTrial
  let windowMs = 2000
  let detach = () => {}
  let clock = 0
  const updateClock = () => {
    const label = document.querySelector('#clock')
    if (label) label.textContent = `${Math.ceil(remaining() / 1000)} seconds remaining`
  }
  updateClock()
  clock = window.setInterval(updateClock, 250)
  const responseTrial =
    mode === 'keyboard'
      ? {
          type: HtmlKeyboardResponse,
          choices: [' '],
          stimulus: '<div class="reactor go"><span>GO</span></div>',
        }
      : {
          type: HtmlButtonResponse,
          stimulus: '',
          choices: ['Respond'],
          button_html: () => '<button class="reactor go" aria-label="Respond"><span>GO</span></button>',
        }
  try {
    await jsPsych.run([
      {
        timeline: [
          {
            type: HtmlKeyboardResponse,
            choices: 'NO_KEYS',
            stimulus: '<div class="reactor waiting"><span>WAIT</span></div>',
            trial_duration: 1,
            on_start: (trial: { trial_duration: number }) => {
              current = {
                start_ms: round(performance.now() - origin),
                foreperiod_ms: foreperiod(),
                stimulus_ms: null,
                rt_ms: null,
                anticipations_ms: [],
                outcome: 'boundary',
              }
              trial.trial_duration = Math.min(current.foreperiod_ms, remaining())
            },
            on_load: () => {
              const early = (event: Event) => {
                if (
                  mode === 'keyboard' &&
                  (!(event instanceof KeyboardEvent) || event.code !== 'Space' || event.repeat)
                ) {
                  return
                }
                event.preventDefault()
                current.anticipations_ms.push(round(performance.now() - origin))
                if (
                  trials.reduce(
                    (sum, trial) => sum + trial.anticipations_ms.length,
                    current.anticipations_ms.length,
                  ) >= 10000
                ) {
                  cancel()
                }
              }
              const eventName = mode === 'keyboard' ? 'keydown' : 'pointerdown'
              document.addEventListener(eventName, early)
              detach = () => document.removeEventListener(eventName, early)
            },
            on_finish: () => detach(),
          },
          {
            timeline: [
              {
                ...responseTrial,
                trial_duration: 1,
                on_start: (trial: { trial_duration: number }) => {
                  windowMs = Math.min(2000, remaining())
                  current.stimulus_ms = round(performance.now() - origin)
                  trial.trial_duration = windowMs
                },
                on_finish: (data: { rt: number | null }) => {
                  current.rt_ms = data.rt
                  current.outcome = reactionOutcome(data.rt, performance.now() - origin, windowMs)
                },
              },
            ],
            conditional_function: () => remaining() > 0,
          },
        ],
        loop_function: () => {
          trials.push(current)
          return remaining() > 0 && !canceled
        },
      },
    ])
  } finally {
    clearInterval(clock)
    detach()
  }
  complete(trials, reactionMetrics(trials))
}
// Standalone navigation must not start a test without the Home Start action.
if (parent === window || !token) {
  display.textContent = 'Start this test from Home.'
} else {
  window.focus()
  active = true
  void (game === 'memory' ? memory() : reaction()).catch(() => {
    canceled = true
    active = false
    send('error')
  })
}

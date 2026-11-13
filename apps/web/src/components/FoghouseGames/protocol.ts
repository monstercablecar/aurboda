export type Game = 'memory' | 'reaction'
export type InputMode = 'keyboard' | 'pointer'
export const reactionDuration = 180_000
export const protocolVersion = { memory: 'foghouse-memory-forward-v1', reaction: 'foghouse-reaction-3min-v1' }
export const blocks = [
  { x: 45, y: 80 },
  { x: 80, y: 92 },
  { x: 20, y: 70 },
  { x: 70, y: 60 },
  { x: 35, y: 50 },
  { x: 8, y: 40 },
  { x: 92, y: 45 },
  { x: 60, y: 25 },
  { x: 47, y: 8 },
]
export interface MemoryTrial {
  sequence: number[]
  response: number[]
  rt: number[]
  correct: boolean
  practice: boolean
}
export interface ReactionTrial {
  start_ms: number
  foreperiod_ms: number
  stimulus_ms: number | null
  rt_ms: number | null
  anticipations_ms: number[]
  outcome: 'valid' | 'anticipation' | 'omission' | 'boundary'
}
export interface GameResult {
  game: Game
  protocol: string
  completed_at: string
  duration_ms: number
  input_mode: InputMode
  device: string
  trials: MemoryTrial[] | ReactionTrial[]
  metrics: Record<string, number>
}
export const round = (value: number) => Math.round(value * 100) / 100
export function randomSequence(length: number, random = Math.random): number[] {
  const pool = Array.from({ length: 9 }, (_, i) => i)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, length)
}
export const foreperiod = (random = Math.random) => 1000 + Math.floor(random() * 3001)
export function memoryMetrics(trials: MemoryTrial[]) {
  const scored = trials.filter((trial) => !trial.practice)
  return {
    span: Math.max(0, ...scored.filter((trial) => trial.correct).map((trial) => trial.sequence.length)),
    correct: scored.filter((trial) => trial.correct).length,
    total: scored.length,
  }
}
export const advanceMemory = (trials: MemoryTrial[], length: number) => {
  const attempts = trials.filter((trial) => !trial.practice && trial.sequence.length === length)
  return attempts.length < 2
    ? length
    : attempts.some((trial) => trial.correct) && length < 9
      ? length + 1
      : null
}
export function reactionOutcome(
  rt: number | null,
  _elapsed: number,
  responseWindow: number,
): ReactionTrial['outcome'] {
  if (rt !== null && rt < responseWindow && rt < 2000) return rt < 100 ? 'anticipation' : 'valid'
  if (responseWindow < 2000) return 'boundary'
  return 'omission'
}
export function reactionMetrics(trials: ReactionTrial[]) {
  const valid = trials
    .flatMap((trial) => (trial.outcome === 'valid' && trial.rt_ms !== null ? [trial.rt_ms] : []))
    .sort((a, b) => a - b)
  const mean = valid.reduce((sum, value) => sum + value, 0) / (valid.length || 1)
  return {
    valid: valid.length,
    anticipations: trials.reduce(
      (sum, trial) => sum + trial.anticipations_ms.length + Number(trial.outcome === 'anticipation'),
      0,
    ),
    omissions: trials.filter((trial) => trial.outcome === 'omission').length,
    total: trials.length,
    duration: 180,
    ...(valid.length
      ? {
          median: round(
            (valid[Math.floor((valid.length - 1) / 2)] + valid[Math.floor(valid.length / 2)]) / 2,
          ),
          variability: round(
            Math.sqrt(valid.reduce((sum, value) => sum + (value - mean) ** 2, 0) / valid.length),
          ),
          speed: round(valid.reduce((sum, value) => sum + 1000 / value, 0) / valid.length),
        }
      : {}),
  }
}
export function serializeResult(result: GameResult): string {
  const report = JSON.stringify(result)
  if (report.length > 100_000) {
    throw new Error('The raw result exceeds the save limit. It has not been truncated or saved.')
  }
  return report
}

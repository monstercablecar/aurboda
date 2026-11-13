import type { Instrument, ScoreField } from '../../pages/Assessments/catalog'

const field = (
  game: string,
  key: string,
  label: string,
  unit: string,
  max: number,
  optional = false,
): ScoreField => ({
  key,
  label,
  unit,
  min: 0,
  max,
  step: 0.01,
  required: !optional,
  metric_name: `foghouse_${game}_${key}_v1`,
})
const common = {
  category: 'Foghouse games',
  provider: 'Foghouse',
  url: '/',
  evidence: 'Research-informed personal tracking, not a diagnostic test.',
  longevity: 'Local, versioned protocol. Results are separate from external benchmarks.',
  retake:
    'Practice, sleep, device and input method affect results. Use the same device and input mode when comparing runs.',
}
export const memoryInstrument: Instrument = {
  ...common,
  key: 'mental_foghouse_memory_test_v1',
  title: 'Foghouse memory test',
  version: 'foghouse-memory-forward-v1',
  source: 'https://pubmed.ncbi.nlm.nih.gov/25258029/',
  description:
    'Play on Home. Forward spatial recall with an unscored practice, then two attempts per length from 2 to 9. Pointer input only; not a clinical Corsi equivalent.',
  fields: [
    field('memory', 'span', 'Longest successful span', 'blocks', 9),
    field('memory', 'correct', 'Correct scored trials', 'trials', 16),
    field('memory', 'total', 'Scored trials', 'trials', 16),
  ],
}
export const reactionInstrument: Instrument = {
  ...common,
  key: 'mental_foghouse_reaction_test_v1',
  title: 'Foghouse reaction test',
  version: 'foghouse-reaction-3min-v1',
  source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3197786/',
  description:
    'Play on Home. Fixed three-minute, PVT-inspired protocol with random 1–4 second waits and a custom two-second response timeout. Not a validated PVT.',
  fields: [
    field('reaction', 'median', 'Median valid response', 'ms', 2000, true),
    field('reaction', 'variability', 'Valid response SD', 'ms', 2000, true),
    field('reaction', 'speed', 'Mean reciprocal speed', '1/s', 10, true),
    field('reaction', 'valid', 'Valid trials', 'trials', 180),
    field('reaction', 'anticipations', 'Anticipations', 'responses', 10000),
    field('reaction', 'omissions', 'Omissions', 'trials', 180),
    field('reaction', 'total', 'Trials including boundary', 'trials', 180),
    field('reaction', 'duration', 'Protocol duration', 'seconds', 180),
  ],
}

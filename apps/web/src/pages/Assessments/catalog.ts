import { memoryInstrument, reactionInstrument } from '../../components/FoghouseGames/instruments'

export const catalog_version = '2026-11-11'
export interface ScoreField {
  key: string
  label: string
  unit: string
  min: number
  max: number
  step: number
  required: boolean
  metric_name: string | null
}
export interface Instrument {
  key: string
  title: string
  category: string
  provider: string
  version: string
  url: string
  source: string
  description: string
  evidence: string
  longevity: string
  retake: string
  fields: ScoreField[]
  research?: boolean
  descriptive_result?: boolean
}
const score = (key: string, label: string, unit: string, min: number, max: number, step = 1): ScoreField => ({
  key,
  label,
  unit,
  min,
  max,
  step,
  required: true,
  metric_name: `mental_${key}_v1`,
})
const benchmark = (
  key: string,
  title: string,
  path: string,
  unit: string,
  min: number,
  max: number,
  step = 1,
): Instrument => ({
  key: `mental_hb_${key}_v1`,
  title,
  category: 'Quick benchmarks',
  provider: 'Human Benchmark',
  version: 'Online test; catalog v1',
  url: `https://humanbenchmark.com/tests/${path}`,
  source: `https://humanbenchmark.com/tests/${path}`,
  description:
    key === 'reaction'
      ? 'Average reaction time in milliseconds; lower means faster. Hardware, input method and browser affect results.'
      : 'Record the final score shown by Human Benchmark.',
  evidence: 'Informal benchmark, not a validated diagnostic assessment.',
  longevity: 'Long-standing host; links and protocols can change.',
  retake: 'Retake anytime. Practice and gaming affect scores; use the same device, browser and protocol.',
  fields: [score(`hb_${key}`, 'Final score', unit, min, max, step)],
})
export const instruments: Instrument[] = [
  {
    key: 'mental_ipip120_v1',
    title: 'Big Five · IPIP-NEO-120',
    category: 'Personality',
    provider: 'bigfive-test.com',
    version: 'IPIP-NEO-120 raw domain totals',
    url: 'https://bigfive-test.com/',
    source: 'https://bigfive-test.com/about',
    description:
      'Enter the five RAW domain totals (24–120 points each), not percentages or percentiles. Add any of the 30 facets in report notes.',
    evidence:
      'Public-domain IPIP inventory with an open-source online host. Self-report context matters; high or low is not inherently good or bad.',
    longevity: 'Open inventory: https://ipip.ori.org/ . Host availability is not guaranteed.',
    retake: 'Months to a year can be useful for reflection; repeat whenever you choose.',
    fields: ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'].map((key) =>
      score(`ipip120_${key}`, key[0].toUpperCase() + key.slice(1), 'raw points', 24, 120),
    ),
  },
  {
    key: 'mental_mensa_v1',
    title: 'Mensa IQ Challenge',
    category: 'Reasoning',
    provider: 'Mensa International',
    version: 'Online IQ Challenge',
    url: 'https://www.mensa.org/mensa-iq-challenge/',
    source: 'https://www.mensa.org/mensa-iq-challenge/',
    description:
      'About 25 minutes. Record the practice estimate, not a professionally administered IQ score or membership qualification.',
    evidence: 'Official organization’s non-diagnostic practice challenge.',
    longevity: 'Official landing page; test availability may change.',
    retake:
      'First attempt is the most informative baseline. Repeating the same questions creates practice effects; note first or repeat attempt.',
    fields: [score('mensa_estimate', 'Estimated IQ', 'IQ estimate', 40, 200)],
  },
  benchmark('reaction', 'Reaction time', 'reactiontime', 'ms', 1, 10000, 0.01),
  benchmark('visual_memory', 'Visual memory', 'memory', 'level', 1, 1000),
  benchmark('number_memory', 'Number memory', 'number-memory', 'digits', 1, 1000),
  benchmark('sequence_memory', 'Sequence memory', 'sequence', 'level', 1, 1000),
  benchmark('verbal_memory', 'Verbal memory', 'verbal-memory', 'points', 0, 100000),
  {
    key: 'mental_pss14_v1',
    title: 'Perceived Stress Scale · PSS-14',
    category: 'Well-being',
    provider: 'PsyToolkit',
    version: 'PSS-14 demo',
    url: 'https://www.psytoolkit.org/survey-library/stress-pss.html',
    source: 'https://www.psytoolkit.org/survey-library/stress-pss.html',
    description:
      'Use “Run demo” on the source page. Exactly 14 items, total 0–56; do not enter a PSS-10 result. Higher means more perceived stress over the past month.',
    evidence: 'Established self-report scale; academic demo publishes scoring and source.',
    longevity: 'Academic survey library; no availability guarantee.',
    retake: 'Retake anytime, remembering that monthly recall windows overlap.',
    fields: [score('pss14_total', 'PSS-14 total', 'points', 0, 56)],
  },
  {
    key: 'mental_swls_v1',
    title: 'Satisfaction With Life Scale',
    category: 'Well-being',
    provider: 'PsyToolkit',
    version: 'SWLS five-item total',
    url: 'https://www.psytoolkit.org/survey-library/satisfaction-with-life.html',
    source: 'https://ppc.sas.upenn.edu/resources/questionnaires-researchers/satisfaction-life-scale',
    description: 'Five-item self-report total, 5–35 points.',
    evidence: 'Established self-report instrument. Online delivery is distinct from the original instrument.',
    longevity: 'Original instrument remains documented; demo links may change.',
    retake: 'Retake anytime; days, weeks and life circumstances can influence your answers.',
    fields: [score('swls_total', 'SWLS total', 'points', 5, 35)],
  },
  {
    key: 'mental_who5_v1',
    title: 'WHO-5 Well-Being Index',
    category: 'Well-being',
    provider: 'PsyToolkit',
    version: 'WHO-5 percentage score (raw × 4); WHO 2024 source',
    url: 'https://www.psytoolkit.org/survey-library/who5.html',
    source: 'https://www.who.int/publications/m/item/WHO-UCN-MSD-MHE-2024.01',
    description:
      'Record the displayed 0–100 score (raw 0–25 multiplied by four). Higher means greater well-being over the past two weeks.',
    evidence: 'Established WHO self-report instrument; no diagnostic interpretation is provided here.',
    longevity: 'Official questionnaire is documented by WHO; demo availability may change.',
    retake: 'Retake anytime; two-week recall periods may overlap.',
    fields: [score('who5_percent', 'WHO-5 standardized score', 'percent', 0, 100, 4)],
  },
  {
    key: 'mental_testmybrain_v1',
    title: 'TestMyBrain',
    category: 'Research',
    provider: 'TestMyBrain',
    version: 'Rotating research studies; specify exact protocol',
    url: 'https://www.testmybrain.org/',
    source: 'https://www.testmybrain.org/',
    description:
      'Available studies change. Record the exact study/test and protocol, score unit or descriptive result, and report details. Research participation consent is handled on the external site.',
    evidence: 'Scientifically grounded nonprofit research; individual studies and returned results vary.',
    longevity: 'Rotating availability; treat each protocol as a separate result.',
    retake: 'Follow study instructions. Results from different studies are not a shared metric series.',
    fields: [
      {
        ...score('research_value', 'Result value (optional)', 'as reported', -1e9, 1e9, 0.001),
        required: false,
        metric_name: null,
      },
    ],
    research: true,
  },
  memoryInstrument,
  reactionInstrument,
]

export const bigFiveLongInstrument: Instrument = {
  ...instruments[0],
  key: 'mental_ipip300_v1',
  title: 'Big Five · IPIP-NEO-300',
  version: 'IPIP-NEO-300 raw domain totals',
  url: 'https://bigfive-test.com/tests/ipip-neo-300',
  description:
    'Enter the five RAW domain totals (60–300 points each) from the 300-item test, not percentages or percentiles. Add any of the 30 facets in report notes.',
  fields: instruments[0].fields.map((field) =>
    score(field.key.replace('ipip120_', 'ipip300_'), field.label, field.unit, 60, 300),
  ),
}

export const mensaUnscoredInstrument: Instrument = {
  ...instruments[1],
  key: 'mental_mensa_unscored_v1',
  title: 'Mensa IQ Challenge · unscored result',
  version: 'Online IQ Challenge descriptive result',
  description:
    'Use this format when Mensa returns a message instead of a numeric estimate. Copy the exact returned result into the report field; do not infer an IQ score from it.',
  fields: [],
  descriptive_result: true,
}

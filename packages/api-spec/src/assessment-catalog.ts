import type { Assessment, CreateQuestionnaireBody, QuestionnaireTemplate } from './schemas/pharmacology.ts'

export interface LibraryInstrument {
  definition: CreateQuestionnaireBody
  purpose: string
  source: string
  attribution: string
  repeat: string
  recall_days: number
  score_max: number
  scoring: 'sum' | 'mean'
  scored_keys: string[]
}
const question = (
  stable_key: string,
  prompt: string,
  sort_order: number,
  config: Record<string, unknown>,
  anchors: Record<string, unknown> = {},
): CreateQuestionnaireBody['questions'][number] => ({
  stable_key,
  prompt,
  sort_order,
  response_type: 'numeric',
  required: false,
  enabled: true,
  metric_name: null,
  unit: null,
  config,
  anchors,
})
const gadChoices = ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'].map(
  (label, i) => ({ value: String(i), label }),
)
export const assessmentInstruments: LibraryInstrument[] = [
  {
    definition: {
      stable_key: 'aurboda_instrument_gad7_en_v1',
      display_name: 'GAD-7',
      moment: 'custom',
      enabled: true,
      description: 'Over the last two weeks, how often have you been bothered by the following problems?',
      library: { domain: 'mental', recall_period: 'Last two weeks', estimated_minutes: 3 },
      questions: [
        'Feeling nervous, anxious, or on edge',
        'Not being able to stop or control worrying',
        'Worrying too much about different things',
        'Trouble relaxing',
        'Being so restless that it is hard to sit still',
        'Becoming easily annoyed or irritable',
        'Feeling afraid, as if something awful might happen',
      ]
        .map((prompt, i) => ({
          ...question(`gad_${i + 1}`, prompt, i, { choices: gadChoices }),
          response_type: 'single_choice' as const,
        }))
        .concat([
          {
            ...question(
              'difficulty',
              'If you checked any problems, how difficult have they made it for you to do your work, take care of things at home, or get along with other people?',
              7,
              {
                choices: [
                  'Not difficult at all',
                  'Somewhat difficult',
                  'Very difficult',
                  'Extremely difficult',
                ],
              },
            ),
            response_type: 'single_choice' as const,
          },
        ]),
    },
    purpose:
      'Record anxiety symptoms and their reported impact. Developed and validated in adult primary care; this personal record does not diagnose anxiety.',
    source: 'https://pcl.psychiatry.uw.edu/wp-content/uploads/2021/12/GAD-7.pdf',
    attribution:
      'Developed by Robert L. Spitzer, Janet B.W. Williams, Kurt Kroenke and colleagues, with support from Pfizer. Copyright 1999 Pfizer Inc. PRIME-MD is a trademark of Pfizer Inc. PHQ/GAD instruments may be reproduced and distributed without permission under the instrument terms.',
    repeat: 'If useful, compare about every two weeks. Shorter intervals have overlapping recall.',
    recall_days: 14,
    score_max: 21,
    scoring: 'sum',
    scored_keys: Array.from({ length: 7 }, (_, i) => `gad_${i + 1}`),
  },
  {
    definition: {
      stable_key: 'aurboda_instrument_peg_en_v1',
      display_name: 'PEG pain and interference',
      moment: 'custom',
      enabled: true,
      description: 'Three questions about pain and its interference with everyday life during the past week.',
      library: { domain: 'physical', recall_period: 'Past week', estimated_minutes: 2 },
      questions: [
        question(
          'pain',
          'What number best describes your pain on average in the past week:',
          0,
          { min: 0, max: 10, step: 1 },
          { min: 'No pain', max: 'Pain as bad as you can imagine' },
        ),
        question(
          'enjoyment',
          'What number best describes how, during the past week, pain has interfered with your enjoyment of life?',
          1,
          { min: 0, max: 10, step: 1 },
          { min: 'Does not interfere', max: 'Completely interferes' },
        ),
        question(
          'activity',
          'What number best describes how, during the past week, pain has interfered with your general activity?',
          2,
          { min: 0, max: 10, step: 1 },
          { min: 'Does not interfere', max: 'Completely interferes' },
        ),
      ],
    },
    purpose:
      'Record pain intensity and interference with enjoyment and activity. Validated in adults with chronic pain; it does not identify the cause of pain.',
    source: 'https://www.ccdor.research.va.gov/CCDORRESEARCH/Resources/PEG_3itempainscale.pdf',
    attribution:
      'Public domain. Krebs EE et al. Development and initial validation of the PEG, a 3-item scale assessing pain intensity and interference. J Gen Intern Med. 2009;24:733–738.',
    repeat: 'If useful, compare weekly. Repeating sooner overlaps the same days.',
    recall_days: 7,
    score_max: 10,
    scoring: 'mean',
    scored_keys: ['pain', 'enjoyment', 'activity'],
  },
]
export const libraryInstrument = (key: string) =>
  assessmentInstruments.find((item) => item.definition.stable_key === key)
export const isManagedInstrumentKey = (key: string) => key.startsWith('aurboda_instrument_')

// A missing item never becomes zero. Score only an unchanged, version-bound instrument.
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((key) => [key, v[key]]),
        )
      : v,
  )
// eslint-disable-next-line complexity -- reject incompatible definitions, missing items and invalid values before deriving any score
export function instrumentScore(template: QuestionnaireTemplate, assessment: Assessment): number | null {
  const instrument = libraryInstrument(template.stable_key)
  if (
    assessment.stage === 'draft' ||
    !instrument ||
    template.id !== assessment.template_id ||
    template.version !== assessment.template_version
  ) {
    return null
  }
  const values: number[] = []
  for (const key of instrument.scored_keys) {
    const q = template.questions.find((item) => item.stable_key === key && item.enabled)
    const original = instrument.definition.questions.find((item) => item.stable_key === key)
    if (
      !q ||
      !original ||
      q.prompt !== original.prompt ||
      q.response_type !== original.response_type ||
      canonical(q.config) !== canonical(original.config)
    ) {
      return null
    }
    const answer = assessment.responses.filter(
      (a) => a.question_id === q.id && a.question_version === q.version,
    )
    if (answer.length !== 1) return null
    const raw = answer[0].value
    const value =
      instrument.scoring === 'sum'
        ? typeof raw === 'string' && /^[0-3]$/.test(raw)
          ? Number(raw)
          : NaN
        : typeof raw === 'number'
          ? raw
          : NaN
    if (
      !Number.isFinite(value) ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > (instrument.scoring === 'sum' ? 3 : 10)
    ) {
      return null
    }
    values.push(value)
  }
  const sum = values.reduce((a, b) => a + b, 0)
  return instrument.scoring === 'mean' ? sum / values.length : sum
}

export const matchesInstrumentDefinition = (definition: CreateQuestionnaireBody) => {
  const instrument = libraryInstrument(definition.stable_key)
  return !!instrument && canonical(definition) === canonical(instrument.definition)
}

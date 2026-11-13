import type { Assessment, QuestionnaireTemplate } from '@aurboda/api-spec'

import { describe, expect, test, vi } from 'vitest'

import { bigFiveLongInstrument, instruments, mensaUnscoredInstrument } from './catalog'
import {
  assessmentBody,
  ensureTemplate,
  entryValues,
  historyFor,
  localTimestamp,
  parseScore,
  takenTimestamp,
  templateBody,
} from './model'
const instrument = instruments[9]
const template = {
  ...templateBody(instrument),
  id: 'template',
  version: 1,
  created_at: '',
  updated_at: '',
  questions: templateBody(instrument).questions.map((question, index) => ({
    ...question,
    id: `q${index}`,
    version: 1,
  })),
} as QuestionnaireTemplate

describe('mental assessment entry', () => {
  test('blank is not zero; zero is valid and non-finite/out-of-range/off-step values fail', () => {
    const field = instrument.fields[0]
    expect(() => parseScore(field, '')).toThrow('required')
    expect(parseScore(field, '0')).toBe(0)
    for (const value of ['NaN', 'Infinity', '-4', '104', '5']) {
      expect(() => parseScore(field, value)).toThrow()
    }
    expect(parseScore(field, '100')).toBe(100)
  })
  test('optional research numbers remain absent and study identity is mandatory', () => {
    const research = instruments[10]
    expect(parseScore(research.fields[0], '')).toBeUndefined()
    expect(() => entryValues(research, {})).toThrow()
    const values = entryValues(research, {
      study: 'Study A, protocol 2',
      report: 'No numeric result returned',
    })
    expect(values).not.toHaveProperty('research_value')
    expect(research.fields[0].metric_name).toBeNull()
  })
  test('maps units, question versions and provenance without interpreting scores', () => {
    const values = entryValues(instrument, { who5_percent: '48' })
    const body = assessmentBody(template, values, '2026-11-11T20:30:00.000Z', 'America/Denver')
    expect(body.responses[0]).toEqual({ question_id: 'q0', question_version: 1, value: 48 })
    expect(template.questions[0].unit).toBe('percent')
    expect(String(values.provenance)).toContain('2026-11-11')
    expect(
      instruments
        .flatMap((item) => item.fields)
        .every((field) => !field.metric_name || field.metric_name.length <= 50),
    ).toBe(true)
  })
  test('local timestamps round trip through browser timezone and reject invalid dates', () => {
    const date = new Date(2026, 10, 11, 14, 30)
    expect(takenTimestamp(localTimestamp(date))).toBe(date.toISOString())
    expect(() => takenTimestamp('2026-02-30T12:00')).toThrow()
    expect(() => takenTimestamp('')).toThrow()
  })
  test('repeated results remain separate and are sorted by actual taken time', () => {
    const entries = [
      {
        id: 'first',
        template_id: template.id,
        assessed_at: '2026-11-10T12:00:00Z',
        created_at: '2026-11-11T12:00:00Z',
      },
      {
        id: 'second',
        template_id: template.id,
        assessed_at: '2026-11-11T12:00:00Z',
        created_at: '2026-11-11T12:01:00Z',
      },
    ] as Assessment[]
    expect(historyFor(entries, template).map((entry) => entry.id)).toEqual(['second', 'first'])
    expect(entries[0].id).toBe('first')
  })
  test('only creates a missing questionnaire and recovers creation races', async () => {
    const create = vi.fn().mockRejectedValue(new Error('duplicate'))
    const list = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([template])
    expect(await ensureTemplate(instrument, { create, list })).toBe(template)
    const existingCreate = vi.fn()
    await ensureTemplate(instrument, { create: existingCreate, list: async () => [template] })
    expect(existingCreate).not.toHaveBeenCalled()
  })
  test('preserves API errors when template creation fails', async () => {
    await expect(
      ensureTemplate(instrument, {
        list: async () => [],
        create: async () => {
          throw new Error('offline')
        },
      }),
    ).rejects.toThrow('offline')
  })
  test('rejects edited score definitions without overwriting the saved questionnaire', async () => {
    for (const change of [
      { unit: 'raw points' },
      { config: { min: 0, max: 25, step: 1 } },
      { enabled: false },
    ]) {
      const edited = structuredClone(template)
      Object.assign(edited.questions[0], change)
      const create = vi.fn()
      await expect(ensureTemplate(instrument, { list: async () => [edited], create })).rejects.toThrow(
        'definition has changed',
      )
      expect(create).not.toHaveBeenCalled()
    }
  })
})

describe('Big Five scoring formats', () => {
  const savedTemplate = (item: typeof bigFiveLongInstrument): QuestionnaireTemplate =>
    ({
      ...templateBody(item),
      id: item.key,
      version: 1,
      created_at: '',
      updated_at: '',
      questions: templateBody(item).questions.map((question, index) => ({
        ...question,
        id: `${item.key}_${index}`,
        version: 1,
      })),
    }) as QuestionnaireTemplate

  test('accepts both raw scales and rejects scores outside each format', () => {
    const short = instruments[0].fields[0]
    const long = bigFiveLongInstrument.fields[0]
    expect(parseScore(short, '24')).toBe(24)
    expect(parseScore(short, '120')).toBe(120)
    expect(parseScore(long, '60')).toBe(60)
    expect(parseScore(long, '300')).toBe(300)
    expect(parseScore(long, '180')).toBe(180)
    expect(() => parseScore(short, '180')).toThrow()
    for (const value of ['23', '121', '300']) expect(() => parseScore(short, value)).toThrow()
    for (const value of ['59', '301', '100.5']) expect(() => parseScore(long, value)).toThrow()
  })

  test('retains the original questionnaire while creating a separate long-form template', async () => {
    const original = savedTemplate(instruments[0])
    const snapshot = structuredClone(original)
    const long = savedTemplate(bigFiveLongInstrument)
    const create = vi.fn().mockResolvedValue(long)
    const api = { list: async () => [original], create }
    expect(await ensureTemplate(instruments[0], api)).toBe(original)
    expect(create).not.toHaveBeenCalled()
    expect(await ensureTemplate(bigFiveLongInstrument, api)).toBe(long)
    expect(create).toHaveBeenCalledWith(templateBody(bigFiveLongInstrument))
    expect(original).toEqual(snapshot)
    expect(instruments[0].key).toBe('mental_ipip120_v1')
    expect(long.stable_key).toBe('mental_ipip300_v1')
    const shortMetrics = new Set(instruments[0].fields.map((field) => field.metric_name))
    expect(bigFiveLongInstrument.fields.every((field) => !shortMetrics.has(field.metric_name))).toBe(true)
    const entries = [{ template_id: original.id }, { template_id: long.id }] as Assessment[]
    expect(historyFor(entries, original)).toEqual([entries[0]])
    expect(historyFor(entries, long)).toEqual([entries[1]])
  })

  test('records the selected format and its bounds in provenance', () => {
    for (const item of [instruments[0], bigFiveLongInstrument]) {
      const values = entryValues(
        item,
        Object.fromEntries(item.fields.map((field) => [field.key, String(field.max)])),
      )
      const provenance = JSON.parse(String(values.provenance))
      expect(provenance.version).toBe(item.version)
      expect(provenance.instrument).toBe(item.title)
      expect(provenance.test_url).toBe(item.url)
      expect(provenance.score_fields).toEqual(item.fields)
    }
  })
})

describe('Mensa descriptive results', () => {
  test('requires the returned text and records no inferred numeric value', () => {
    for (const report of ['', '   ']) {
      expect(() => entryValues(mensaUnscoredInstrument, { report })).toThrow('required')
    }
    const report = 'Your score lies outside the range that the test is currently able to measure'
    const values = entryValues(mensaUnscoredInstrument, { report, mensa_estimate: '99' })
    expect(values.report).toBe(report)
    expect(values).not.toHaveProperty('mensa_estimate')
    expect(Object.keys(values).sort()).toEqual(['provenance', 'report'])
    expect(JSON.parse(String(values.provenance)).version).toBe(mensaUnscoredInstrument.version)
    expect(
      templateBody(mensaUnscoredInstrument).questions.every((question) => question.metric_name === null),
    ).toBe(true)
  })

  test('uses a separate template without changing the original numeric definition', async () => {
    const numeric = instruments[1]
    expect(numeric.key).toBe('mental_mensa_v1')
    expect(numeric.fields[0]).toMatchObject({
      key: 'mensa_estimate',
      min: 40,
      max: 200,
      metric_name: 'mental_mensa_estimate_v1',
    })
    const original = {
      ...templateBody(numeric),
      id: 'mensa-numeric',
      questions: templateBody(numeric).questions.map((question, index) => ({
        ...question,
        id: `m${index}`,
        version: 1,
      })),
    } as QuestionnaireTemplate
    const snapshot = structuredClone(original)
    const unscored = {
      ...templateBody(mensaUnscoredInstrument),
      id: 'mensa-unscored',
      questions: templateBody(mensaUnscoredInstrument).questions.map((question, index) => ({
        ...question,
        id: `u${index}`,
        version: 1,
      })),
    } as QuestionnaireTemplate
    const create = vi.fn().mockResolvedValue(unscored)
    const api = { list: async () => [original], create }
    expect(await ensureTemplate(numeric, api)).toBe(original)
    expect(create).not.toHaveBeenCalled()
    expect(await ensureTemplate(mensaUnscoredInstrument, api)).toBe(unscored)
    expect(create).toHaveBeenCalledWith(templateBody(mensaUnscoredInstrument))
    expect(unscored.stable_key).toBe('mental_mensa_unscored_v1')
    expect(original).toEqual(snapshot)
    const values = entryValues(mensaUnscoredInstrument, { report: 'Outside measurable range' })
    const body = assessmentBody(unscored, values, '2026-11-11T20:30:00Z', 'UTC')
    expect(body.responses.every((response) => typeof response.value === 'string')).toBe(true)
    expect(body.template_id).toBe('mensa-unscored')
  })
})

describe('catalog scoring audit', () => {
  test.each([
    [instruments[0], 24, 120, 1],
    [bigFiveLongInstrument, 60, 300, 1],
    [instruments[7], 0, 56, 1],
    [instruments[8], 5, 35, 1],
    [instruments[9], 0, 100, 4],
  ] as const)('%s retains its raw bounds and score increments', (item, min, max, step) => {
    for (const field of item.fields) {
      expect(field).toMatchObject({ min, max, step })
      expect(parseScore(field, String(min))).toBe(min)
      expect(parseScore(field, String(max))).toBe(max)
      expect(() => parseScore(field, String(min - step))).toThrow()
      expect(() => parseScore(field, String(max + step))).toThrow()
      expect(() => parseScore(field, String(min + step / 2))).toThrow()
    }
  })

  test('keeps benchmark units distinct and requires the displayed final score', () => {
    const benchmarks = instruments.slice(2, 7)
    expect(benchmarks.map((item) => item.fields[0].unit)).toEqual([
      'ms',
      'level',
      'digits',
      'level',
      'points',
    ])
    expect(new Set(benchmarks.map((item) => item.fields[0].metric_name)).size).toBe(5)
    for (const item of benchmarks) {
      expect(item.fields[0].required).toBe(true)
      expect(() => parseScore(item.fields[0], '')).toThrow('required')
    }
  })
})

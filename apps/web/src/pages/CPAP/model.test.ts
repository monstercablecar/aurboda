import { describe, expect, test } from 'vitest'

import {
  CPAP_SOURCE,
  cpapDate,
  cpapDateAtNoon,
  cpapHistory,
  cpapMetricDefinitions,
  parseCPAPCsv,
} from './model'

const header =
  'SESSION_DATE,USAGE_HOURS,AHI,LEAK_95_PERCENTILE,SLEEP_SCORE,DATA_UPDATE_TIME,RECORD_DELETE_IND'
const csv = (...rows: string[]) => [header, ...rows].join('\r\n')

describe('CPAP CSV import', () => {
  test('preserves zeros and decimals, skips blank optional metrics and discards identifying fields', () => {
    const result = parseCPAPCsv(
      `${header},PATIENT_ID,DEVICE_SERIAL\n2026-10-19,8.5666666667,.2,0,,2026-10-20 11:32:41.674,N,private,secret`,
    )
    expect(result.days).toEqual([
      {
        date: '2026-10-19',
        values: { cpap_usage_hours: 8.5666666667, cpap_ahi: 0.2, cpap_leak_95_percentile: 0 },
      },
    ])
    expect(result.data).toHaveLength(3)
    expect(result.data[0].time).toBe('2026-10-19T18:00:00.000Z')
    expect(JSON.stringify(result)).not.toMatch(/private|secret|PATIENT/)
    expect(cpapMetricDefinitions).toHaveLength(11)
    expect(cpapMetricDefinitions.every((d) => d.name.startsWith('cpap_') && d.aggregation === 'avg')).toBe(
      true,
    )
  })

  test('ignores deleted rows even when their metrics are invalid', () => {
    const result = parseCPAPCsv(csv('bad,-1,NaN,,,,Y', '2026-11-08,0,0,0,0,,N'))
    expect(result.deleted_count).toBe(1)
    expect(result.days[0].values).toEqual({
      cpap_usage_hours: 0,
      cpap_ahi: 0,
      cpap_leak_95_percentile: 0,
      cpap_sleep_score: 0,
    })
  })

  test('uses the newest update for duplicate dates, with deterministic last-row ties', () => {
    const result = parseCPAPCsv(
      csv(
        '2026-10-19,3,1,,,2026-10-20 11:32:41.674,N',
        '2026-10-19,1,1,,,2026-10-20 10:32:41.674,N',
        '2026-10-19,5,1,,,2026-10-20T05:32:41.674-06:00,N',
        '2026-10-19,7,1,,,2026-10-20T11:32:41.674Z,N',
      ),
    )
    expect(result.duplicate_count).toBe(3)
    expect(result.days[0].values.cpap_usage_hours).toBe(7)
  })

  test('accepts BOM, escaped quotes, commas and newlines in discarded columns', () => {
    const result = parseCPAPCsv(
      '\uFEFFSESSION_DATE,USAGE_HOURS,AHI,NOTE\r\n"2026-02-28",1,0,"a, b\n""quoted"""\r\n',
    )
    expect(result.days[0].date).toBe('2026-02-28')
  })

  test.each(['-1', 'NaN', 'Infinity', '1e999', '12oops', '0x10'])(
    'rejects invalid numeric input %s',
    (value) => {
      expect(() => parseCPAPCsv(csv(`2026-10-19,${value},1,,,,N`))).toThrow(/nonnegative finite/)
    },
  )
  test.each(['2026-02-29', '2026-04-31', '2026-13-01', '10/19/2026'])(
    'rejects invalid session dates %s',
    (date) => {
      expect(() => parseCPAPCsv(csv(`${date},1,1,,,,N`))).toThrow(/SESSION_DATE/)
    },
  )
  test.each(['2026-02-30 11:00:00', '2026-01-01 24:00:00', 'garbage'])(
    'rejects malformed update times %s',
    (updated) => {
      expect(() => parseCPAPCsv(csv(`2026-10-19,1,1,,,${updated},N`))).toThrow(/DATA_UPDATE_TIME/)
    },
  )
  test('rejects structural mistakes and missing required values', () => {
    expect(() => parseCPAPCsv('other,data\n1,2')).toThrow(/Missing/)
    expect(() => parseCPAPCsv('SESSION_DATE,USAGE_HOURS,AHI,AHI')).toThrow(/Duplicate/)
    expect(() => parseCPAPCsv(csv('2026-10-19,1'))).toThrow(/column count/)
    expect(() => parseCPAPCsv(csv('2026-10-19,,1,,,,N'))).toThrow(/required/)
    expect(() => parseCPAPCsv(csv('"2026-10-19,1'))).toThrow(/Unclosed/)
    expect(() => parseCPAPCsv(csv('2026-10-19,1,1,,,,Y'))).toThrow(/No active/)
  })
  test('stable payloads make repeated imports update the same keys', () => {
    const input = csv('2026-10-19,1,0,,,,N')
    expect(parseCPAPCsv(input).data).toEqual(parseCPAPCsv(input).data)
  })
})

describe('fixed Denver session dates', () => {
  test.each([
    ['2026-03-07', '2026-03-07T19:00:00.000Z'],
    ['2026-03-08', '2026-03-08T18:00:00.000Z'],
    ['2026-10-31', '2026-10-31T18:00:00.000Z'],
    ['2026-11-01', '2026-11-01T19:00:00.000Z'],
    ['2024-02-29', '2024-02-29T19:00:00.000Z'],
  ])('%s is stored at Denver noon', (date, time) => {
    expect(cpapDateAtNoon(date)).toBe(time)
    expect(cpapDate(new Date(time))).toBe(date)
  })
  test('groups raw history in Denver and filters to myAir source', () => {
    expect(
      cpapHistory([
        { metric: 'cpap_ahi', source: CPAP_SOURCE, value: 0, time: new Date('2026-11-01T05:00:00Z') },
        { metric: 'cpap_ahi', source: 'other', value: 9, time: new Date('2026-11-01T19:00:00Z') },
      ]),
    ).toEqual([{ date: '2026-10-31', values: { cpap_ahi: 0 } }])
  })
})

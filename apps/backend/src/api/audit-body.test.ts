import { describe, expect, test } from 'vitest'

import { summarizeAuditBody, summarizeAuditError, auditOperation } from './audit-body.ts'

describe('privacy-by-default audit body summaries', () => {
  test('keeps only fixed type and top-level counts', () => {
    expect(summarizeAuditBody(undefined)).toBeUndefined()
    expect(summarizeAuditBody(null)).toEqual({ body_type: 'null' })
    expect(summarizeAuditBody('private error echo')).toEqual({ body_type: 'string' })
    expect(summarizeAuditBody(123456)).toEqual({ body_type: 'number' })
    expect(summarizeAuditBody(false)).toEqual({ body_type: 'boolean' })
    expect(summarizeAuditBody([{ secret: 'credential' }, 'private note'])).toEqual({
      body_type: 'array',
      item_count: 2,
    })
  })
  test('drops nested credentials, People notes, questionnaire answers and user-controlled keys', () => {
    const body = {
      credentials: { password: 'secret', nested: { token: 'private' } },
      person: { name: 'Private Person', notes: 'medical details' },
      answers: [{ question: 'sensitive', value: 9 }],
      ['private-name-as-key']: 'content',
      status: 500,
      success: false,
    }
    expect(summarizeAuditBody(body)).toEqual({ body_type: 'object', field_count: 6 })
    expect(summarizeAuditBody({ error: { message: 'echo of medical details', body } })).toEqual({
      body_type: 'object',
      field_count: 1,
    })
  })
  test('does not traverse deep/cyclic bodies or execute nested getters/toJSON', () => {
    const body: Record<string, unknown> = {}
    body.self = body
    Object.defineProperty(body, 'sensitive', {
      enumerable: true,
      get() {
        throw new Error('must not inspect values')
      },
    })
    body.toJSON = () => {
      throw new Error('must not serialize')
    }
    expect(summarizeAuditBody(body)).toEqual({ body_type: 'object', field_count: 3 })
    let deep: unknown = 'private'
    for (let i = 0; i < 100000; i++) deep = { child: deep }
    expect(summarizeAuditBody(deep)).toEqual({ body_type: 'object', field_count: 1 })
  })
  test('large arrays and strings never enter retained details', () => {
    const sparse: unknown[] = []
    sparse.length = 1000000
    expect(summarizeAuditBody(sparse)).toEqual({ body_type: 'array', item_count: 1000000 })
    expect(summarizeAuditBody({ blob: 'sensitive'.repeat(1000000) })).toEqual({
      body_type: 'object',
      field_count: 1,
    })
    const body = JSON.parse('{"__proto__":"private","constructor":"secret","patient email":"private"}')
    expect(summarizeAuditBody(body)).toEqual({ body_type: 'object', field_count: 3 })
  })
})

test('error diagnostics retain no message, stack, custom name or database properties', () => {
  const error = Object.assign(new Error('private note in SQL'), {
    name: 'private-name',
    detail: 'sensitive detail',
    constraint: 'person-name',
    code: 'secret',
  })
  expect(summarizeAuditError(error)).toEqual({ error_type: 'error' })
  expect(summarizeAuditError('private string')).toEqual({ error_type: 'unknown' })
  expect(auditOperation('POST', '/people/:id')).toBe('POST /people/:id')
  expect(auditOperation('POST', undefined)).toBe('POST unmatched route')
})

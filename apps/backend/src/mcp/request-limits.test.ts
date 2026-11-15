import { describe, expect, test } from 'vitest'

import { MAX_MCP_BATCH_MESSAGES, MAX_MCP_INPUT_ELEMENTS, mcpRequestLimitError } from './request-limits.ts'

describe('MCP request complexity limits', () => {
  test('bounds batches at the accepted boundary', () => {
    expect(mcpRequestLimitError(Array(MAX_MCP_BATCH_MESSAGES).fill({ method: 'ping' }))).toBeUndefined()
    expect(mcpRequestLimitError(Array(MAX_MCP_BATCH_MESSAGES + 1).fill({ method: 'ping' }))).toBeDefined()
  })

  test('accepts the largest supported bulk metric import', () => {
    const data = Array.from({ length: 10_000 }, () => ({
      metric: 'weight',
      source: 'aurboda',
      time: '2026-01-01T00:00:00Z',
      value: 70,
    }))
    expect(
      mcpRequestLimitError({
        id: 1,
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'add_metrics_bulk', arguments: { data } },
      }),
    ).toBeUndefined()
  })

  test('rejects wide arguments well below the byte limit', () => {
    const body = { params: { arguments: { data: Array(MAX_MCP_INPUT_ELEMENTS).fill(0) } } }
    expect(JSON.stringify(body).length).toBeLessThan(4_000_000)
    expect(mcpRequestLimitError(body)).toBeDefined()
  })

  test('rejects excessive depth without recursive traversal', () => {
    let body: unknown = null
    for (let i = 0; i < 1000; i++) body = { child: body }
    expect(mcpRequestLimitError(body)).toBe('Request nesting is too deep')
  })
})

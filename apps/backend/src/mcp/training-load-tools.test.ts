import { expect, test, vi } from 'vitest'

import type { McpServer } from './helpers.ts'

import { registerTrainingLoadTools } from './training-load-tools.ts'

test('training-load discovery explains unknown coverage without categorical recovery promises', () => {
  const tool = vi.fn()
  registerTrainingLoadTools({ tool } as unknown as McpServer, 'synthetic-owner')
  expect(tool).toHaveBeenCalledOnce()
  const [name, description] = tool.mock.calls[0]
  expect(name).toBe('get_training_load')
  expect(description).toContain('modeled short-term load')
  expect(description).toContain('Source coverage is unknown')
  expect(description).toContain('are\nomitted')
  expect(description).toContain('do not measure recovery')
  expect(description).not.toMatch(/Undertrained|Balanced:|Very Strained|recovery zone thresholds/)
})

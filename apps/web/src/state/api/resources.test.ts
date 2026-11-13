// @vitest-environment jsdom
import { expect, test, vi } from 'vitest'

vi.mock('../auth', () => ({ auth: { value: {} } }))

import { resourceError } from './resources'

test('resource validation errors become readable text instead of rendering an object', () => {
  expect(
    resourceError({
      isAxiosError: true,
      message: 'Request failed',
      response: { data: { error: { external_url: ['Use an HTTP or HTTPS URL without credentials'] } } },
    }),
  ).toBe('Use an HTTP or HTTPS URL without credentials')
  expect(resourceError({ isAxiosError: true, message: 'Network Error' })).toBe('Network Error')
  expect(resourceError(new Error('File missing'))).toBe('File missing')
})

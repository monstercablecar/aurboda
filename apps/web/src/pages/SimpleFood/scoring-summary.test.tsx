// @vitest-environment jsdom
import type { Assessment, QuestionnaireTemplate } from '@aurboda/api-spec'

import { render } from 'preact'
import { act } from 'preact/test-utils'
import { expect, test, vi } from 'vitest'
vi.mock('../../state/auth', () => ({ auth: { value: {} } }))

import { ReapsSummary } from './index'

test('incomplete history preserves an explicit unavailable state without a fabricated total or verdict', () => {
  const root = document.createElement('div')
  act(() =>
    render(
      <ReapsSummary
        assessment={{ responses: [] } as unknown as Assessment}
        template={{ questions: [] } as unknown as QuestionnaireTemplate}
      />,
      root,
    ),
  )
  expect(root.textContent).toContain('Score unavailable')
  expect(root.textContent).toContain('Original answers are preserved')
  expect(root.textContent).not.toMatch(/0 \/ 60|Investigate|commend/)
  act(() => render(null, root))
})

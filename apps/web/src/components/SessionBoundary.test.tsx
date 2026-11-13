// @vitest-environment jsdom
import { useQueryClient } from '@tanstack/react-query'
import { render } from 'preact'
import { useState } from 'preact/hooks'
import { act } from 'preact/test-utils'
import { expect, test } from 'vitest'

import { queryClient, resetQuerySession } from '../state/queryClient'
import { useImportCelebration } from './ImportCelebrationProvider'
import { SessionBoundary } from './SessionBoundary'

function PrivateDraft() {
  const [draft, setDraft] = useState('')
  const client = useQueryClient()
  return (
    <>
      <input
        aria-label="Private draft"
        value={draft}
        onInput={(event) => setDraft(event.currentTarget.value)}
      />
      <p>{String(client.getQueryData(['private']) ?? 'empty')}</p>
    </>
  )
}

test('session boundary remounts private local state and provides only the replacement cache', () => {
  const container = document.createElement('div')
  document.body.append(container)
  queryClient.setQueryData(['private'], 'old account')
  act(() =>
    render(
      <SessionBoundary>
        <PrivateDraft />
      </SessionBoundary>,
      container,
    ),
  )
  const input = container.querySelector('input')
  if (!input) throw new Error('Missing draft')
  act(() => {
    input.value = 'private unfinished form'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(container.textContent).toContain('old account')
  act(() => resetQuerySession())
  expect(container.querySelector('input')?.value).toBe('')
  expect(container.textContent).toBe('empty')
  render(null, container)
  container.remove()
})

function ImportedRecord() {
  const celebrate = useImportCelebration()
  return <button onClick={celebrate}>Import complete</button>
}

test('session change removes a route-persistent import celebration', () => {
  const container = document.createElement('div')
  document.body.append(container)
  act(() =>
    render(
      <SessionBoundary>
        <ImportedRecord />
      </SessionBoundary>,
      container,
    ),
  )
  act(() => container.querySelector('button')?.click())
  expect(container.querySelector('.celebration-import')).not.toBeNull()
  act(() => resetQuerySession())
  expect(container.querySelector('.celebration-overlay')).toBeNull()
  act(() => render(null, container))
  container.remove()
})

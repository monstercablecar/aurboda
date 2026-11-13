// @vitest-environment jsdom
import type { PeopleGuidance, PeopleHelpTree, PeopleOptions } from '@aurboda/api-spec'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { fetchPeopleHelpTree } from '../../state/api/people'
import { HelpTree } from './HelpTree'
import { hasPositiveStatus } from './HelpTreeGraph'
vi.mock('../../state/api/people', () => ({ fetchPeopleHelpTree: vi.fn() }))
const guidance: PeopleGuidance = {
  id: 'g1',
  title: 'Listen together',
  relationship_types: ['friend'],
  min_age: 18,
  max_age: 120,
  age_unit: 'years',
  needs: ['support'],
  statuses: [],
  domains: ['connection'],
  priority: 1,
  guidance_type: 'relationship',
  summary: 'Ask what would help.',
  practical_actions: ['Listen without taking over.'],
  optional_metrics: ['check_in'],
  evidence_ids: ['s1'],
  evidence_class: 'practical',
  contraindications: [],
  review_interval: 30,
  version: '1',
  last_verified: '2026-11-12',
  jurisdiction: 'Global',
  active: true,
  interests: [],
  goals: [],
  recurring: true,
}
const tree: PeopleHelpTree = {
  guidance: Array.from({ length: 30 }, (_, i) => ({ ...guidance, id: `g${i}`, title: `Guidance ${i}` })),
  sources: [
    {
      id: 's1',
      publisher: 'Reference publisher',
      title: 'Evidence one',
      url: 'https://example.org/evidence',
      last_verified: '2026-11-12',
      applicable_population: 'Adults',
      evidence_category: 'ethical',
      limitations: [],
      licensing_status: 'Reference',
      verification_method: 'official_indexed_excerpt',
    },
  ],
  status_definitions: [
    {
      kind: 'anxious',
      label: 'Anxious',
      description: 'Support context',
      phases: [],
      supports_intensity: true,
      metric_ids: [],
      transition_kinds: [],
    },
  ],
  care_metric_definitions: [],
  milestone_definitions: [],
  care_ethics: { title: 'Care', summary: '', principles: [], evidence_ids: [] },
}
const options = {
  relationships: [
    { value: 'friend', label: 'Friend' },
    { value: 'spouse', label: 'Spouse' },
  ],
  statuses: [{ value: 'marriage_close', label: 'Honeymoon / feeling close', relationship_types: ['spouse'] }],
  status_definitions: tree.status_definitions,
} as PeopleOptions
let container: HTMLDivElement
let client: QueryClient
beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.mocked(fetchPeopleHelpTree).mockResolvedValue(tree)
})
afterEach(() => {
  render(null, container)
  container.remove()
  client.clear()
  vi.clearAllMocks()
})
const mount = async () => {
  act(() =>
    render(
      <QueryClientProvider client={client}>
        <HelpTree options={options} queryRoot={['test']} onClose={() => {}} />
      </QueryClientProvider>,
      container,
    ),
  )
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}
const button = (label: string) => {
  const result = [...container.querySelectorAll('button')].find((item) => item.textContent === label)
  if (!result) throw new Error(`Missing button ${label}`)
  return result
}
test('none excludes positive status requirements but retains exclusion-only rules and needs', () => {
  expect(hasPositiveStatus(guidance)).toBe(false)
  expect(hasPositiveStatus({ ...guidance, status_conditions: { exclude: ['anxious'] } })).toBe(false)
  expect(hasPositiveStatus({ ...guidance, status_conditions: { any: ['anxious'] } })).toBe(true)
  expect(hasPositiveStatus({ ...guidance, statuses: ['long_distance'] })).toBe(false)
})
test('graph bounds nodes, draws arrows, and node selection exposes actual evidence and guidance', async () => {
  await mount()
  expect(container.querySelectorAll('.help-graph-node').length).toBeLessThanOrEqual(24)
  expect(container.querySelector('path[marker-end]')).not.toBeNull()
  const node = container.querySelector<HTMLButtonElement>('[aria-label="guidance: Guidance 2"]')
  act(() => node?.click())
  expect(container.querySelector('.help-graph-inspector h2')?.textContent).toBe('Guidance 2')
  expect(container.textContent).toContain('Conditions and dependencies')
  act(() => container.querySelector<HTMLButtonElement>('[aria-label="source: Evidence one"]')?.click())
  expect(container.querySelector('.help-graph-inspector a')?.getAttribute('href')).toBe(
    'https://example.org/evidence',
  )
  expect(container.querySelector('.help-graph-inspector')?.textContent).toContain('Reference publisher')
  expect(container.querySelector('.help-graph-inspector')?.textContent).toContain('full page not verified')
  const search = container.querySelector<HTMLInputElement>('input[type=search]')
  act(() => {
    if (!search) throw new Error('Missing search')
    search.value = 'Guidance'
    search.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(container.querySelector('.help-graph-inspector h2')?.textContent).toBe('Guidance 0')
})
test('list view stays available and reset filters clears empty graph selection', async () => {
  await mount()
  act(() => button('List view').click())
  expect(container.querySelector('.help-atlas')).toBeNull()
  expect(button('Show more guidance')).toBeDefined()
  const search = container.querySelector<HTMLInputElement>('input[type=search]')
  act(() => {
    if (!search) throw new Error('Missing search input')
    search.value = 'missing'
    search.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(container.textContent).toContain('No matching guidance in this branch')
  act(() => button('Reset filters').click())
  act(() => button('Graph view').click())
  expect(container.querySelectorAll('.help-graph-node').length).toBeGreaterThan(0)
  act(() => button('No temporary status').click())
  expect(container.textContent).toContain('Exclusions and other conditions still apply')
})

test('graph exposes relationship contexts and clears them when changing relationship', async () => {
  await mount()
  act(() => button('Honeymoon / feeling close').click())
  expect(container.textContent).toContain('Honeymoon / feeling close')
  act(() => button('Friend').click())
  expect(
    [...container.querySelectorAll('button')].some(
      (item) => item.textContent === 'Honeymoon / feeling close',
    ),
  ).toBe(false)
})

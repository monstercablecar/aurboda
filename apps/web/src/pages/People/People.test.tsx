// @vitest-environment jsdom
import type {
  PeopleDashboard,
  PeopleOptions,
  Person,
  MatchedPeopleGuidance,
  PeopleEvent,
  PeopleEventBody,
} from '@aurboda/api-spec'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import axios from 'axios'
import { render } from 'preact'
import { LocationProvider } from 'preact-iso'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { fetchPeopleCalendar } from '../../state/api/people'
import { auth } from '../../state/auth'
import { PersonDashboard } from './Dashboard'
import { EventForm } from './EventForm'
import { HelpTree } from './HelpTree'
import { People } from './index'
import { PersonForm } from './PersonForm'
import { ProfileDetails } from './ProfileDetails'
import { RelationshipStates } from './RelationshipStates'
import { StatusEpisodeForm } from './StatusEpisodeForm'
import { StatusEpisodes } from './StatusEpisodes'

vi.mock('axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), isAxiosError: () => false },
}))

vi.mock('../../state/auth', async () => {
  const { signal } = await import('@preact/signals')
  return { auth: signal({ user: 'people-test', token: 'token' }) }
})

const relationships: Person['relationship'][] = ['child', 'parent', 'lover', 'spouse', 'friend']
const options: PeopleOptions = {
  date_kinds: [
    { value: 'birthday', label: 'Birthday' },
    { value: 'anniversary', label: 'Anniversary' },
    { value: 'other', label: 'Other significant date' },
  ],
  goal_statuses: [
    { value: 'active', label: 'Active' },
    { value: 'completed', label: 'Completed' },
    { value: 'paused', label: 'Paused' },
  ],
  genders: [
    { value: 'woman', label: 'Woman' },
    { value: 'man', label: 'Man' },
    { value: 'nonbinary', label: 'Nonbinary' },
    { value: 'self_described', label: 'Self-described' },
    { value: 'prefer_not_to_say', label: 'Prefer not to say' },
  ],
  relationships: relationships.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) })),
  needs: Object.fromEntries(
    relationships.map((value) => [value, [{ value: `${value}_baseline`, label: `${value} server context` }]]),
  ),
  statuses: [{ value: 'status', label: 'Server circumstance' }],
  age_units: [
    { value: 'months', label: 'Months' },
    { value: 'years', label: 'Years' },
  ],
  event_types: [
    { value: 'contact', label: 'Meaningful contact' },
    { value: 'goal', label: 'Goal' },
    { value: 'feeding', label: 'Feeding' },
    { value: 'journal', label: 'Add journal entry' },
    { value: 'memory', label: 'Add memory' },
  ],
  event_fields: {
    contact: ['note'],
    goal: ['title', 'note', 'goal_status', 'target_date'],
    feeding: ['note', 'value', 'unit'],
    journal: ['title', 'location', 'note'],
    memory: ['title', 'location', 'note'],
  },
  observation_states: [],
  time_kinds: [],
  guidance_types: [],
  life_stages: [],
  topics: [{ value: 'sleep', label: 'Sleep' }],
}
const person = (relationship: Person['relationship']): Person => ({
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Test person',
  relationship,
  approximate_age: { value: 3, unit: 'months', as_of: '2026-11-11' },
  needs: [`${relationship}_baseline`],
  statuses: [],
  goals: [],
  interests: [],
  notes: '',
  corrected_age_weeks: 0,
  enabled_metrics: [],
  hidden_modules: [],
  created_at: '2026-11-11T00:00:00Z',
  updated_at: '2026-11-11T00:00:00Z',
})
const dashboard = (relationship: Person['relationship']): PeopleDashboard => ({
  person: person(relationship),
  context: {
    age_days: 90,
    age_months: 3,
    age_years: 0,
    developmental_age_months: 3,
    age_display: 'Server age label',
    life_stage: 'server_stage',
    focus: `Server focus for ${relationship}`,
    approximate: true,
    previous_checklist_months: null,
    next_checklist_months: null,
  },
  modules: [
    {
      id: 'server_module',
      title: 'Server reference area',
      description: 'Chosen by the server',
      hideable: true,
    },
  ],
  available_modules: [
    { id: 'server_module', title: 'Server reference area', description: 'Chosen by server', hideable: true },
  ],
  metrics: [],
  goals: [],
  current_guidance: [],
  contextual_guidance: [contextualGuidance],
  important_dates: [],
  practical_opportunities: [],
  developmental_context: [],
  upcoming: [],
  upcoming_events: [],
  recent_activity: [],
  sources: [],
  shared_time_minutes: 0,
  guidance_count: 0,
  event_types: [{ value: 'contact', label: 'Server selected action' }],
  reminders_available: false,
})
const contextualGuidance: MatchedPeopleGuidance = {
  id: 'contextual-fixture',
  title: 'Server contextual resource',
  relationship_types: ['friend'],
  genders: ['woman'],
  min_age: 18,
  max_age: 120,
  age_unit: 'years',
  needs: [],
  statuses: [],
  domains: ['support'],
  priority: 10,
  guidance_type: 'resource',
  summary: 'Resource chosen by the server.',
  practical_actions: [],
  optional_metrics: [],
  evidence_ids: [],
  evidence_class: 'educational_guidance',
  contraindications: [],
  review_interval: 365,
  version: '1',
  last_verified: '2026-11-12',
  jurisdiction: 'Global',
  active: true,
  interests: [],
  goals: [],
  recurring: true,
  reasons: ['Matched context returned by the server.'],
}
let container: HTMLDivElement
let client: QueryClient
beforeEach(() => {
  vi.resetAllMocks()
  auth.value = { user: 'people-test', token: 'token' }
  window.history.replaceState({}, '', '/people')
  container = document.createElement('div')
  document.body.append(container)
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})
afterEach(() => {
  render(null, container)
  container.remove()
  client.clear()
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}
const findButton = (text: string) =>
  [...container.querySelectorAll('button')].find((node) => node.textContent === text)

const button = (text: string) => {
  const element = findButton(text)
  if (!element) throw new Error(`Missing button: ${text}`)
  return element
}
const element = <T extends Element = HTMLInputElement>(selector: string): T => {
  const found = container.querySelector<T>(selector)
  if (!found) throw new Error(`Missing element: ${selector}`)
  return found
}
const submit = () =>
  act(() => {
    element<HTMLFormElement>('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })

const field = (labelText: string) => {
  const label = [...container.querySelectorAll('label')].find((item) =>
    item.textContent?.trim().startsWith(labelText),
  )
  const input = label?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    'input,select,textarea',
  )
  if (!input) throw new Error(`Missing field: ${labelText}`)
  return input
}
const writeField = (labelText: string, value: string) =>
  act(() => {
    const input = field(labelText)
    input.value = value
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })

describe('People presentation', () => {
  test('a fresh account has the exact empty state and no fake dashboard', async () => {
    vi.mocked(axios.get).mockImplementation(async (url) => ({
      data: { success: true, data: String(url).endsWith('/options') ? options : [] },
    }))
    act(() =>
      render(
        <QueryClientProvider client={client}>
          <LocationProvider>
            <People />
          </LocationProvider>
        </QueryClientProvider>,
        container,
      ),
    )
    await settle()
    expect(container.textContent).toContain(
      'Add someone to begin tracking what matters, exploring age-appropriate guidance, and maintaining meaningful relationships.',
    )
    expect(button('Add Person')).toBeDefined()
    expect(container.textContent).not.toContain('What matters')
    act(() => button('Add Person').click())
    expect(container.querySelector('form')).not.toBeNull()
    expect(container.querySelectorAll('select')[0].options.length).toBe(6)
  })

  test.each(relationships)(
    '%s uses server-selected focus, modules, age and actions without age inference',
    (relationship) => {
      act(() =>
        render(
          <QueryClientProvider client={client}>
            <PersonDashboard
              dashboard={dashboard(relationship)}
              options={options}
              sources={[]}
              queryRoot={['people', 'test']}
              onEdit={() => {}}
            />
          </QueryClientProvider>,
          container,
        ),
      )
      expect(container.textContent).toContain(`Server focus for ${relationship}`)
      expect(container.textContent).toContain('Server age label')
      expect(container.textContent).toContain('Server contextual resource')
      expect(container.textContent).toContain('Matched context returned by the server.')
      expect(container.textContent).toContain('Server reference area')
      expect(button('Server selected action')).toBeDefined()
      expect(button('Add goal')).toBeDefined()
      expect(findButton('Feeding')).toBeUndefined()
      expect(container.textContent).not.toContain('0 minutes')
    },
  )

  test('setup uses server needs and preserves age reference date on edit', () => {
    const save = vi.fn()
    act(() =>
      render(
        <PersonForm
          person={person('friend')}
          options={options}
          saving={false}
          error={null}
          onSave={save}
          onCancel={() => {}}
        />,
        container,
      ),
    )
    expect(container.textContent).toContain('friend server context')
    expect(container.textContent).not.toContain('child server context')
    submit()
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        relationship: 'friend',
        approximate_age: { value: 3, unit: 'months', as_of: '2026-11-11' },
      }),
    )
  })

  test('server metadata controls fields for supported numeric event types', () => {
    const customOptions = { ...options, event_fields: { feeding: ['value', 'unit'] } }
    const save = vi.fn()
    act(() =>
      render(
        <EventForm
          type="feeding"
          options={customOptions}
          saving={false}
          error={null}
          onSave={save}
          onCancel={() => {}}
        />,
        container,
      ),
    )
    expect(container.querySelector('input[type=number]')).not.toBeNull()
    expect(container.textContent).not.toContain('End time')
    expect(container.textContent).not.toContain('Observation')
  })

  test('CDC previous and upcoming labels use server checklist ages', () => {
    const data = dashboard('child')
    data.context.previous_checklist_months = 2
    data.context.next_checklist_months = 4
    act(() =>
      render(
        <QueryClientProvider client={client}>
          <PersonDashboard
            dashboard={data}
            options={options}
            sources={[]}
            queryRoot={['people', 'test']}
            onEdit={() => {}}
          />
        </QueryClientProvider>,
        container,
      ),
    )
    expect(container.textContent).toContain('Previous CDC checklist context: 2 months.')
    expect(container.textContent).toContain('Upcoming CDC checklist: 4 months.')
    expect(container.textContent).not.toContain('3-month checklist')
  })
  test('add, edit and confirmed deletion send the profile changes and return to empty state', async () => {
    let saved: Person | undefined
    vi.mocked(axios.get).mockImplementation(async (url) => {
      const path = String(url)
      if (path.endsWith('/options')) return { data: { success: true, data: options } }
      if (path.endsWith('/dashboard')) {
        return { data: { success: true, data: { ...dashboard('child'), person: saved } } }
      }
      if (path.endsWith('/sources')) return { data: { success: true, data: [] } }
      return { data: { success: true, data: saved ? [saved] : [] } }
    })
    vi.mocked(axios.post).mockImplementation(async (_url, body) => {
      saved = { ...person('child'), ...(body as object) }
      return { data: { success: true, data: saved } }
    })
    vi.mocked(axios.patch).mockImplementation(async (_url, body) => {
      saved = { ...person('child'), ...saved, ...(body as object) }
      return { data: { success: true, data: saved } }
    })
    vi.mocked(axios.delete).mockImplementation(async () => {
      saved = undefined
      return { data: { success: true, data: { id: person('child').id } } }
    })
    act(() =>
      render(
        <QueryClientProvider client={client}>
          <LocationProvider>
            <People />
          </LocationProvider>
        </QueryClientProvider>,
        container,
      ),
    )
    await settle()
    act(() => button('Add Person').click())
    const input = (inputElement: HTMLInputElement | HTMLSelectElement, value: string) =>
      act(() => {
        inputElement.value = value
        inputElement.dispatchEvent(
          new Event(inputElement instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }),
        )
      })
    input(element('input'), 'New person')
    input(element<HTMLSelectElement>('select'), 'child')
    input(element('input[type=number]'), '3')
    input(container.querySelectorAll('select')[2], 'months')
    act(() => element<HTMLInputElement>('input[type=checkbox]').click())
    submit()
    await settle()
    await settle()
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/people'),
      expect.objectContaining({
        name: 'New person',
        relationship: 'child',
        needs: ['child_baseline'],
        approximate_age: expect.objectContaining({ value: 3, unit: 'months' }),
      }),
      expect.any(Object),
    )
    act(() => button('Edit / settings').click())
    input(element('input[type=number]'), '9')
    input(container.querySelectorAll('select')[2], 'years')
    submit()
    await settle()
    await settle()
    expect(axios.patch).toHaveBeenCalledWith(
      expect.stringContaining(person('child').id),
      expect.objectContaining({ approximate_age: expect.objectContaining({ value: 9, unit: 'years' }) }),
      expect.any(Object),
    )
    act(() => button('Edit / settings').click())
    act(() => button('Delete Person').click())
    expect(container.querySelector('[role=alertdialog]')?.textContent).toContain('events, notes, preferences')
    expect(axios.delete).not.toHaveBeenCalled()
    act(() => button('Permanently delete person').click())
    await settle()
    await settle()
    expect(axios.delete).toHaveBeenCalledOnce()
    expect(button('Add Person')).toBeDefined()
  })

  test('reminders require an explicit opt-in and send a timezone-aware instant', () => {
    const save = vi.fn()
    act(() =>
      render(
        <EventForm
          type="contact"
          options={options}
          remindersAvailable
          saving={false}
          error={null}
          onSave={save}
          onCancel={() => {}}
        />,
        container,
      ),
    )
    const checkbox = element<HTMLInputElement>('input[type=checkbox]')
    expect(checkbox.checked).toBe(false)
    act(() => checkbox.click())
    const times = container.querySelectorAll<HTMLInputElement>('input[type=datetime-local]')
    act(() => {
      times[1].value = '2027-01-02T15:30'
      times[1].dispatchEvent(new Event('input', { bubbles: true }))
    })
    submit()
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        reminder_at: new Date('2027-01-02T15:30').toISOString(),
        reminder_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    )
    act(() => checkbox.click())
    submit()
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ reminder_at: null, reminder_timezone: null }),
    )
  })

  test('unavailable reminders are explained and cannot be enabled', () => {
    act(() =>
      render(
        <EventForm
          type="contact"
          options={options}
          saving={false}
          error={null}
          onSave={() => {}}
          onCancel={() => {}}
        />,
        container,
      ),
    )
    expect(element<HTMLInputElement>('input[type=checkbox]').disabled).toBe(true)
    expect(container.textContent).toContain('server scheduler and browser notifications')
  })
  test('important dates add an unknown-year birthday without inventing a year and can be removed', () => {
    const save = vi.fn()
    act(() =>
      render(
        <PersonForm
          person={person('friend')}
          options={options}
          saving={false}
          error={null}
          onSave={save}
          onCancel={() => {}}
        />,
        container,
      ),
    )
    expect(container.querySelectorAll('.people-date-row')).toHaveLength(0)
    act(() => button('Add important date').click())
    writeField('Label', 'Birthday')
    writeField('Month', '2')
    writeField('Day', '29')
    writeField('Date kind', 'birthday')
    submit()
    expect(save.mock.lastCall?.[0].important_dates).toEqual([
      {
        id: expect.any(String),
        label: 'Birthday',
        kind: 'birthday',
        month: 2,
        day: 29,
        recurs_annually: true,
      },
    ])
    expect(save.mock.lastCall?.[0].date_of_birth).toBeNull()
    act(() => button('Remove date').click())
    submit()
    expect(save.mock.lastCall?.[0].important_dates).toEqual([])
  })

  test('once-only important dates require a year and individual rows stay independently editable', () => {
    const save = vi.fn()
    act(() =>
      render(
        <PersonForm
          person={person('friend')}
          options={options}
          saving={false}
          error={null}
          onSave={save}
          onCancel={() => {}}
        />,
        container,
      ),
    )
    act(() => button('Add important date').click())
    writeField('Label', 'Graduation')
    writeField('Month', '6')
    writeField('Day', '15')
    act(() => (field('Repeats every year') as HTMLInputElement).click())
    expect((field('Year') as HTMLInputElement).required).toBe(true)
    writeField('Year', '2030')
    act(() => button('Add important date').click())
    const rows = container.querySelectorAll('.people-date-row')
    expect(rows).toHaveLength(2)
    act(() => rows[1].querySelector('button')?.click())
    submit()
    expect(save.mock.lastCall?.[0].important_dates).toEqual([
      { id: expect.any(String), label: 'Graduation', month: 6, day: 15, year: 2030, recurs_annually: false },
    ])
  })

  test('clearing identity preserves how-we-met, dates and all unrelated optional profile fields', () => {
    const save = vi.fn()
    const profile = {
      ...person('spouse'),
      gender: { identity: 'woman' as const, pronouns: 'she/her' },
      met: { place: 'Library', date: '2010-01-01', story: 'We talked about books.' },
      important_dates: [
        {
          id: '00000000-0000-4000-8000-000000000002',
          label: 'Anniversary',
          month: 1,
          day: 1,
          year: 2010,
          recurs_annually: true,
        },
      ],
      notes: 'Private profile note',
      interests: ['Books'],
    }
    act(() =>
      render(
        <PersonForm
          person={profile}
          options={options}
          saving={false}
          error={null}
          onSave={save}
          onCancel={() => {}}
        />,
        container,
      ),
    )
    writeField('Gender', '')
    submit()
    expect(save.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        gender: null,
        met: profile.met,
        important_dates: profile.important_dates,
        notes: profile.notes,
        interests: profile.interests,
      }),
    )
    act(() => button('Clear how we met').click())
    submit()
    expect(save.mock.lastCall?.[0].met).toBeNull()
  })

  test('clearing each how-we-met field removes the empty optional section', () => {
    const save = vi.fn()
    act(() =>
      render(
        <PersonForm
          person={{ ...person('friend'), met: { place: 'Park', date: '2015-06-01', story: 'At a picnic.' } }}
          options={options}
          saving={false}
          error={null}
          onSave={save}
          onCancel={() => {}}
        />,
        container,
      ),
    )
    writeField('Where we met', '')
    writeField('When we met', '')
    writeField('Our story', '')
    submit()
    expect(save.mock.lastCall?.[0].met).toBeNull()
  })

  test.each(['journal', 'memory'] as const)(
    '%s records editable title, place and private multiline text from server field metadata',
    (type) => {
      const save = vi.fn()
      act(() =>
        render(
          <EventForm
            type={type}
            options={options}
            saving={false}
            error={null}
            onSave={save}
            onCancel={() => {}}
          />,
          container,
        ),
      )
      writeField('Title', 'A good conversation')
      writeField('Location', 'Riverside park')
      writeField('Notes', 'First line\nSecond line')
      submit()
      expect(save.mock.lastCall?.[0]).toEqual(
        expect.objectContaining({
          type,
          source: 'manual',
          payload: expect.objectContaining({
            title: 'A good conversation',
            location: 'Riverside park',
            note: 'First line\nSecond line',
          }),
        }),
      )
      expect(container.textContent).not.toContain('Value (optional)')
    },
  )

  test('saved journal entries can clear metadata and use the existing deletion action', () => {
    const save = vi.fn()
    const remove = vi.fn()
    const entry: PeopleEvent = {
      id: '00000000-0000-4000-8000-000000000003',
      person_id: person('friend').id,
      actor: 'people-test',
      type: 'journal',
      timestamp: '2026-11-12T12:00:00.000Z',
      recorded_at: '2026-11-12T12:00:00.000Z',
      updated_at: '2026-11-12T12:00:00.000Z',
      privacy: 'private',
      source: 'manual',
      revision: 1,
      payload: { title: 'Original title', location: 'Original place', note: 'Keep this text' },
    }
    act(() =>
      render(
        <EventForm
          type="journal"
          event={entry}
          options={options}
          saving={false}
          error={null}
          onSave={save}
          onCancel={() => {}}
          onDelete={remove}
        />,
        container,
      ),
    )
    writeField('Title', '')
    writeField('Location', '')
    submit()
    expect(save.mock.lastCall?.[0].payload).toEqual(
      expect.objectContaining({ title: '', location: '', note: 'Keep this text' }),
    )
    act(() => button('Delete entry').click())
    expect(remove).toHaveBeenCalledOnce()
  })

  test('date-only displays preserve exact server dates and do not calculate birthday years or countdowns', () => {
    const data = dashboard('friend')
    data.person.met = { date: '2010-01-01', place: 'Library' }
    data.important_dates = [
      {
        id: 'date-fixture',
        label: 'Birthday',
        kind: 'birthday',
        month: 2,
        day: 29,
        recurs_annually: true,
        source: 'profile',
        next_occurrence: '2030-02-28',
        days_until: 123,
        anniversary_number: null,
        ideas: ['Ask how they would like to mark the day.'],
      },
    ]
    act(() => render(<ProfileDetails dashboard={data} options={options} />, container))
    expect([...container.querySelectorAll('time')].map((node) => [node.textContent, node.dateTime])).toEqual([
      ['2010-01-01', '2010-01-01'],
      ['2030-02-28', '2030-02-28'],
    ])
    expect(container.textContent).toContain('123 days away')
    expect(container.textContent).toContain('Ideas for this date')
    expect(container.textContent).toContain('Ask how they would like to mark the day.')
    expect(container.querySelector('a')?.getAttribute('href')).toContain('/timeline#from=2030-02-28')
    const googleLink = [...container.querySelectorAll('a')].find(
      (link) => link.textContent === 'Add to Google Calendar',
    )
    expect(googleLink?.target).toBe('_blank')
    expect(googleLink?.rel).toBe('noopener noreferrer')
    expect(container.textContent).toContain("Changes here won't update the Google copy.")
    expect(container.textContent).toContain('year not recorded')
    expect(container.textContent).not.toContain('At next occurrence:')
    data.important_dates[0] = {
      ...data.important_dates[0],
      year: 2030,
      recurs_annually: false,
      anniversary_number: 0,
    }
    act(() => render(<ProfileDetails dashboard={data} options={options} />, container))
    expect(container.textContent).not.toContain('At next occurrence:')
  })
  test('enabling the goal metric exposes Add goal without creating data, then saves and edits a goal', async () => {
    let data = dashboard('parent')
    data.metrics = [
      {
        id: 'goals',
        label: 'Goals',
        unit: 'goals',
        event_type: 'goal',
        enabled: false,
        value: null,
        description: 'Count of recorded goals. Add or edit goals in the Goals panel.',
      },
    ]
    window.history.replaceState({}, '', `/people?person=${data.person.id}`)
    vi.mocked(axios.get).mockImplementation(async (url) => {
      const path = String(url)
      if (path.endsWith('/options')) return { data: { success: true, data: options } }
      if (path.endsWith('/dashboard')) return { data: { success: true, data } }
      if (path.endsWith('/sources')) return { data: { success: true, data: [] } }
      return { data: { success: true, data: [data.person] } }
    })
    vi.mocked(axios.patch).mockImplementation(async (url, body) => {
      if (String(url).includes('/events/')) {
        const entry = { ...data.goals[0], ...(body as object), revision: data.goals[0].revision + 1 }
        data = { ...data, goals: [entry] }
        return { data: { success: true, data: entry } }
      }
      data = {
        ...data,
        person: { ...data.person, enabled_metrics: ['goals'] },
        metrics: data.metrics.map((metric) => ({ ...metric, enabled: true })),
      }
      return { data: { success: true, data: data.person } }
    })
    vi.mocked(axios.post).mockImplementation(async (_url, body) => {
      const entry: PeopleEvent = {
        id: '00000000-0000-4000-8000-000000000009',
        person_id: data.person.id,
        actor: 'people-test',
        recorded_at: '2026-11-12T12:00:00Z',
        updated_at: '2026-11-12T12:00:00Z',
        privacy: 'private',
        revision: 1,
        ...(body as PeopleEventBody),
      }
      data = { ...data, goals: [entry], metrics: data.metrics.map((metric) => ({ ...metric, value: 1 })) }
      return { data: { success: true, data: entry } }
    })
    const scroll = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll })
    act(() =>
      render(
        <QueryClientProvider client={client}>
          <LocationProvider>
            <People />
          </LocationProvider>
        </QueryClientProvider>,
        container,
      ),
    )
    await settle()
    await settle()
    act(() => (field('Goals') as HTMLInputElement).click())
    await settle()
    await settle()
    expect(axios.post).not.toHaveBeenCalled()
    const card = [...container.querySelectorAll('.people-grid > div')].find(
      (item) => item.querySelector('h3')?.textContent === 'Goals',
    )
    expect(card?.textContent).toContain('No goals yet')
    const addFromMetric = card?.querySelector('button')
    expect(addFromMetric?.textContent).toBe('Add goal')
    act(() => addFromMetric?.click())
    expect(field('Goal')).toBe(document.activeElement)
    expect(scroll).toHaveBeenCalledOnce()
    expect((field('Goal') as HTMLInputElement).required).toBe(true)
    writeField('Goal', 'Walk together each week')
    writeField('Notes', 'Start with a short route.')
    writeField('Target date', '2027-02-01')
    act(() => {
      field('Notes').focus()
      addFromMetric?.click()
    })
    expect(scroll).toHaveBeenCalledTimes(2)
    expect(field('Goal')).toBe(document.activeElement)
    expect(field('Goal').value).toBe('Walk together each week')
    expect(button('Save goal')).toBeDefined()
    submit()
    await settle()
    await settle()
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/events'),
      expect.objectContaining({
        type: 'goal',
        payload: expect.objectContaining({
          title: 'Walk together each week',
          note: 'Start with a short route.',
          goal_status: 'active',
          target_date: '2027-02-01',
        }),
      }),
      expect.any(Object),
    )
    expect(container.textContent).toContain('Walk together each week')
    expect(container.textContent).toContain('Status: Active')
    expect(container.querySelector('time[datetime="2027-02-01"]')?.textContent).toBe('2027-02-01')
    act(() => button('Edit goal').click())
    writeField('Goal status', 'completed')
    vi.mocked(axios.patch).mockRejectedValueOnce(new Error('Save failed'))
    submit()
    await settle()
    expect(container.querySelector('.celebration-overlay')).toBeNull()
    submit()
    await settle()
    await settle()
    expect(container.textContent).toContain('Status: Completed')
    expect(container.querySelector('.celebration-goal-complete')).not.toBeNull()
    act(() => container.querySelector<HTMLButtonElement>('.celebration-dismiss')?.click())
    act(() => button('Edit goal').click())
    writeField('Notes', 'A completed goal correction')
    submit()
    await settle()
    await settle()
    expect(container.querySelector('.celebration-overlay')).toBeNull()
    act(() => button('Edit goal').click())
    writeField('Goal status', 'active')
    writeField('Target date', '')
    submit()
    await settle()
    await settle()
    expect(data.goals[0].payload).toEqual(
      expect.objectContaining({ goal_status: 'active', note: 'A completed goal correction' }),
    )
    expect(data.goals[0].payload.target_date).toBeUndefined()
    expect(container.textContent).toContain('Status: Active')
  })

  test('legacy note-only goals remain editable without requiring a newly invented title', () => {
    const save = vi.fn()
    const entry: PeopleEvent = {
      id: '00000000-0000-4000-8000-000000000010',
      person_id: person('friend').id,
      actor: 'people-test',
      type: 'goal',
      timestamp: '2026-11-12T12:00:00Z',
      recorded_at: '2026-11-12T12:00:00Z',
      updated_at: '2026-11-12T12:00:00Z',
      privacy: 'private',
      source: 'manual',
      revision: 1,
      payload: { note: 'Learn to cook together', location: 'Kitchen' },
    }
    act(() =>
      render(
        <EventForm
          type="goal"
          event={entry}
          options={options}
          saving={false}
          error={null}
          onSave={save}
          onCancel={() => {}}
        />,
        container,
      ),
    )
    expect((field('Goal') as HTMLInputElement).required).toBe(false)
    expect(field('Goal status').value).toBe('active')
    writeField('Goal status', 'paused')
    writeField('Target date', '2027-03-02')
    submit()
    expect(save.mock.lastCall?.[0].payload).toEqual(
      expect.objectContaining({
        title: '',
        note: 'Learn to cook together',
        location: 'Kitchen',
        goal_status: 'paused',
        target_date: '2027-03-02',
      }),
    )
  })

  test('rolling-update goal list falls back to recent goals and displays their note and default status', () => {
    const data = dashboard('friend')
    delete (data as Partial<PeopleDashboard>).goals
    data.recent_activity = [
      {
        id: '00000000-0000-4000-8000-000000000011',
        person_id: data.person.id,
        actor: 'people-test',
        type: 'goal',
        timestamp: '2026-11-12T12:00:00Z',
        recorded_at: '2026-11-12T12:00:00Z',
        updated_at: '2026-11-12T12:00:00Z',
        privacy: 'private',
        source: 'manual',
        revision: 1,
        payload: { note: 'Meet for a walk' },
      },
    ]
    act(() =>
      render(
        <QueryClientProvider client={client}>
          <PersonDashboard
            dashboard={data}
            options={options}
            sources={[]}
            queryRoot={['people', 'test']}
            onEdit={() => {}}
          />
        </QueryClientProvider>,
        container,
      ),
    )
    expect(container.textContent).toContain('Meet for a walk')
    expect(container.textContent).toContain('Status: Active')
    expect(button('Edit goal')).toBeDefined()
  })
  test('People calendar API adapter sends the private auth header and explicit inclusive range', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { success: true, data: [] } })
    await expect(fetchPeopleCalendar({ from: '2030-01-01', to: '2030-01-31' })).resolves.toEqual([])
    expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/people/calendar'), {
      headers: { Authorization: 'Bearer token' },
      params: { from: '2030-01-01', to: '2030-01-31' },
    })
  })
})

describe('server child guide additions', () => {
  test('keeps every guide record reachable and safety actions expanded without feedback', () => {
    const data = dashboard('child')
    const safety = {
      ...contextualGuidance,
      id: 'safe',
      title: 'Safe care',
      practical_actions: ['Visible safety action'],
      contraindications: ['Visible qualification'],
    }
    const play = Array.from({ length: 4 }, (_, i) => ({
      ...contextualGuidance,
      id: `play-${i}`,
      title: `Play idea ${i}`,
    }))
    data.child_guide = {
      title: 'Server child guide',
      introduction: 'Everyday connection',
      groups: [
        { id: 'play', title: 'Try together', description: 'Optional play', records: play },
        { id: 'safety', title: 'Safety first', description: 'Keep visible', records: [safety] },
      ],
    }
    data.current_guidance = [safety, play[0]]
    data.practical_opportunities = [play[1]]
    act(() =>
      render(
        <QueryClientProvider client={client}>
          <PersonDashboard
            dashboard={data}
            options={options}
            sources={[]}
            queryRoot={['test']}
            onEdit={() => {}}
          />
        </QueryClientProvider>,
        container,
      ),
    )
    const cards = [...container.querySelectorAll('.people-child-group .people-guidance')]
    expect(cards).toHaveLength(5)
    expect(container.querySelector('a[href="#people-metrics"]')).not.toBeNull()
    expect(container.querySelector('#people-metrics')).not.toBeNull()
    expect(cards[0].textContent).toContain('Safe care')
    expect(cards[0].querySelector('button')).toBeNull()
    expect(cards[0].querySelector('details')?.textContent).not.toContain('Visible safety action')
    expect(cards[0].textContent).toContain('Visible qualification')
    expect([...container.querySelectorAll('h3')].filter((h) => h.textContent === 'Play idea 0')).toHaveLength(
      1,
    )
  })

  test('shows exact attributed source quotation and server metric timeframe', () => {
    const data = dashboard('child')
    data.current_guidance = [{ ...contextualGuidance, evidence_ids: ['official'] }]
    data.metrics = [
      {
        id: 'observations',
        label: 'Observations',
        unit: 'entries',
        event_type: 'diaper',
        enabled: true,
        value: 0,
        description: 'Recorded entries only.',
        window: 'last_24_hours',
        window_label: 'Past 24 hours',
        last_recorded_at: '2026-11-11T12:00:00Z',
      },
    ]
    act(() =>
      render(
        <QueryClientProvider client={client}>
          <PersonDashboard
            dashboard={data}
            options={options}
            sources={[
              {
                id: 'official',
                publisher: 'Official publisher',
                title: 'Source title',
                url: 'https://example.org/source',
                applicable_population: 'Children',
                evidence_category: 'guidance',
                limitations: [],
                licensing_status: 'Short quotation',
                last_verified: '2026-11-12',
                review_date: '2025-01-01',
                official_quote: { text: 'Exact <source> wording.', section: 'Care' },
              },
            ]}
            queryRoot={['test']}
            onEdit={() => {}}
          />
        </QueryClientProvider>,
        container,
      ),
    )
    expect(element('blockquote').textContent).toBe('Exact <source> wording.')
    expect(element('blockquote').getAttribute('cite')).toBe('https://example.org/source')
    expect(container.textContent).toContain('Source checked: 2026-11-12')
    expect(container.textContent).toContain('Publisher reviewed: 2025-01-01')
    expect(container.textContent).toContain('Past 24 hours')
    expect(container.textContent).toContain('Last recorded:')
    expect(container.textContent).toContain('0 entries')
    act(() => button('Record diaper').click())
    expect(container.querySelector('form')).not.toBeNull()
  })

  test('allows optional classifications to be cleared while preserving legacy values and units', () => {
    const save = vi.fn()
    const event: PeopleEvent = {
      id: 'entry',
      person_id: 'person',
      type: 'growth',
      timestamp: '2026-11-11T12:00:00Z',
      source: 'manual',
      payload: { measurement_type: 'weight', value: 4, unit: 'kg', note: 'Existing' },
      actor: 'test',
      privacy: 'private',
      recorded_at: '2026-11-11T12:00:00Z',
      updated_at: '2026-11-11T12:00:00Z',
      revision: 1,
    }
    act(() =>
      render(
        <EventForm
          type="growth"
          event={event}
          options={{
            ...options,
            event_fields: { growth: ['measurement_type', 'value', 'unit'] },
            measurement_types: [{ value: 'weight', label: 'Weight' }],
          }}
          saving={false}
          error={null}
          onSave={save}
          onCancel={() => {}}
        />,
        container,
      ),
    )
    const select = element<HTMLSelectElement>('select')
    act(() => {
      select.value = ''
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    act(() => {
      element('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(save.mock.calls[0][0].payload).toMatchObject({ value: 4, unit: 'kg', measurement_type: undefined })
  })
})

test('records optional diaper classification using server choices', () => {
  const save = vi.fn()
  act(() =>
    render(
      <EventForm
        type="diaper"
        options={{
          ...options,
          event_fields: { diaper: ['diaper_type'] },
          diaper_types: [{ value: 'mixed', label: 'Wet and dirty' }],
        }}
        saving={false}
        error={null}
        onSave={save}
        onCancel={() => {}}
      />,
      container,
    ),
  )
  const select = element<HTMLSelectElement>('select')
  expect(select.value).toBe('')
  act(() => {
    select.value = 'mixed'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  act(() => {
    element('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  expect(save.mock.calls[0][0].payload.diaper_type).toBe('mixed')
})

test('metric empty states distinguish status and recent periods while preserving numeric zero', () => {
  const data = dashboard('child')
  const base = {
    id: 'active',
    label: 'Active goals',
    unit: 'goals',
    event_type: 'goal' as const,
    enabled: true,
    value: null,
    description: 'Recorded entries only.',
  }
  data.metrics = [
    { ...base, window: 'current_state' },
    { ...base, id: 'recent', window: 'last_24_hours', event_type: 'feeding' },
    { ...base, id: 'zero', window: 'current_state', value: 0 },
  ]
  act(() =>
    render(
      <QueryClientProvider client={client}>
        <PersonDashboard
          dashboard={data}
          options={options}
          sources={[]}
          queryRoot={['test']}
          onEdit={() => {}}
        />
      </QueryClientProvider>,
      container,
    ),
  )
  expect([...container.querySelectorAll('.people-stat')].map((item) => item.textContent)).toEqual([
    'No matching goal entries',
    'No entries in this period',
    '0 goals',
  ])
})

const careOptions: PeopleOptions = {
  ...options,
  status_definitions: [
    {
      kind: 'pregnant',
      label: 'Pregnant',
      description: 'Optional pregnancy context',
      phases: [{ value: 'third_trimester', label: 'Third trimester' }],
      supports_intensity: false,
      metric_ids: ['mood', 'check_in'],
      transition_kinds: ['postpartum'],
    },
    {
      kind: 'anxious',
      label: 'Anxious',
      description: 'Support preferences',
      phases: [],
      supports_intensity: true,
      metric_ids: ['mood'],
      transition_kinds: [],
    },
    {
      kind: 'postpartum',
      label: 'Postpartum',
      description: 'Postpartum support',
      phases: [],
      supports_intensity: false,
      metric_ids: ['check_in'],
      transition_kinds: [],
    },
  ],
  care_metric_definitions: [
    {
      id: 'mood',
      label: 'Shared mood',
      description: 'Only what they choose to share.',
      status_kinds: ['pregnant', 'anxious'],
      value_kind: 'rating',
      unit: 'rating',
      min: 0,
      max: 10,
      sensitive: true,
      allowed_sources: ['self_shared', 'clinical_shared'],
    },
  ],
  event_fields: {
    ...options.event_fields,
    observation: ['value', 'unit', 'observation', 'status_episode_id', 'care_metric', 'information_source'],
  },
}
const careEpisode: NonNullable<Person['status_episodes']>[number] = {
  id: 'd4ccbe42-d538-47ab-81f9-a284da5ce163',
  kind: 'pregnant',
  lifecycle: 'active',
  start_date: '2026-10-01',
  information_source: 'self_shared',
  tracking_agreed: false,
}

describe('care circumstances and help tree', () => {
  test('pregnancy timing and outcome remain optional and never infer a transition', () => {
    const save = vi.fn()
    act(() =>
      render(
        <StatusEpisodeForm
          episode={careEpisode}
          options={careOptions}
          saving={false}
          onSave={save}
          onCancel={() => {}}
        />,
        container,
      ),
    )
    expect(field('Pregnancy timing').value).toBe('')
    expect(container.textContent).toContain('For adults, ask their permission.')
    expect(container.textContent).toContain('involve them as their understanding grows.')
    expect(container.textContent).not.toContain('Pregnancy outcome')
    expect(
      (field('Appropriate agreement for optional sensitive tracking is in place') as HTMLInputElement)
        .checked,
    ).toBe(false)
    submit()
    expect(save.mock.calls[0][0]).toMatchObject({
      lifecycle: 'active',
      tracking_agreed: false,
      estimated_due_date: undefined,
      outcome: undefined,
    })
    act(() =>
      render(
        <StatusEpisodeForm
          key="resolved"
          episode={{ ...careEpisode, lifecycle: 'resolved' }}
          options={careOptions}
          saving={false}
          onSave={save}
          onCancel={() => {}}
        />,
        container,
      ),
    )
    expect(field('Pregnancy outcome').value).toBe('')
    expect(field('Pregnancy outcome').required).toBe(false)
    submit()
    expect(save.mock.calls[1][0].outcome).toBeUndefined()
    act(() =>
      render(
        <StatusEpisodeForm
          key="archived"
          episode={{ ...careEpisode, lifecycle: 'archived', resolved_date: '2026-11-01', outcome: 'loss' }}
          options={careOptions}
          saving={false}
          onSave={save}
          onCancel={() => {}}
        />,
        container,
      ),
    )
    writeField('Support preferences', 'Quiet company')
    submit()
    expect(save.mock.calls[2][0]).toMatchObject({
      lifecycle: 'archived',
      outcome: 'loss',
      resolved_date: '2026-11-01',
      preferences: 'Quiet company',
    })
  })

  test('episode archive preserves coexisting circumstances and unrelated profile data', async () => {
    const data = dashboard('spouse')
    const second = { ...careEpisode, id: 'a68bf3ec-4af4-4f22-b683-f9b3f4b04d59', kind: 'anxious' as const }
    data.person.status_episodes = [careEpisode, second]
    vi.mocked(axios.get).mockResolvedValue({ data: { success: true, data } })
    vi.mocked(axios.patch).mockResolvedValue({ data: { success: true, data: data.person } })
    act(() =>
      render(
        <QueryClientProvider client={client}>
          <StatusEpisodes dashboard={data} options={careOptions} queryRoot={['test']} />
        </QueryClientProvider>,
        container,
      ),
    )
    act(() => button('Archive').click())
    await settle()
    const body = vi.mocked(axios.patch).mock.calls[0][1] as {
      status_episodes: typeof data.person.status_episodes
    }
    expect(body.status_episodes).toContainEqual(second)
    expect(body.status_episodes?.find((item) => item.id === careEpisode.id)?.lifecycle).toBe('archived')
    expect(Object.keys(body)).toEqual(['expected_updated_at', 'status_episodes'])
  })

  test('care metric action seeds episode and constrains provenance and rating', () => {
    const save = vi.fn()
    act(() =>
      render(
        <EventForm
          type="observation"
          options={careOptions}
          episodes={[careEpisode]}
          initialPayload={{ status_episode_id: careEpisode.id, care_metric: 'mood' }}
          saving={false}
          error={null}
          onSave={save}
          onCancel={() => {}}
        />,
        container,
      ),
    )
    expect(field('Related circumstance').value).toBe(careEpisode.id)
    expect(field('Care observation').value).toBe('mood')
    expect(field('Information source').value).toBe('')
    expect(container.textContent).toContain('Agreement is not recorded')
    expect(
      [...element<HTMLSelectElement>('select[required]').options].map((item) => item.value),
    ).not.toContain('observed')
    writeField('Information source', 'self_shared')
    writeField('Value', '4')
    submit()
    expect(save.mock.calls[0][0].payload).toMatchObject({
      care_metric: 'mood',
      status_episode_id: careEpisode.id,
      information_source: 'self_shared',
      value: 4,
      unit: 'rating',
    })
    expect(save.mock.calls[0][0].reminder_at).toBeNull()
  })

  test('help tree uses actual catalog metadata, server evaluation and focused filters', async () => {
    const guidance = {
      ...contextualGuidance,
      id: 'pregnancy-resource',
      title: 'Pregnancy resource',
      relationship_types: ['spouse' as const],
      status_conditions: { episode: { kind: 'pregnant' as const, phases: ['third_trimester'] } },
    }
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        success: true,
        data: {
          guidance: [
            guidance,
            contextualGuidance,
            {
              ...guidance,
              id: 'early',
              title: 'First trimester only',
              status_conditions: {
                episode: { kind: 'pregnant', phases: ['first_trimester'], max_gestational_days: 97 },
              },
            },
          ],
          sources: [],
          status_definitions: careOptions.status_definitions,
          care_metric_definitions: careOptions.care_metric_definitions,
          milestone_definitions: [],
          care_ethics: { title: 'Care', summary: 'Respect agency', principles: [], evidence_ids: [] },
          evaluations: [
            { guidance_id: guidance.id, applicable: false, reasons: ['No active pregnancy episode'] },
          ],
        },
      },
    })
    act(() =>
      render(
        <QueryClientProvider client={client}>
          <HelpTree personId="person" options={careOptions} queryRoot={['test']} onClose={() => {}} />
        </QueryClientProvider>,
        container,
      ),
    )
    expect(document.activeElement?.textContent).toBe('Help Tree')
    await settle()
    expect(container.textContent).toContain('Browsing a branch does not mean')
    writeField('Relationship', 'spouse')
    writeField('Circumstance', 'pregnant')
    writeField('Phase', 'third_trimester')
    expect(container.textContent).toContain('1 guidance records')
    expect(container.textContent).not.toContain('First trimester only')
    expect(container.textContent).toContain('No active pregnancy episode')
    expect(container.textContent).toContain('Conditions on the same episode')
    writeField('Search guidance', 'no such content')
    expect(container.textContent).toContain('No matching guidance in this branch')
  })
})

test('milestone actions seed references without scheduling reminders and safety stays visible', () => {
  const data = dashboard('spouse')
  data.person.status_episodes = [careEpisode]
  const safety = {
    ...contextualGuidance,
    id: 'urgent',
    title: 'Safety reference',
    guidance_type: 'safety' as const,
    practical_actions: ['Visible safety action'],
    feedback: 'dismissed' as const,
  }
  data.status_guidance = [safety, { ...contextualGuidance, feedback: 'completed' }]
  data.current_guidance = [safety]
  data.care_milestones = [
    {
      definition_id: 'discussion',
      status_episode_id: careEpisode.id,
      title: 'Discuss choices',
      description: 'Discuss with care team',
      window_label: 'Server window',
      state: 'available',
      evidence_ids: [],
    },
  ]
  act(() =>
    render(
      <QueryClientProvider client={client}>
        <PersonDashboard
          dashboard={data}
          options={careOptions}
          sources={[]}
          queryRoot={['test']}
          onEdit={() => {}}
        />
      </QueryClientProvider>,
      container,
    ),
  )
  expect(
    [...container.querySelectorAll('h3')].filter((item) => item.textContent === 'Safety reference'),
  ).toHaveLength(1)
  const safetyCard = [...container.querySelectorAll('.people-guidance')].find((item) =>
    item.textContent?.includes('Safety reference'),
  )
  expect(safetyCard?.querySelector('button')).toBeNull()
  expect(safetyCard?.textContent).toContain('Visible safety action')
  act(() => button('Record update').click())
  expect(field('Related circumstance').value).toBe(careEpisode.id)
  expect(field('Milestone').value).toBe('discussion')
  expect(container.textContent).toContain('Milestone updates require appropriate agreement')
  expect(container.querySelector('form input[type="number"]')).toBeNull()
  expect(field('Milestone update state')).toBeDefined()
  expect(field('Information source').value).toBe('')
  expect(
    [...(field('Information source') as HTMLSelectElement).options].map((item) => item.value),
  ).not.toContain('observed')
  act(() => button('Cancel').click())
  act(() => button('Schedule appointment').click())
  expect(field('Related circumstance').value).toBe(careEpisode.id)
  expect(
    [...container.querySelectorAll<HTMLInputElement>('form input[type="checkbox"]')].every(
      (item) => !item.checked,
    ),
  ).toBe(true)
})

test('ordinary profile edits omit episodes instead of erasing stored circumstances', () => {
  const save = vi.fn()
  const profile = { ...person('spouse'), status_episodes: [careEpisode] }
  act(() =>
    render(
      <PersonForm
        person={profile}
        options={careOptions}
        saving={false}
        error={null}
        onSave={save}
        onCancel={() => {}}
      />,
      container,
    ),
  )
  submit()
  expect(save.mock.calls[0][0]).not.toHaveProperty('status_episodes')
})

test('View Help Tree opens lazily and returns to the intact profile draft with keyboard focus', async () => {
  const data = dashboard('spouse')
  window.history.replaceState({}, '', `/people?person=${data.person.id}`)
  vi.mocked(axios.get).mockImplementation(async (url) => {
    const path = String(url)
    const value = path.endsWith('/options')
      ? options
      : path.endsWith('/dashboard')
        ? data
        : path.endsWith('/sources')
          ? []
          : path.endsWith('/help-tree')
            ? {
                guidance: [],
                sources: [],
                status_definitions: [],
                care_metric_definitions: [],
                milestone_definitions: [],
                care_ethics: { title: 'Care', summary: 'Respect agency', principles: [], evidence_ids: [] },
              }
            : [data.person]
    return { data: { success: true, data: value } }
  })
  act(() =>
    render(
      <QueryClientProvider client={client}>
        <LocationProvider>
          <People />
        </LocationProvider>
      </QueryClientProvider>,
      container,
    ),
  )
  await settle()
  await settle()
  expect(vi.mocked(axios.get).mock.calls.some(([url]) => String(url).endsWith('/help-tree'))).toBe(false)
  act(() => button('Add goal').click())
  writeField('Goal', 'Keep this draft')
  act(() => button('View Help Tree').click())
  await settle()
  expect(document.activeElement?.textContent).toBe('Help Tree')
  act(() => button('Back to person').click())
  await settle()
  expect(field('Goal').value).toBe('Keep this draft')
  expect(document.activeElement?.textContent).toBe('View Help Tree')
})

test('marriage context options are spouse-scoped and preserve explicit selection', () => {
  const scoped: PeopleOptions = {
    ...options,
    statuses: [
      { value: 'long_distance', label: 'Long distance' },
      { value: 'marriage_close', label: 'Honeymoon / feeling close', relationship_types: ['spouse'] },
    ],
  }
  const save = vi.fn()
  act(() =>
    render(
      <PersonForm
        person={{ ...person('spouse'), statuses: ['marriage_close'] }}
        options={scoped}
        saving={false}
        error={null}
        onSave={save}
        onCancel={() => {}}
      />,
      container,
    ),
  )
  expect(container.textContent).toContain('Honeymoon / feeling close')
  submit()
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      statuses: ['marriage_close'],
      expected_updated_at: person('spouse').updated_at,
    }),
  )
  act(() => render(null, container))
  act(() =>
    render(
      <PersonForm
        person={{ ...person('friend'), statuses: ['marriage_close', 'long_distance'] }}
        options={scoped}
        saving={false}
        error={null}
        onSave={save}
        onCancel={() => {}}
      />,
      container,
    ),
  )
  expect(container.textContent).not.toContain('Honeymoon / feeling close')
  submit()
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ statuses: ['long_distance'] }))
})

test('profile editor keeps its original concurrency snapshot during a refresh', () => {
  const save = vi.fn()
  const original = person('friend')
  act(() =>
    render(
      <PersonForm
        person={original}
        options={options}
        saving={false}
        error={null}
        onSave={save}
        onCancel={() => {}}
      />,
      container,
    ),
  )
  act(() =>
    render(
      <PersonForm
        person={{ ...original, updated_at: '2026-11-12T19:00:00.000Z' }}
        options={options}
        saving={false}
        error={null}
        onSave={save}
        onCancel={() => {}}
      />,
      container,
    ),
  )
  submit()
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ expected_updated_at: original.updated_at }))
})

describe('direct relationship states', () => {
  const scoped: PeopleOptions = {
    ...options,
    statuses: [
      { value: 'long_distance', label: 'Long distance' },
      { value: 'marriage_close', label: 'Feeling close', relationship_types: ['spouse'] },
    ],
  }
  const show = (profile = { ...person('spouse'), statuses: ['marriage_close'] }) =>
    act(() =>
      render(
        <QueryClientProvider client={client}>
          <RelationshipStates person={profile} options={scoped} queryRoot={['test']} />
        </QueryClientProvider>,
        container,
      ),
    )
  const open = () => act(() => element<HTMLElement>('summary').click())
  const toggle = (label: string) => act(() => (field(label) as HTMLInputElement).click())

  test('preselects spouse states and saves multiple states with the opening version only', async () => {
    const original = { ...person('spouse'), statuses: ['marriage_close'] }
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    vi.mocked(axios.patch).mockResolvedValue({ data: { success: true, data: original } })
    show(original)
    expect(element('summary').textContent).toContain('Feeling close')
    open()
    expect((field('Feeling close') as HTMLInputElement).checked).toBe(true)
    toggle('Long distance')
    expect(axios.patch).not.toHaveBeenCalled()
    show({ ...original, updated_at: '2026-11-12T19:00:00Z' })
    submit()
    await settle()
    expect(vi.mocked(axios.patch).mock.calls[0][1]).toEqual({
      statuses: ['marriage_close', 'long_distance'],
      expected_updated_at: original.updated_at,
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['test'] })
    expect(element<HTMLDetailsElement>('details').open).toBe(false)
    expect(document.activeElement).toBe(element('summary'))
  })

  test('clears all explicitly and displays none selected for an empty profile', async () => {
    vi.mocked(axios.patch).mockResolvedValue({ data: { success: true, data: person('spouse') } })
    show()
    open()
    act(() => button('Clear all').click())
    submit()
    await settle()
    expect(vi.mocked(axios.patch).mock.calls[0][1]).toEqual({
      statuses: [],
      expected_updated_at: person('spouse').updated_at,
    })
    show(person('spouse'))
    expect(element('summary').textContent).toContain('None selected')
  })

  test('cancel discards draft without saving and reopening restores saved selections', () => {
    show()
    open()
    toggle('Long distance')
    act(() => button('Cancel').click())
    expect(axios.patch).not.toHaveBeenCalled()
    expect(element<HTMLDetailsElement>('details').open).toBe(false)
    open()
    expect((field('Long distance') as HTMLInputElement).checked).toBe(false)
    expect((field('Feeling close') as HTMLInputElement).checked).toBe(true)
  })

  test('disables pending edits and keeps the draft and error after failure', async () => {
    let rejectSave: (error: Error) => void = () => {}
    vi.mocked(axios.patch).mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectSave = reject
        }),
    )
    show()
    open()
    toggle('Long distance')
    submit()
    await settle()
    expect(button('Applying states…').disabled).toBe(true)
    expect(button('Cancel').disabled).toBe(true)
    expect(element<HTMLFieldSetElement>('fieldset').disabled).toBe(true)
    open()
    expect(element<HTMLDetailsElement>('details').open).toBe(true)
    await act(async () => rejectSave(new Error('Profile changed. Reload and reconcile.')))
    await settle()
    expect(element('[role="alert"]').textContent).toContain('Profile changed')
    expect((field('Long distance') as HTMLInputElement).checked).toBe(true)
    expect(element<HTMLDetailsElement>('details').open).toBe(true)
    expect(button('Apply states').disabled).toBe(false)
  })

  test('filters spouse-only choices and preserves unknown saved states on ordinary changes', async () => {
    const profile = { ...person('friend'), statuses: ['legacy_state'] }
    vi.mocked(axios.patch).mockResolvedValue({ data: { success: true, data: profile } })
    show(profile)
    open()
    expect(container.textContent).not.toContain('Feeling close')
    expect(container.textContent).toContain('legacy_state')
    toggle('Long distance')
    submit()
    await settle()
    expect(vi.mocked(axios.patch).mock.calls[0][1]).toEqual({
      statuses: ['legacy_state', 'long_distance'],
      expected_updated_at: profile.updated_at,
    })
  })
})

describe('relationship-state history', () => {
  const transition = (
    id: string,
    state: string,
    change: 'started' | 'ended',
    start: string | null,
  ): PeopleEvent => ({
    id,
    person_id: person('spouse').id,
    actor: 'people-test',
    type: 'relationship_state',
    source: 'system',
    timestamp: '2026-11-12T12:00:00.000Z',
    recorded_at: '2026-11-12T12:00:00.000Z',
    updated_at: '2026-11-12T12:00:00.000Z',
    privacy: 'private',
    revision: 1,
    payload: {
      relationship_state: state,
      relationship_state_change: change,
      relationship_state_started_at: start,
    },
  })

  test('renders multiple read-only transitions and preserves manual correction in recent and full history', async () => {
    const data = dashboard('spouse')
    const startedAt = '2026-11-11T08:00:00.000Z'
    data.recent_activity = [
      transition('start-1', 'status', 'started', startedAt),
      transition('start-2', 'custom_state', 'started', startedAt),
      transition('end-1', 'status', 'ended', startedAt),
      transition('end-2', 'legacy_state', 'ended', null),
      {
        ...transition('manual', 'status', 'started', startedAt),
        type: 'contact',
        source: 'manual',
        payload: { note: 'Manual contact' },
      },
    ]
    vi.mocked(axios.get).mockResolvedValue({ data: { success: true, data: data.recent_activity } })
    act(() =>
      render(
        <QueryClientProvider client={client}>
          <PersonDashboard
            dashboard={data}
            options={options}
            sources={[]}
            queryRoot={['test']}
            onEdit={() => {}}
          />
        </QueryClientProvider>,
        container,
      ),
    )
    const verify = () => {
      const rows = [...container.querySelectorAll('.people-history > li')]
      expect(rows.filter((row) => row.textContent?.includes('Relationship state started'))).toHaveLength(2)
      expect(rows.filter((row) => row.textContent?.includes('Relationship state ended'))).toHaveLength(2)
      expect(rows[0].textContent).toContain('Server circumstance')
      expect(rows[1].textContent).toContain('custom_state')
      expect(rows[2].querySelectorAll('time')[1].dateTime).toBe(startedAt)
      expect(rows[3].textContent).toContain('Start date unknown (selected before tracking began)')
      expect(rows.slice(0, 4).every((row) => row.querySelector('button') === null)).toBe(true)
      expect(rows[4].textContent).toContain('Review / correct entry')
    }
    verify()
    act(() => button('Review full history').click())
    await settle()
    verify()
    act(() => button('Review / correct entry').click())
    expect(container.textContent).toContain('Edit Meaningful contact')
  })

  test('applying states refreshes open history with the recorded transition', async () => {
    const data = dashboard('spouse')
    window.history.replaceState({}, '', `/people?person=${data.person.id}`)
    let applied = false
    vi.mocked(axios.get).mockImplementation(async (url) => {
      const path = String(url)
      const entries = applied
        ? [transition('new-state', 'status', 'started', '2026-11-12T12:00:00.000Z')]
        : []
      const value = path.endsWith('/options')
        ? options
        : path.endsWith('/dashboard')
          ? { ...data, recent_activity: entries }
          : path.endsWith('/events')
            ? entries
            : path.endsWith('/sources')
              ? []
              : [data.person]
      return { data: { success: true, data: value } }
    })
    vi.mocked(axios.patch).mockImplementation(async () => {
      applied = true
      return { data: { success: true, data: { ...data.person, statuses: ['status'] } } }
    })
    act(() =>
      render(
        <QueryClientProvider client={client}>
          <LocationProvider>
            <People />
          </LocationProvider>
        </QueryClientProvider>,
        container,
      ),
    )
    await settle()
    await settle()
    act(() => button('Review full history').click())
    await settle()
    expect(container.textContent).not.toContain('Relationship state started')
    act(() => element<HTMLElement>('.people-relationship-states summary').click())
    expect(container.textContent).toContain('Changes are recorded in History when applied')
    act(() => (field('Server circumstance') as HTMLInputElement).click())
    act(() => button('Apply states').click())
    await settle()
    await settle()
    expect(container.textContent).toContain('Relationship state started')
    expect(vi.mocked(axios.get).mock.calls.filter(([url]) => String(url).endsWith('/events'))).toHaveLength(2)
  })
})

import { expect, test, vi } from 'vitest'

import type { McpServer } from './helpers.ts'

import * as service from '../services/people.ts'
import { registerPeopleTools } from './people-tools.ts'
vi.mock('../services/people.ts', () => ({
  getPeopleHelpTree: vi.fn().mockResolvedValue({ guidance: [] }),
  getPeopleCalendar: vi.fn().mockResolvedValue([]),
  listPeople: vi.fn().mockResolvedValue([]),
  createPerson: vi.fn(),
  requirePerson: vi.fn(),
  updatePerson: vi.fn(),
  deletePerson: vi.fn(),
  getDashboard: vi.fn(),
  getGuidance: vi.fn(),
  getMetrics: vi.fn(),
  listEvents: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  setFeedback: vi.fn(),
  peopleOptions: {},
  peopleSources: [],
}))
test('MCP exposes REST parity and binds owner from server session', async () => {
  const tool = vi.fn()
  registerPeopleTools({ tool } as unknown as McpServer, 'owner')
  expect(tool.mock.calls.map((c) => c[0])).toEqual([
    'get_people_help_tree',
    'list_people',
    'people_calendar',
    'people_options',
    'people_sources',
    'create_person',
    'get_person',
    'update_person',
    'delete_person',
    'person_dashboard',
    'person_guidance',
    'person_metrics',
    'person_events',
    'create_person_event',
    'update_person_event',
    'delete_person_event',
    'set_person_guidance_feedback',
  ])
  await tool.mock.calls.find((c) => c[0] === 'list_people')![3]()
  expect(service.listPeople).toHaveBeenCalledWith('owner')
})

test('calendar MCP tool uses the same private service and range', async () => {
  const tool = vi.fn()
  registerPeopleTools({ tool } as unknown as McpServer, 'calendar_owner')
  const call = tool.mock.calls.find((candidate) => candidate[0] === 'people_calendar')!
  await call[3]({ from: '2026-01-01', to: '2026-12-31' })
  expect(service.getPeopleCalendar).toHaveBeenCalledWith('calendar_owner', {
    from: '2026-01-01',
    to: '2026-12-31',
  })
})

test('help tree MCP binds authenticated owner', async () => {
  const tool = vi.fn()
  registerPeopleTools({ tool } as unknown as McpServer, 'owner')
  await tool.mock.calls.find((c) => c[0] === 'get_people_help_tree')![3]({})
  expect(service.getPeopleHelpTree).toHaveBeenCalledWith('owner', {})
})

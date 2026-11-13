import * as spec from '@aurboda/api-spec'
import { z } from 'zod'

import * as people from '../services/people.ts'
import { jsonResponse, type McpServer } from './helpers.ts'
export const registerPeopleTools = (server: McpServer, user: string) => {
  server.tool(
    'get_people_help_tree',
    'Explore the installed People guidance and dependencies, optionally evaluating your private person.',
    { ...spec.peopleHelpTreeQuerySchema.shape },
    async (query) => jsonResponse({ success: true, data: await people.getPeopleHelpTree(user, query) }),
  )
  server.tool('list_people', 'List your private people.', {}, async () =>
    jsonResponse({ success: true, data: await people.listPeople(user) }),
  )
  server.tool(
    'people_calendar',
    'Read private birthday and important-date occurrences for an inclusive calendar date range. Does not create tags, metrics or external calendar events.',
    { ...spec.peopleCalendarQuerySchema.shape },
    async (params) => jsonResponse({ success: true, data: await people.getPeopleCalendar(user, params) }),
  )
  server.tool('people_options', 'Get server-defined person setup and event options.', {}, async () =>
    jsonResponse({ success: true, data: people.peopleOptions }),
  )
  server.tool('people_sources', 'Read locally installed People evidence sources.', {}, async () =>
    jsonResponse({ success: true, data: people.peopleSources }),
  )
  server.tool(
    'create_person',
    'Create a private person profile, optionally including gender context, important dates, and how you met. Selected relationship states begin recorded history at creation.',
    { ...spec.personFieldsSchema.shape },
    async (body) => jsonResponse({ success: true, data: await people.createPerson(user, body) }),
  )
  server.tool('get_person', 'Get a private person profile.', { id: z.uuid() }, async ({ id }) =>
    jsonResponse({ success: true, data: await people.requirePerson(user, id) }),
  )
  server.tool(
    'update_person',
    'Update a private profile, dates, or meeting details; omitted fields and history are preserved. Relationship state changes atomically record start/end history at the time of saving.',
    { id: z.uuid(), ...spec.updatePersonBodySchema.shape },
    async ({ id, ...body }) =>
      jsonResponse({ success: true, data: await people.updatePerson(user, id, body) }),
  )
  server.tool(
    'delete_person',
    'Permanently delete person, events, feedback, and private metric projections.',
    { id: z.uuid() },
    async ({ id }) => jsonResponse({ success: true, data: await people.deletePerson(user, id) }),
  )
  server.tool(
    'person_dashboard',
    'Get complete deterministic person dashboard.',
    { id: z.uuid() },
    async ({ id }) => jsonResponse({ success: true, data: await people.getDashboard(user, id) }),
  )
  server.tool(
    'person_guidance',
    'Explore all applicable guidance, including dismissed entries.',
    { id: z.uuid(), ...spec.peopleGuidanceQuerySchema.shape },
    async ({ id, ...filters }) =>
      jsonResponse({ success: true, data: await people.getGuidance(user, id, filters) }),
  )
  server.tool(
    'person_metrics',
    'Get optional private metric definitions and values.',
    { id: z.uuid() },
    async ({ id }) => jsonResponse({ success: true, data: await people.getMetrics(user, id) }),
  )
  server.tool('person_events', 'List private timestamped event history.', { id: z.uuid() }, async ({ id }) =>
    jsonResponse({ success: true, data: await people.listEvents(user, id) }),
  )
  server.tool(
    'create_person_event',
    'Record a private event, journal entry, or memory; goals accept an active/completed/paused goal_status and optional target_date. Journals and memories do not produce metrics.',
    { id: z.uuid(), ...spec.peopleEventBodySchema.shape },
    async ({ id, ...body }) =>
      jsonResponse({ success: true, data: await people.createEvent(user, id, body) }),
  )
  server.tool(
    'update_person_event',
    'Correct a manual event and refresh derived totals. Automatic relationship-state history is read-only.',
    { id: z.uuid(), event_id: z.uuid(), ...spec.updatePeopleEventBodySchema.shape },
    async ({ id, event_id, ...body }) =>
      jsonResponse({ success: true, data: await people.updateEvent(user, id, event_id, body) }),
  )
  server.tool(
    'delete_person_event',
    'Delete a manual event and refresh derived totals. Automatic relationship-state history is read-only.',
    { id: z.uuid(), event_id: z.uuid() },
    async ({ id, event_id }) =>
      jsonResponse({ success: true, data: await people.deleteEvent(user, id, event_id) }),
  )
  server.tool(
    'set_person_guidance_feedback',
    'Dismiss or complete a versioned recommendation.',
    { id: z.uuid(), guidance_id: z.string(), ...spec.peopleFeedbackBodySchema.shape },
    async ({ id, guidance_id, ...body }) =>
      jsonResponse({ success: true, data: await people.setFeedback(user, id, guidance_id, body) }),
  )
}

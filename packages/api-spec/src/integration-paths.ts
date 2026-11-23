import { z } from 'zod'

import * as s from './schemas/index.ts'
const op = (
  summary: string,
  response: z.ZodType,
  options: { body?: z.ZodType; query?: z.ZodObject; id?: boolean; tag?: string } = {},
) => ({
  summary,
  tags: [options.tag ?? 'Check-ins'],
  security: [{ bearerAuth: [] }],
  ...(options.id || options.query
    ? {
        requestParams: {
          ...(options.id ? { path: z.object({ id: z.uuid() }) } : {}),
          ...(options.query ? { query: options.query } : {}),
        },
      }
    : {}),
  ...(options.body
    ? { requestBody: { required: true, content: { 'application/json': { schema: options.body } } } }
    : {}),
  responses: {
    200: { description: 'Successful response', content: { 'application/json': { schema: response } } },
    400: { description: 'Invalid request' },
    401: { description: 'Authentication required' },
    404: { description: 'Not found' },
    409: { description: 'Conflicting version, output or retry key' },
  },
})
export const integrationPaths = {
  '/check-in-forms': {
    get: op('List reusable forms', s.checkInFormsResponseSchema, { query: s.checkInFormsQuerySchema }),
    post: op('Create a private reusable form', s.checkInFormResponseSchema, {
      body: s.addCheckInFormBodySchema,
    }),
  },
  '/check-in-forms/{id}': {
    get: op('Get a reusable form', s.checkInFormResponseSchema, { id: true }),
    patch: op('Update a reusable form', s.checkInFormResponseSchema, {
      id: true,
      body: s.updateCheckInFormBodySchema,
    }),
    delete: op('Move a form to trash', s.checkInFormResponseSchema, { id: true }),
  },
  '/check-in-forms/{id}/restore': {
    post: op('Restore a form without backfilling occurrences', s.checkInFormResponseSchema, { id: true }),
  },
  '/check-in-forms/{id}/adherence': {
    get: op('Summarize recorded and unrecorded slots', s.checkInAdherenceResponseSchema, {
      id: true,
      query: s.checkInAdherenceQuerySchema,
    }),
  },
  '/check-in-templates': { get: op('List reusable form templates', s.checkInTemplatesResponseSchema) },
  '/check-ins': {
    get: op('Read private check-in history', s.checkInsResponseSchema, { query: s.checkInsQuerySchema }),
    post: op('Submit a response atomically with explicitly enabled outputs', s.checkInResponseSchema, {
      body: s.submitCheckInBodySchema,
    }),
  },
  '/check-ins/{id}': {
    patch: op('Correct a response and its owned outputs atomically', s.checkInResponseSchema, {
      id: true,
      body: s.updateCheckInBodySchema,
    }),
    delete: op('Undo a response without removing independently edited outputs', s.checkInResponseSchema, {
      id: true,
    }),
  },
  '/check-ins/{id}/restore': {
    post: op('Restore a response and its owned outputs', s.checkInResponseSchema, { id: true }),
  },
  '/due': {
    get: op('Read scheduled slots without manufacturing facts', s.dueResponseSchema, {
      query: s.dueQuerySchema,
    }),
  },
  '/activities/recent': {
    get: op('Read latest activities', s.recentActivitiesResponseSchema, {
      query: s.recentActivitiesQuerySchema,
      tag: 'Activities',
    }),
  },
  '/private-link-targets': {
    get: op('Search private people and activities', s.privateLinkTargetsResponseSchema, {
      query: s.privateLinkTargetsQuerySchema,
      tag: 'People',
    }),
  },
  '/activities/{id}/people': {
    get: op('Read private activity people links', s.activityPeopleResponseSchema, {
      id: true,
      query: s.privateActivityPeopleQuerySchema,
      tag: 'People',
    }),
    put: op('Replace private activity people links', s.activityPeopleResponseSchema, {
      id: true,
      body: s.setActivityPeopleBodySchema,
      tag: 'People',
    }),
  },
  '/people/{id}/time-with': {
    get: op(
      'Read private time-with history and optional daily metric correlation',
      s.personTimeWithResponseSchema,
      { id: true, query: s.personTimeWithQuerySchema, tag: 'People' },
    ),
  },
  '/journal/tags/merge': {
    post: op('Merge exact Journal tags, retaining revisions and trash', s.mergeJournalTagsResponseSchema, {
      body: s.mergeJournalTagsBodySchema,
      tag: 'Journal',
    }),
  },
  '/journal/entries/{id}/neighbors': {
    get: op('Read adjacent private live entries', s.journalNeighborsResponseSchema, {
      id: true,
      tag: 'Journal',
    }),
  },
}

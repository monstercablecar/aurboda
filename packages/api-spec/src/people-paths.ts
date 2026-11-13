import { z } from 'zod'

import * as p from './schemas/people.ts'
const operation = (
  summary: string,
  schema: z.ZodType,
  body?: z.ZodType,
  params: string[] = [],
  query?: z.ZodObject,
  status = 200,
) => ({
  summary,
  tags: ['People'],
  security: [{ bearerAuth: [] }],
  ...(params.length || query
    ? {
        requestParams: {
          ...(params.length
            ? {
                path: z.object(
                  Object.fromEntries(
                    params.map((name) => [name, name === 'guidanceId' ? z.string() : z.uuid()]),
                  ),
                ),
              }
            : {}),
          ...(query ? { query } : {}),
        },
      }
    : {}),
  ...(body ? { requestBody: { required: true, content: { 'application/json': { schema: body } } } } : {}),
  responses: {
    [status]: { description: 'Successful response', content: { 'application/json': { schema } } },
    400: { description: 'Invalid request' },
    401: { description: 'Authentication required' },
    404: { description: 'Not found' },
  },
})
export const peoplePaths = {
  '/people/help-tree': {
    get: operation(
      'Explore People guidance and dependencies',
      p.peopleHelpTreeResponseSchema,
      undefined,
      [],
      p.peopleHelpTreeQuerySchema,
    ),
  },
  '/people': {
    get: operation('List private people', p.peopleResponseSchema),
    post: operation(
      'Create private person',
      p.personResponseSchema,
      p.createPersonBodySchema,
      [],
      undefined,
      201,
    ),
  },
  '/people/calendar': {
    get: operation(
      'Get private important-date calendar occurrences',
      p.peopleCalendarResponseSchema,
      undefined,
      [],
      p.peopleCalendarQuerySchema,
    ),
  },
  '/people/options': { get: operation('Get server setup options', p.peopleOptionsResponseSchema) },
  '/people/catalog/sources': { get: operation('Get local evidence sources', p.peopleSourcesResponseSchema) },
  '/people/{id}': {
    get: operation('Get person', p.personResponseSchema, undefined, ['id']),
    patch: operation(
      'Update profile and record relationship state transitions',
      p.personResponseSchema,
      p.updatePersonBodySchema,
      ['id'],
    ),
    delete: operation('Delete person and owned records', p.peopleMutationResponseSchema, undefined, ['id']),
  },
  '/people/{id}/dashboard': {
    get: operation('Get deterministic dashboard', p.peopleDashboardResponseSchema, undefined, ['id']),
  },
  '/people/{id}/guidance': {
    get: operation(
      'Explore applicable guidance',
      p.peopleGuidanceResponseSchema,
      undefined,
      ['id'],
      p.peopleGuidanceQuerySchema,
    ),
  },
  '/people/{id}/metrics': {
    get: operation('Get private optional metrics', p.peopleMetricsResponseSchema, undefined, ['id']),
  },
  '/people/{id}/events': {
    get: operation('List event history', p.peopleEventsResponseSchema, undefined, ['id']),
    post: operation(
      'Record event',
      p.peopleEventResponseSchema,
      p.peopleEventBodySchema,
      ['id'],
      undefined,
      201,
    ),
  },
  '/people/{id}/events/{eventId}': {
    patch: operation(
      'Correct manual event (automatic state history is read-only)',
      p.peopleEventResponseSchema,
      p.updatePeopleEventBodySchema,
      ['id', 'eventId'],
    ),
    delete: operation(
      'Delete manual event (automatic state history is read-only)',
      p.peopleMutationResponseSchema,
      undefined,
      ['id', 'eventId'],
    ),
  },
  '/people/{id}/guidance/{guidanceId}/feedback': {
    post: operation(
      'Record versioned guidance feedback',
      p.peopleMutationResponseSchema,
      p.peopleFeedbackBodySchema,
      ['id', 'guidanceId'],
    ),
  },
}

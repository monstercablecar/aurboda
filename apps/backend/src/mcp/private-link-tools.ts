import * as spec from '@aurboda/api-spec'
import { z } from 'zod'

import * as links from '../services/private-links.ts'
import { jsonResponse, type McpServer } from './helpers.ts'
export const registerPrivateLinkTools = (server: McpServer, user: string) => {
  server.tool(
    'get_private_link_targets',
    'Search your private people and activities. Names are never added to public activity payloads.',
    { ...spec.privateLinkTargetsQuerySchema.shape },
    async ({ search }) => jsonResponse({ success: true, data: await links.privateLinkTargets(user, search) }),
  )
  server.tool(
    'get_activity_people',
    'Get people privately linked to an activity.',
    { id: z.uuid(), activity_ids: z.array(z.uuid()).max(99).optional() },
    async ({ id, activity_ids }) =>
      jsonResponse({ success: true, data: await links.getActivityPeople(user, id, activity_ids) }),
  )
  server.tool(
    'set_activity_people',
    "Replace an activity's private people links. Does not publish names or person records.",
    { id: z.uuid(), ...spec.setActivityPeopleBodySchema.shape },
    async ({ id, ...body }) =>
      jsonResponse({ success: true, data: await links.setActivityPeople(user, id, body) }),
  )
  server.tool(
    'get_person_time_with',
    'Private time-with history and optional daily metric correlation. Overlapping intervals count once; associations do not show causation.',
    { id: z.uuid(), ...spec.personTimeWithQuerySchema.shape },
    async ({ id, ...body }) =>
      jsonResponse({ success: true, data: await links.personTimeWith(user, id, body) }),
  )
}

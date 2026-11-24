import * as spec from '@aurboda/api-spec'

import * as links from '../services/private-links.ts'
import { typedRouter, type AnyMiddleware } from '../typed-router.ts'
import { validateBody, validateQuery } from '../validation.ts'

export const createPrivateLinksRouter = (auth: AnyMiddleware) => {
  const router = typedRouter()
  router.get<Record<string, never>, spec.PrivateLinkTargetsResponse, unknown, spec.PrivateLinkTargetsQuery>(
    '/private-link-targets',
    auth,
    validateQuery(spec.privateLinkTargetsQuerySchema),
    async (req, res) => {
      res.json({ success: true, data: await links.privateLinkTargets(req.user!, req.query.search) })
    },
  )
  router.get<{ id: string }, spec.ActivityPeopleResponse, unknown, spec.PrivateActivityPeopleQuery>(
    '/activities/:id/people',
    auth,
    validateQuery(spec.privateActivityPeopleQuerySchema),
    async (req, res) => {
      res.json({
        success: true,
        data: await links.getActivityPeople(
          req.user!,
          req.params.id,
          req.query.activity_ids?.split(',') ?? [],
        ),
      })
    },
  )
  router.put<{ id: string }, spec.ActivityPeopleResponse, spec.SetActivityPeopleBody>(
    '/activities/:id/people',
    auth,
    validateBody(spec.setActivityPeopleBodySchema),
    async (req, res) => {
      res.json({ success: true, data: await links.setActivityPeople(req.user!, req.params.id, req.body) })
    },
  )
  router.get<{ id: string }, spec.PersonTimeWithResponse, unknown, spec.PersonTimeWithQuery>(
    '/people/:id/time-with',
    auth,
    validateQuery(spec.personTimeWithQuerySchema),
    async (req, res) => {
      res.json({ success: true, data: await links.personTimeWith(req.user!, req.params.id, req.query) })
    },
  )
  return router
}

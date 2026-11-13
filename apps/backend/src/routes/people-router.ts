import type { RequestHandler } from 'express'

import * as spec from '@aurboda/api-spec'

import * as people from '../services/people.ts'
import { typedRouter } from '../typed-router.ts'
import { validateBody, validateQuery } from '../validation.ts'

export const createPeopleRouter = (authMiddleware: RequestHandler) => {
  const router = typedRouter()
  router.get<Record<string, never>, spec.PeopleHelpTreeResponse, unknown, spec.PeopleHelpTreeQuery>(
    '/help-tree',
    authMiddleware,
    validateQuery(spec.peopleHelpTreeQuerySchema),
    async (req, res) => {
      res.json({ success: true, data: await people.getPeopleHelpTree(req.user!, req.query) })
    },
  )
  router.get<Record<string, never>, spec.PeopleCalendarResponse, unknown, spec.PeopleCalendarQuery>(
    '/calendar',
    authMiddleware,
    validateQuery(spec.peopleCalendarQuerySchema),
    async (req, res) => {
      res.json({ success: true, data: await people.getPeopleCalendar(req.user!, req.query) })
    },
  )
  router.get<Record<string, never>, spec.PeopleOptionsResponse>(
    '/options',
    authMiddleware,
    async (_req, res) => {
      res.json({ success: true, data: people.peopleOptions })
    },
  )
  router.get<Record<string, never>, spec.PeopleSourcesResponse>(
    '/catalog/sources',
    authMiddleware,
    async (_req, res) => {
      res.json({ success: true, data: people.peopleSources })
    },
  )
  router.get<Record<string, never>, spec.PeopleResponse>('/', authMiddleware, async (req, res) => {
    res.json({ success: true, data: await people.listPeople(req.user!) })
  })
  router.post<Record<string, never>, spec.PersonResponse, spec.CreatePersonBody>(
    '/',
    authMiddleware,
    validateBody(spec.createPersonBodySchema),
    async (req, res) => {
      res.status(201).json({ success: true, data: await people.createPerson(req.user!, req.body) })
    },
  )
  router.get<{ id: string }, spec.PersonResponse>('/:id', authMiddleware, async (req, res) => {
    res.json({ success: true, data: await people.requirePerson(req.user!, req.params.id) })
  })
  router.patch<{ id: string }, spec.PersonResponse, spec.UpdatePersonBody>(
    '/:id',
    authMiddleware,
    validateBody(spec.updatePersonBodySchema),
    async (req, res) => {
      res.json({ success: true, data: await people.updatePerson(req.user!, req.params.id, req.body) })
    },
  )
  router.delete<{ id: string }, spec.PeopleMutationResponse>('/:id', authMiddleware, async (req, res) => {
    res.json({ success: true, data: await people.deletePerson(req.user!, req.params.id) })
  })
  router.get<{ id: string }, spec.PeopleDashboardResponse>(
    '/:id/dashboard',
    authMiddleware,
    async (req, res) => {
      res.json({ success: true, data: await people.getDashboard(req.user!, req.params.id) })
    },
  )
  router.get<{ id: string }, spec.PeopleGuidanceResponse, unknown, spec.PeopleGuidanceQuery>(
    '/:id/guidance',
    authMiddleware,
    validateQuery(spec.peopleGuidanceQuerySchema),
    async (req, res) => {
      res.json({ success: true, data: await people.getGuidance(req.user!, req.params.id, req.query) })
    },
  )
  router.get<{ id: string }, spec.PeopleMetricsResponse>('/:id/metrics', authMiddleware, async (req, res) => {
    res.json({ success: true, data: await people.getMetrics(req.user!, req.params.id) })
  })
  router.get<{ id: string }, spec.PeopleEventsResponse>('/:id/events', authMiddleware, async (req, res) => {
    res.json({ success: true, data: await people.listEvents(req.user!, req.params.id) })
  })
  router.post<{ id: string }, spec.PeopleEventResponse, spec.PeopleEventBody>(
    '/:id/events',
    authMiddleware,
    validateBody(spec.peopleEventBodySchema),
    async (req, res) => {
      res
        .status(201)
        .json({ success: true, data: await people.createEvent(req.user!, req.params.id, req.body) })
    },
  )
  router.patch<{ id: string; eventId: string }, spec.PeopleEventResponse, spec.UpdatePeopleEventBody>(
    '/:id/events/:eventId',
    authMiddleware,
    validateBody(spec.updatePeopleEventBodySchema),
    async (req, res) => {
      res.json({
        success: true,
        data: await people.updateEvent(req.user!, req.params.id, req.params.eventId, req.body),
      })
    },
  )
  router.delete<{ id: string; eventId: string }, spec.PeopleMutationResponse>(
    '/:id/events/:eventId',
    authMiddleware,
    async (req, res) => {
      res.json({
        success: true,
        data: await people.deleteEvent(req.user!, req.params.id, req.params.eventId),
      })
    },
  )
  router.post<{ id: string; guidanceId: string }, spec.PeopleMutationResponse, spec.PeopleFeedbackBody>(
    '/:id/guidance/:guidanceId/feedback',
    authMiddleware,
    validateBody(spec.peopleFeedbackBodySchema),
    async (req, res) => {
      res.json({
        success: true,
        data: await people.setFeedback(req.user!, req.params.id, req.params.guidanceId, req.body),
      })
    },
  )
  return router
}

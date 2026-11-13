import * as spec from '@aurboda/api-spec'
import multer from 'multer'
import { z } from 'zod'

import { httpError } from '../http-error.ts'
import { JOURNAL_CATALOG } from '../services/journal-catalog.ts'
import * as service from '../services/journal.ts'
import { typedRouter, type AnyMiddleware } from '../typed-router.ts'
import { validateBody, validateQuery } from '../validation.ts'

export const createJournalRouter = (auth: AnyMiddleware) => {
  const router = typedRouter()
  const validId: AnyMiddleware = (req, _res, next) => {
    if (!z.uuid().safeParse(req.params.id).success) return next(httpError(400, 'Invalid journal identifier'))
    next()
  }
  router.get<Record<string, never>, spec.JournalCatalogResponse>('/catalog', auth, async (_req, res) => {
    res.json({ success: true, data: JOURNAL_CATALOG })
  })
  router.get<Record<string, never>, spec.JournalEntriesResponse, unknown, spec.JournalEntriesQuery>(
    '/entries',
    auth,
    validateQuery(spec.journalEntriesQuerySchema),
    async (req, res) => {
      res.json({ success: true, ...(await service.listJournalEntries(req.user ?? '', req.query)) })
    },
  )
  router.get<{ id: string }, spec.JournalEntryResponse>('/entries/:id', auth, validId, async (req, res) => {
    res.json({ success: true, data: await service.getJournalEntry(req.user ?? '', req.params.id) })
  })
  router.post<Record<string, never>, spec.JournalEntryResponse, spec.CreateJournalEntryBody>(
    '/entries',
    auth,
    validateBody(spec.createJournalEntryBodySchema),
    async (req, res) => {
      res
        .status(201)
        .json({ success: true, data: await service.createJournalEntry(req.user ?? '', req.body) })
    },
  )
  router.patch<{ id: string }, spec.JournalEntryResponse, spec.UpdateJournalEntryBody>(
    '/entries/:id',
    auth,
    validId,
    validateBody(spec.updateJournalEntryBodySchema),
    async (req, res) => {
      res.json({
        success: true,
        data: await service.updateJournalEntry(req.user ?? '', req.params.id, req.body),
      })
    },
  )
  router.delete<{ id: string }, spec.JournalSuccessResponse, unknown, spec.JournalDeleteQuery>(
    '/entries/:id',
    auth,
    validId,
    validateQuery(spec.journalDeleteQuerySchema),
    async (req, res) => {
      await service.deleteJournalEntry(req.user ?? '', req.params.id, req.query.expected_updated_at)
      res.json({ success: true })
    },
  )
  router.get<Record<string, never>, spec.JournalAreasResponse>('/areas', auth, async (req, res) => {
    res.json({ success: true, data: await service.listJournalAreas(req.user ?? '') })
  })
  router.post<Record<string, never>, spec.JournalAreaResponse, spec.CreateJournalAreaBody>(
    '/areas',
    auth,
    validateBody(spec.createJournalAreaBodySchema),
    async (req, res) => {
      res.status(201).json({ success: true, data: await service.createJournalArea(req.user ?? '', req.body) })
    },
  )
  router.patch<{ id: string }, spec.JournalAreaResponse, spec.UpdateJournalAreaBody>(
    '/areas/:id',
    auth,
    validId,
    validateBody(spec.updateJournalAreaBodySchema),
    async (req, res) => {
      res.json({
        success: true,
        data: await service.updateJournalArea(req.user ?? '', req.params.id, req.body),
      })
    },
  )
  router.delete<{ id: string }, spec.JournalSuccessResponse, unknown, spec.JournalDeleteQuery>(
    '/areas/:id',
    auth,
    validId,
    validateQuery(spec.journalDeleteQuerySchema),
    async (req, res) => {
      await service.deleteJournalArea(req.user ?? '', req.params.id, req.query.expected_updated_at)
      res.json({ success: true })
    },
  )
  router.get<Record<string, never>, spec.JournalTemplatesResponse>('/templates', auth, async (req, res) => {
    res.json({ success: true, data: await service.listJournalTemplates(req.user ?? '') })
  })
  router.post<Record<string, never>, spec.JournalTemplateResponse, spec.CreateJournalTemplateBody>(
    '/templates',
    auth,
    validateBody(spec.createJournalTemplateBodySchema),
    async (req, res) => {
      res
        .status(201)
        .json({ success: true, data: await service.createJournalTemplate(req.user ?? '', req.body) })
    },
  )
  router.patch<{ id: string }, spec.JournalTemplateResponse, spec.UpdateJournalTemplateBody>(
    '/templates/:id',
    auth,
    validId,
    validateBody(spec.updateJournalTemplateBodySchema),
    async (req, res) => {
      res.json({
        success: true,
        data: await service.updateJournalTemplate(req.user ?? '', req.params.id, req.body),
      })
    },
  )
  router.delete<{ id: string }, spec.JournalSuccessResponse, unknown, spec.JournalDeleteQuery>(
    '/templates/:id',
    auth,
    validId,
    validateQuery(spec.journalDeleteQuerySchema),
    async (req, res) => {
      await service.deleteJournalTemplate(req.user ?? '', req.params.id, req.query.expected_updated_at)
      res.json({ success: true })
    },
  )
  router.get<{ id: string }, spec.JournalRevisionsResponse>(
    '/entries/:id/revisions',
    auth,
    validId,
    async (req, res) => {
      res.json({ success: true, data: await service.listJournalRevisions(req.user ?? '', req.params.id) })
    },
  )
  router.get<{ id: string }, spec.JournalAttachmentsResponse>(
    '/entries/:id/attachments',
    auth,
    validId,
    async (req, res) => {
      res.json({ success: true, data: await service.listJournalAttachments(req.user ?? '', req.params.id) })
    },
  )
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 1, fieldSize: 200 },
  }).single('file')
  const receiveUpload: AnyMiddleware = (req, res, next) => {
    upload(req, res, (error) =>
      next(
        error instanceof multer.MulterError
          ? httpError(
              error.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
              'Invalid journal upload or upload limit exceeded',
            )
          : error,
      ),
    )
  }
  router.post<{ id: string }, spec.JournalAttachmentResponse>(
    '/entries/:id/attachments',
    auth,
    validId,
    receiveUpload,
    async (req, res) => {
      if (!req.file) throw httpError(400, 'A file is required')
      if (req.body.prompt_id !== undefined && typeof req.body.prompt_id !== 'string') {
        throw httpError(400, 'Invalid prompt identifier')
      }
      res.status(201).json({
        success: true,
        data: await service.addJournalAttachment(req.user ?? '', req.params.id, {
          filename: req.file.originalname,
          mime_type: req.file.mimetype,
          bytes: req.file.buffer,
          prompt_id: req.body.prompt_id,
        }),
      })
    },
  )
  router.get<{ id: string }, spec.JournalAttachmentResponse>(
    '/attachments/:id',
    auth,
    validId,
    async (req, res) => {
      const { metadata, bytes } = await service.getJournalAttachment(req.user ?? '', req.params.id)
      res.setHeader('Content-Type', metadata.mime_type)
      res.setHeader('Content-Length', bytes.length)
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Cache-Control', 'private, no-store')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(metadata.filename).replaceAll("'", '%27')}`,
      )
      res.end(bytes)
    },
  )
  router.delete<{ id: string }, spec.JournalSuccessResponse>(
    '/attachments/:id',
    auth,
    validId,
    async (req, res) => {
      await service.deleteJournalAttachment(req.user ?? '', req.params.id)
      res.json({ success: true })
    },
  )
  return router
}

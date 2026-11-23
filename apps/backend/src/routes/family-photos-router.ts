import type { ErrorRequestHandler } from 'express'

import * as spec from '@aurboda/api-spec'
import express from 'express'
import multer from 'multer'
import { randomBytes } from 'node:crypto'

import type { CentralDb } from '../services/central-db.ts'

import { httpError, isHttpError } from '../http-error.ts'
import { createFamilyService } from '../services/family-photos.ts'
import { familyEnabled, familyMaxUpload, familyPath, safeFamilyFile } from '../services/family-storage.ts'
import { typedRouter, type AnyMiddleware } from '../typed-router.ts'
import { validateBody, validateQuery } from '../validation.ts'

export const FAMILY_HEADERS = {
  'Cache-Control': 'private, no-store',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  'Surrogate-Control': 'no-store',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  Vary: 'Authorization, Cookie',
}
export const familyErrorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (res.headersSent) {
    res.destroy()
    return
  }
  const status = isHttpError(error)
    ? error.status
    : (error as { code?: string })?.code === 'ENOSPC'
      ? 507
      : 500
  res
    .set(FAMILY_HEADERS)
    .status(status)
    .json({
      success: false,
      error:
        isHttpError(error) && status < 500
          ? error.message
          : status === 507
            ? 'Family media storage is full'
            : 'Family Photos is temporarily unavailable',
    })
}
const cookie = (header: string | undefined, name: string) =>
  header
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(name + '='))
    ?.slice(name.length + 1)
const familyPresentation = (
  row: Pick<spec.FamilyItem, 'id' | 'kind' | 'original_filename'> & { mime_type: string },
  variant: string,
) => {
  const original = variant === 'original'
  const preview = row.kind === 'photo' ? 'preview.webp' : 'preview.mp4'
  const files: Record<string, string> = {
    original: 'original',
    thumb: 'thumb.webp',
    preview,
    download: preview,
  }
  const file = files[variant]
  if (!file) throw httpError(404, 'Media not found')
  const mime = original ? row.mime_type : file.endsWith('.webp') ? 'image/webp' : 'video/mp4'
  const filename = original
    ? row.original_filename
    : `family-${row.id}.${file.endsWith('.webp') ? 'webp' : 'mp4'}`
  const disposition = original || variant === 'download' ? 'attachment' : 'inline'
  return { file, mime, filename, disposition }
}
export const createFamilyPhotosRouter = (
  auth: AnyMiddleware,
  db: CentralDb,
  apiBaseUrl: string,
  options: { startWorker?: boolean } = {},
) => {
  const router = typedRouter()
  const service = createFamilyService(db)
  const sessions = new Map<string, { authorization: string; binding: string; expires: number }>()
  const base = new URL(apiBaseUrl)
  const path = base.pathname.replace(/\/$/, '') + '/family-photos'
  const cookieOptions = {
    path,
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: base.protocol === 'https:',
  }
  const name = 'aurboda_family_media'
  const bindingName = 'aurboda_family_identity'
  router.use((_req, res, next) => {
    res.set(FAMILY_HEADERS)
    next()
  })
  router.use((_req, _res, next) => {
    if (!familyEnabled()) next(httpError(404, 'Family Photos is unavailable'))
    else next()
  })
  const role: AnyMiddleware = async (req, _res, next) => {
    try {
      await service.requireAccess(req.user ?? '')
      next()
    } catch (e) {
      next(e)
    }
  }
  const admin: AnyMiddleware = async (req, _res, next) => {
    try {
      await service.requireAccess(req.user ?? '', true)
      next()
    } catch (e) {
      next(e)
    }
  }
  const bearerRequests = new WeakSet<object>()
  const contentAuth: AnyMiddleware = (req, res, next) => {
    if (req.headers.authorization) bearerRequests.add(req)
    if (!req.headers.authorization) {
      const token = cookie(req.headers.cookie, name)
      const session = token ? sessions.get(token) : undefined
      if (
        session &&
        session.expires > Date.now() &&
        session.binding === cookie(req.headers.cookie, bindingName)
      ) {
        req.headers.authorization = session.authorization
      }
    }
    auth(req, res, next)
  }
  router.get<Record<string, never>, spec.FamilyAccessResponse>('/access', auth, async (req, res) =>
    res.json({ success: true, data: await service.access(req.user ?? '') }),
  )
  router.post<Record<string, never>, spec.FamilySuccessResponse>('/session', auth, role, (req, res) => {
    // A noncredential binding changes synchronously on every browser/native account transition.
    // A delayed Set-Cookie from an earlier account then fails closed on subsequent media requests.
    const binding = cookie(req.headers.cookie, bindingName)
    if (
      !binding ||
      !/^[a-f0-9]{32}$/.test(binding) ||
      req.headers['x-family-identity'] !== binding ||
      (req.headers.origin && req.headers.origin !== base.origin)
    ) {
      throw httpError(403, 'Refresh Family Photos to continue')
    }
    for (const [key, value] of sessions) {
      if (value.expires <= Date.now() || value.binding === binding) sessions.delete(key)
    }
    const previous = cookie(req.headers.cookie, name)
    if (previous) sessions.delete(previous)
    if (sessions.size >= 1000) sessions.delete(sessions.keys().next().value ?? '')
    const token = randomBytes(32).toString('hex')
    sessions.set(token, {
      authorization: req.headers.authorization ?? '',
      binding,
      expires: Date.now() + 300_000,
    })
    res.cookie(name, token, { ...cookieOptions, maxAge: 300_000 }).json({ success: true })
  })
  router.delete<Record<string, never>, spec.FamilySuccessResponse>('/session', (req, res) => {
    const key = cookie(req.headers.cookie, name)
    if (key) sessions.delete(key)
    res.clearCookie(name, cookieOptions).json({ success: true })
  })
  router.get<Record<string, never>, spec.FamilyMembersResponse>('/members', auth, admin, async (req, res) =>
    res.json({ success: true, members: await service.members(req.user ?? '') }),
  )
  router.patch<{ username: string }, spec.FamilySuccessResponse, spec.FamilyMembership>(
    '/members/:username',
    auth,
    admin,
    validateBody(spec.familyMembershipSchema),
    async (req, res) => {
      await service.membership(req.user ?? '', req.params.username, req.body.family_member)
      res.json({ success: true })
    },
  )
  router.get<Record<string, never>, spec.FamilyItemsResponse, unknown, spec.FamilyQuery>(
    '/',
    auth,
    role,
    validateQuery(spec.familyQuerySchema),
    async (req, res) => res.json(await service.list(req.user ?? '', req.query)),
  )
  router.get<{ id: string }, spec.FamilyItemResponse>('/items/:id', auth, role, async (req, res) => {
    const row = await service.item(req.user ?? '', req.params.id)
    res.json({
      success: true,
      data: {
        id: row.id,
        kind: row.kind,
        caption: row.caption,
        original_filename: row.original_filename,
        original_bytes: Number(row.original_bytes),
        album_id: row.album_id,
        status: row.status,
        created_at: row.created_at.toISOString(),
        captured_at: row.captured_at?.toISOString() ?? null,
        deleted_at: row.deleted_at?.toISOString() ?? null,
      },
    })
  })
  router.patch<{ id: string }, spec.FamilyItemResponse, spec.FamilyEdit>(
    '/items/:id',
    auth,
    admin,
    validateBody(spec.familyEditSchema),
    async (req, res) =>
      res.json({ success: true, data: await service.edit(req.user ?? '', req.params.id, req.body) }),
  )
  router.delete<{ id: string }, spec.FamilySuccessResponse>('/items/:id', auth, admin, async (req, res) => {
    await service.trash(req.user ?? '', req.params.id)
    res.json({ success: true })
  })
  router.post<{ id: string }, spec.FamilySuccessResponse>(
    '/items/:id/restore',
    auth,
    admin,
    async (req, res) => {
      await service.trash(req.user ?? '', req.params.id, true)
      res.json({ success: true })
    },
  )
  router.post<{ id: string }, spec.FamilySuccessResponse>(
    '/items/:id/retry',
    auth,
    admin,
    async (req, res) => {
      await service.retry(req.user ?? '', req.params.id)
      res.json({ success: true })
    },
  )
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, _file, cb) => {
        const id = resId.get(req)
        if (!id) cb(new Error('Missing reservation'), '')
        else {
          familyPath(id).then(
            (dir) => cb(null, dir),
            () => cb(new Error('Storage unavailable'), ''),
          )
        }
      },
      filename: (_req, _file, cb) => cb(null, 'original'),
    }),
    limits: { files: 1, fileSize: familyMaxUpload(), fields: 1, parts: 2, fieldSize: 8000 },
  }).single('file')
  const resId = new WeakMap<object, string>()
  const receive: AnyMiddleware = async (req, res, next) => {
    let id: string | undefined
    try {
      id = await service.reserve(req.user ?? '')
      resId.set(req, id)
      const deadline = setTimeout(() => req.destroy(), 600_000)
      deadline.unref()
      let finished = false
      const cleanup = () => {
        clearTimeout(deadline)
        if (!finished && id) void service.cancel(id).catch(() => undefined)
      }
      req.once('aborted', cleanup)
      upload(req, res, (error) => {
        clearTimeout(deadline)
        if (error || !req.file) {
          finished = true
          void service.cancel(id ?? '').then(
            () =>
              next(
                httpError(
                  error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
                    ? 413
                    : (error as { code?: string })?.code === 'ENOSPC'
                      ? 507
                      : 400,
                  'Upload could not be stored; check the file and available space',
                ),
              ),
            () => next(httpError(507, 'Storage cleanup is pending')),
          )
        } else {
          finished = true
          next()
        }
      })
    } catch (error) {
      if (id) await service.cancel(id).catch(() => undefined)
      next(error)
    }
  }
  router.post<Record<string, never>, spec.FamilyItemResponse>(
    '/upload',
    auth,
    admin,
    receive,
    async (req, res) => {
      const id = resId.get(req)
      if (!id || !req.file) throw httpError(400, 'Choose a file')
      let saved = false
      try {
        const parsed = spec.familyEditSchema.safeParse(req.body)
        if (!parsed.success) throw httpError(400, 'Caption is too long or invalid')
        const data = await service.finishUpload(
          req.user ?? '',
          id,
          req.file.originalname,
          parsed.data.caption ?? '',
          req.file.mimetype,
        )
        saved = true
        res.status(201).json({ success: true, data })
        if (options.startWorker !== false) void service.tick().catch(() => undefined)
      } finally {
        if (!saved) await service.cancel(id)
      }
    },
  )
  router.get<{ id: string; variant: string }, spec.FamilySuccessResponse>(
    '/media/:id/:variant',
    contentAuth,
    role,
    async (req, res, next) => {
      const row = await service.item(req.user ?? '', req.params.id)
      const variant = req.params.variant
      const original = variant === 'original'
      if (!['original', 'preview', 'thumb', 'download'].includes(variant)) {
        throw httpError(404, 'Media not found')
      }
      // Originals never accept a cookie. Fresh bearer authorization prevents old admin-cookie downloads.
      const current = await service.requireAccess(req.user ?? '')
      if (original && (!bearerRequests.has(req) || (!current.is_admin && !current.originals_enabled))) {
        throw httpError(403, 'Original downloads require fresh administrator authorization')
      }
      if (!original && row.status !== 'ready') throw httpError(409, 'The preview is not ready')
      const presentation = familyPresentation(row, variant)
      const diskPath = await safeFamilyFile(row.id, presentation.file)
      res
        .set(FAMILY_HEADERS)
        .set({ 'Content-Type': presentation.mime, 'Content-Security-Policy': "sandbox; default-src 'none'" })
      res.setHeader(
        'Content-Disposition',
        `${presentation.disposition}; filename*=UTF-8''${encodeURIComponent(presentation.filename).replaceAll("'", '%27')}`,
      )
      // Disable validators and conditional 304s: each authorized request receives a fresh no-store response.
      delete req.headers['if-none-match']
      delete req.headers['if-modified-since']
      delete req.headers['if-range']
      res.sendFile(
        diskPath,
        { cacheControl: false, lastModified: false, etag: false, dotfiles: 'deny', acceptRanges: true },
        (error) => {
          if (error) next(error)
        },
      )
    },
  )
  const timer =
    familyEnabled() && options.startWorker !== false
      ? setInterval(() => {
          void service.tick().catch(() => undefined)
        }, 5000)
      : undefined
  timer?.unref()
  router.use(familyErrorHandler)
  const app = express()
  app.disable('etag')
  app.disable('x-powered-by')
  app.use(router)
  return app
}

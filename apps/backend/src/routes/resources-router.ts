import * as spec from '@aurboda/api-spec'
import multer from 'multer'
import { randomBytes, randomUUID } from 'node:crypto'

import type { CentralDb } from '../services/central-db.ts'

import { httpError } from '../http-error.ts'
import * as storage from '../services/resources-storage.ts'
import { createResourcesService } from '../services/resources.ts'
import { typedRouter, type AnyMiddleware } from '../typed-router.ts'
import { validateBody, validateQuery } from '../validation.ts'

export const createResourcesRouter = (
  auth: AnyMiddleware,
  db: CentralDb,
  apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:3000',
) => {
  const router = typedRouter()
  const service = createResourcesService(db)
  const sessions = new Map<string, { authorization: string; expires: number }>()
  const cookieName = 'aurboda_resources'
  const cookiePath = (_url: string) => new URL(apiBaseUrl).pathname.replace(/\/$/, '') + '/resources'
  const admin: AnyMiddleware = async (req, _res, next) => {
    try {
      await service.requireAdmin(req.user ?? '')
      next()
    } catch (error) {
      next(error)
    }
  }
  const contentAuth: AnyMiddleware = (req, res, next) => {
    if (!req.headers.authorization) {
      const token = req.headers.cookie
        ?.split(';')
        .map((x) => x.trim())
        .find((x) => x.startsWith(`${cookieName}=`))
        ?.slice(cookieName.length + 1)
      const session = token ? sessions.get(token) : undefined
      if (session && session.expires > Date.now()) req.headers.authorization = session.authorization
    }
    auth(req, res, next)
  }
  router.post<Record<string, never>, spec.ResourceSuccessResponse>('/session', auth, (req, res) => {
    for (const [key, session] of sessions) if (session.expires <= Date.now()) sessions.delete(key)
    if (sessions.size >= 10000) sessions.delete(sessions.keys().next().value ?? '')
    const token = randomBytes(32).toString('hex')
    sessions.set(token, {
      authorization: req.headers.authorization ?? '',
      expires: Date.now() + 15 * 60 * 1000,
    })
    res.cookie(cookieName, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure:
        new URL(apiBaseUrl).protocol === 'https:' ||
        req.secure ||
        req.headers['x-forwarded-proto'] === 'https',
      path: cookiePath(req.originalUrl),
      maxAge: 15 * 60 * 1000,
    })
    res.json({ success: true })
  })
  router.delete<Record<string, never>, spec.ResourceSuccessResponse>('/session', (_req, res) => {
    const token = _req.headers.cookie
      ?.split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1)
    if (token) sessions.delete(token)
    res.clearCookie(cookieName, { path: cookiePath(_req.originalUrl), httpOnly: true, sameSite: 'strict' })
    res.json({ success: true })
  })
  router.get<Record<string, never>, spec.ResourcesResponse>('/', auth, async (req, res) => {
    res.json(await service.list(req.user ?? ''))
  })
  router.post<Record<string, never>, spec.ResourceFolderResponse, spec.CreateResourceFolderBody>(
    '/folders',
    auth,
    validateBody(spec.createResourceFolderBodySchema),
    async (req, res) => {
      res.status(201).json({ success: true, data: await service.createFolder(req.user ?? '', req.body) })
    },
  )
  router.patch<{ id: string }, spec.ResourceFolderResponse, spec.UpdateResourceFolderBody>(
    '/folders/:id',
    auth,
    validateBody(spec.updateResourceFolderBodySchema),
    async (req, res) => {
      res.json({ success: true, data: await service.updateFolder(req.user ?? '', req.params.id, req.body) })
    },
  )
  router.delete<{ id: string }, spec.ResourceSuccessResponse, unknown, spec.ResourceDeleteQuery>(
    '/folders/:id',
    auth,
    validateQuery(spec.resourceDeleteQuerySchema),
    async (req, res) => {
      await service.deleteFolder(req.user ?? '', req.params.id, req.query.recursive === 'true')
      await service.cleanup()
      res.json({ success: true })
    },
  )
  router.post<Record<string, never>, spec.ResourceItemResponse, spec.CreateResourceLinkBody>(
    '/links',
    auth,
    validateBody(spec.createResourceLinkBodySchema),
    async (req, res) => {
      res.status(201).json({ success: true, data: await service.createLink(req.user ?? '', req.body) })
    },
  )
  router.patch<{ id: string }, spec.ResourceItemResponse, spec.UpdateResourceItemBody>(
    '/items/:id',
    auth,
    validateBody(spec.updateResourceItemBodySchema),
    async (req, res) => {
      res.json({ success: true, data: await service.updateItem(req.user ?? '', req.params.id, req.body) })
    },
  )
  router.delete<{ id: string }, spec.ResourceSuccessResponse>('/items/:id', auth, async (req, res) => {
    await service.deleteItem(req.user ?? '', req.params.id)
    await service.cleanup()
    res.json({ success: true })
  })
  const upload = multer({
    preservePath: true,
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        storage.resourcesStorageRoot().then(
          (root) => cb(null, root),
          (error) => cb(error, ''),
        )
      },
      filename: (_req, file, cb) => {
        try {
          file.originalname = storage.decodeResourceFilename(file.originalname)
          storage.validateResourceFilename(file.originalname)
          const key = randomUUID()
          service.reserveUpload(key).then(
            () => cb(null, key),
            (error) => cb(error, ''),
          )
        } catch (error) {
          cb(error as Error, '')
        }
      },
    }),
    limits: { fileSize: storage.resourcesMaxUploadBytes(), files: 1, fields: 3, parts: 5, fieldSize: 12000 },
  }).single('file')
  const receive: AnyMiddleware = (req, res, next) => {
    const deadline = setTimeout(() => req.destroy(), 60 * 60 * 1000)
    deadline.unref()
    req.once('close', () => clearTimeout(deadline))
    upload(req, res, (error) => {
      if (error) {
        const code = (error as NodeJS.ErrnoException).code
        next(
          httpError(
            code === 'ENOSPC'
              ? 507
              : error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
                ? 413
                : 400,
            code === 'ENOSPC'
              ? 'Resource storage is full'
              : error instanceof multer.MulterError
                ? 'Upload rejected: ' + error.code
                : 'Unable to store this upload',
          ),
        )
      } else next()
    })
  }
  router.post<Record<string, never>, spec.ResourceItemResponse, spec.ResourceUploadBody>(
    '/upload',
    auth,
    admin,
    receive,
    async (req, res) => {
      if (!req.file) throw httpError(400, 'Choose a file to upload')
      let saved = false
      try {
        const file = await storage.inspectResourceFile(
          req.file.filename,
          req.file.originalname,
          req.file.mimetype,
        )
        const parsed = spec.resourceUploadBodySchema.safeParse({
          ...req.body,
          parent_id: req.body.parent_id || null,
        })
        if (!parsed.success) {
          throw httpError(400, parsed.error.issues.map((issue) => issue.message).join('; '))
        }
        const data = await service.addFile(req.user ?? '', parsed.data, file)
        saved = true
        res.status(201).json({ success: true, data })
      } finally {
        if (!saved) await service.cancelUpload(req.file.filename)
      }
    },
  )
  router.get<{ id: string }, spec.ResourceSuccessResponse, unknown, spec.ResourceContentQuery>(
    '/items/:id/content',
    contentAuth,
    validateQuery(spec.resourceContentQuerySchema),
    async (req, res, next) => {
      const { item, key } = await service.getFile(req.params.id)
      const path = await storage.checkResourceFile(key)
      res.set({
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'",
        'Content-Type': item.mime_type ?? 'application/octet-stream',
      })
      const disposition = req.query.download || item.kind === 'document' ? 'attachment' : 'inline'
      res.setHeader(
        'Content-Disposition',
        `${disposition}; filename*=UTF-8''${encodeURIComponent(item.original_filename ?? 'resource').replaceAll("'", '%27')}`,
      )
      res.sendFile(path, { cacheControl: false, dotfiles: 'deny' }, (error) => {
        if (error) next(error)
      })
    },
  )
  // Durable deletion tombstones are retried on each management request and server restart.
  void service.cleanup().catch((error) => console.error('Resources cleanup deferred', error))
  return router
}

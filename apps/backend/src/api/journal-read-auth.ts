import type { CentralDb } from '../services/central-db.ts'
import type { AnyMiddleware } from '../typed-router.ts'

import { migrateSchemaIfNeeded } from '../db/index.ts'
import { httpError } from '../http-error.ts'
import { isOAuthAccessToken, validateAccessIdentity } from '../services/oauth.ts'

export const createJournalReadAuth =
  (accountAuth: AnyMiddleware, centralDb: CentralDb): AnyMiddleware =>
  async (req, res, next) => {
    const header = req.headers.authorization
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!isOAuthAccessToken(token)) return accountAuth(req, res, next)
    if (req.method !== 'GET' && req.method !== 'HEAD') return next(httpError(403, 'Read access only'))
    try {
      const identity = await validateAccessIdentity({ centralDb }, token)
      if (!identity || (await centralDb.isUsernameDeleted(identity.username))) {
        return next(httpError(401, 'Unauthorized'))
      }
      await migrateSchemaIfNeeded(identity.username)
      req.user = identity.username
      return next()
    } catch {
      return next(httpError(503, 'Journal access is temporarily unavailable. Please retry.'))
    }
  }

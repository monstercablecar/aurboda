import type { RequestHandler } from 'express'

import multer from 'multer'

import { httpError } from './http-error.ts'

export const receiveUpload =
  (upload: RequestHandler): RequestHandler =>
  (req, res, next) => {
    upload(req, res, (error: unknown) => {
      next(
        error instanceof multer.MulterError
          ? httpError(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, 'Upload limit exceeded')
          : error,
      )
    })
  }

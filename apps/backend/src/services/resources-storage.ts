import type { ResourceKind } from '@aurboda/api-spec'

import { constants } from 'node:fs'
import { lstat, mkdir, open, realpath, unlink } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'

import { httpError } from '../http-error.ts'

export const resourcesMaxUploadBytes = () => {
  const n = Number(process.env.RESOURCES_MAX_UPLOAD_BYTES ?? 268435456)
  if (!Number.isSafeInteger(n) || n < 1) throw new Error('Invalid RESOURCES_MAX_UPLOAD_BYTES')
  return n
}
export const resourcesStorageRoot = async () => {
  const root = resolve(process.env.RESOURCES_STORAGE_DIR ?? '/data/resources')
  await mkdir(root, { recursive: true, mode: 0o700 })
  if ((await lstat(root)).isSymbolicLink() || (await realpath(root)) !== root) {
    throw new Error('Resources storage must not contain symlinks')
  }
  return root
}
export const resourcePath = async (key: string) => {
  if (!/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(key)) {
    throw httpError(400, 'Invalid storage identifier')
  }
  return join(await resourcesStorageRoot(), key)
}
export const removeResourceFile = async (key: string) => {
  try {
    await unlink(await resourcePath(key))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}
// Browser multipart filenames use UTF-8 while the multipart parser defaults to Latin-1.
export const decodeResourceFilename = (name: string): string => {
  if ([...name].some((character) => character.charCodeAt(0) > 255)) return name
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(name, 'latin1'))
  } catch {
    return name
  }
}
export const validateResourceFilename = (name: string) => {
  if (
    !name ||
    name.length > 240 ||
    /[/\\]/.test(name) ||
    [...name].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
    name === '.' ||
    name === '..' ||
    name.startsWith('.') ||
    name.trim() !== name
  ) {
    throw httpError(400, 'Unsafe filename')
  }
}
const formats: Record<string, { mime: string; kind: ResourceKind; signature: (b: Buffer) => boolean }> = {
  '.pdf': { mime: 'application/pdf', kind: 'pdf', signature: (b) => b.subarray(0, 5).toString() === '%PDF-' },
  '.jpg': {
    mime: 'image/jpeg',
    kind: 'image',
    signature: (b) => b[0] === 255 && b[1] === 216 && b[2] === 255,
  },
  '.png': {
    mime: 'image/png',
    kind: 'image',
    signature: (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
  '.webp': {
    mime: 'image/webp',
    kind: 'image',
    signature: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
  },
  '.mp4': { mime: 'video/mp4', kind: 'video', signature: (b) => b.subarray(4, 8).toString() === 'ftyp' },
  '.webm': {
    mime: 'video/webm',
    kind: 'video',
    signature: (b) =>
      b.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])) && b.includes(Buffer.from('webm')),
  },
  '.txt': {
    mime: 'text/plain',
    kind: 'document',
    signature: (b) => !b.includes(0) && !/^\s*</.test(b.toString()),
  },
  '.csv': {
    mime: 'text/csv',
    kind: 'document',
    signature: (b) => !b.includes(0) && !/^\s*</.test(b.toString()),
  },
  '.rtf': {
    mime: 'application/rtf',
    kind: 'document',
    signature: (b) => b.subarray(0, 5).toString() === '{\\rtf',
  },
}
formats['.jpeg'] = formats['.jpg']
for (const extension of ['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp']) {
  formats[`.${extension}`] = {
    mime: 'application/octet-stream',
    kind: 'document',
    signature: (b) => b.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4])),
  }
}
for (const extension of ['doc', 'xls', 'ppt']) {
  formats[`.${extension}`] = {
    mime: 'application/octet-stream',
    kind: 'document',
    signature: (b) => b.subarray(0, 8).equals(Buffer.from([208, 207, 17, 224, 161, 177, 26, 225])),
  }
}
export const inspectResourceFile = async (key: string, name: string, claimedMime: string) => {
  validateResourceFilename(name)
  const format = formats[extname(name).toLowerCase()]
  if (!format) throw httpError(415, 'Unsupported file type')
  const handle = await open(await resourcePath(key), constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || !stat.size) throw httpError(400, 'Empty or invalid file')
    if (stat.size > resourcesMaxUploadBytes()) throw httpError(413, 'File exceeds upload limit')
    const buffer = Buffer.alloc(Math.min(stat.size, 4096))
    await handle.read(buffer, 0, buffer.length, 0)
    if (!format.signature(buffer)) throw httpError(415, 'File content does not match its extension')
    if (
      format.kind !== 'document' &&
      claimedMime !== format.mime &&
      claimedMime !== 'application/octet-stream'
    ) {
      throw httpError(415, 'File MIME type does not match its extension')
    }
    return { key, name, size: stat.size, mime: format.mime, kind: format.kind }
  } finally {
    await handle.close()
  }
}
export const checkResourceFile = async (key: string) => {
  const path = await resourcePath(key)
  try {
    const stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('invalid')
    return path
  } catch {
    throw httpError(404, 'The stored file is unavailable. Contact an administrator.')
  }
}

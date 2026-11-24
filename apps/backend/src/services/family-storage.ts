import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { chmod, lstat, mkdir, open, realpath, statfs } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { httpError } from '../http-error.ts'

export const familyEnabled = () => process.env.FAMILY_PHOTOS_ENABLED === 'true'
export const familyLimit = (name: string, fallback: number, ceiling = Number.MAX_SAFE_INTEGER) => {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(value) || value <= 0 || value > ceiling) {
    throw new Error('Invalid family limit configuration')
  }
  return value
}
export const familyMaxUpload = () => familyLimit('FAMILY_MAX_UPLOAD_BYTES', 90 * 1024 ** 2, 2 * 1024 ** 3)
export const familyMaxDerivative = () =>
  familyLimit('FAMILY_MAX_DERIVATIVE_BYTES', 128 * 1024 ** 2, 2 * 1024 ** 3)
export const familyWorkspace = () => familyLimit('FAMILY_WORKSPACE_BYTES', 512 * 1024 ** 2)
export const familyRoot = async () => {
  const configured = process.env.FAMILY_STORAGE_DIR
  if (!configured?.startsWith('/')) throw new Error('FAMILY_STORAGE_DIR must be absolute')
  const root = resolve(configured)
  await mkdir(root, { recursive: true, mode: 0o700 })
  if ((await lstat(root)).isSymbolicLink() || (await realpath(root)) !== root) {
    throw new Error('Unsafe family storage root')
  }
  await chmod(root, 0o700)
  return root
}
export const syncFamilyFile = async (path: string) => {
  const file = await open(path, 'r')
  try {
    await file.sync()
  } finally {
    await file.close()
  }
}
export const familyId = (value: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw httpError(404, 'Media not found')
  }
  return value
}
export const familyPath = async (id: string, file = '') => join(await familyRoot(), familyId(id), file)
export const familySpace = async (required: number) => {
  const disk = await statfs(await familyRoot())
  if (disk.bavail * disk.bsize < required + familyLimit('FAMILY_MIN_FREE_BYTES', 1024 ** 3)) {
    throw httpError(507, 'Family media storage is full')
  }
}
export const safeFamilyFile = async (id: string, file: string) => {
  const path = await familyPath(id, file)
  const directory = await familyPath(id)
  if ((await lstat(directory)).isSymbolicLink() || (await realpath(directory)) !== directory) {
    throw httpError(404, 'Media not found')
  }
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink()) throw httpError(404, 'Media not found')
  return path
}
export const familyFilename = (name: string) =>
  name
    .replaceAll('\\', '/')
    .split('/')
    .pop()
    ?.replaceAll(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, 180) || 'family-media'
export const familyHash = async (path: string) => {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(path)) hash.update(bytes)
  return hash.digest('hex')
}
export const sniffFamily = async (path: string) => {
  const fd = await open(path, 'r')
  const buffer = Buffer.alloc(64)
  try {
    await fd.read(buffer, 0, 64, 0)
  } finally {
    await fd.close()
  }
  if (buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) {
    return { kind: 'photo' as const, mime: 'image/jpeg', format: 'jpeg' }
  }
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { kind: 'photo' as const, mime: 'image/png', format: 'png' }
  }
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { kind: 'photo' as const, mime: 'image/webp', format: 'webp' }
  }
  if (buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12)
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) {
      return { kind: 'photo' as const, mime: 'image/heic', format: 'heic' }
    }
    if (['avif', 'avis'].includes(brand)) {
      return { kind: 'photo' as const, mime: 'image/avif', format: 'avif' }
    }
    if (['isom', 'iso2', 'mp41', 'mp42', 'M4V ', 'qt  ', '3gp4', '3gp5', 'MSNV', 'dash'].includes(brand)) {
      return {
        kind: 'video' as const,
        mime: brand === 'qt  ' ? 'video/quicktime' : 'video/mp4',
        format: 'mov',
      }
    }
  }
  throw httpError(415, 'Choose a JPEG, PNG, WebP, HEIC, AVIF, MP4 or MOV file')
}

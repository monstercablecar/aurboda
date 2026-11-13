import { resourceUrlSchema } from '@aurboda/api-spec'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  inspectResourceFile,
  resourcePath,
  validateResourceFilename,
  checkResourceFile,
} from './resources-storage.ts'
let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'resources-test-'))
  process.env.RESOURCES_STORAGE_DIR = root
})
afterEach(async () => {
  delete process.env.RESOURCES_STORAGE_DIR
  delete process.env.RESOURCES_MAX_UPLOAD_BYTES
  await rm(root, { recursive: true, force: true })
})
describe('secure resource storage', () => {
  test.each(['../secret.pdf', 'folder/file.pdf', 'folder\\file.pdf', '.hidden', 'bad\n.pdf'])(
    'rejects unsafe name %s',
    (name) => expect(() => validateResourceFilename(name)).toThrow(),
  )
  test.each([
    'javascript:alert(1)',
    'data:text/html,hi',
    'file:///etc/passwd',
    'https://user:password@example.com',
  ])('rejects unsafe link %s', (url) => expect(resourceUrlSchema.safeParse(url).success).toBe(false))
  test('accepts HTTPS URLs without fetching', () =>
    expect(resourceUrlSchema.parse('https://example.com/a')).toBe('https://example.com/a'))
  test('inspects bounded content, size and type', async () => {
    const key = randomUUID()
    await writeFile(await resourcePath(key), '%PDF-1.7\ncontent')
    expect(await inspectResourceFile(key, 'report.pdf', 'application/pdf')).toMatchObject({
      kind: 'pdf',
      size: 16,
    })
    await expect(inspectResourceFile(key, 'report.png', 'image/png')).rejects.toThrow('content')
    await expect(inspectResourceFile(key, 'report.pdf', 'text/html')).rejects.toThrow('MIME')
    process.env.RESOURCES_MAX_UPLOAD_BYTES = '5'
    await expect(inspectResourceFile(key, 'report.pdf', 'application/pdf')).rejects.toThrow('limit')
  })
  test('rejects active content and path traversal', async () => {
    await expect(resourcePath('../../etc/passwd')).rejects.toThrow()
    const key = randomUUID()
    await writeFile(await resourcePath(key), '<svg/>')
    await expect(inspectResourceFile(key, 'x.svg', 'image/svg+xml')).rejects.toThrow('Unsupported')
  })
  test('rejects symlink and missing content', async () => {
    const key = randomUUID()
    await symlink('/etc/passwd', await resourcePath(key))
    await expect(checkResourceFile(key)).rejects.toThrow('unavailable')
    await expect(inspectResourceFile(key, 'x.txt', 'text/plain')).rejects.toThrow()
    await expect(checkResourceFile(randomUUID())).rejects.toThrow('unavailable')
  })
})

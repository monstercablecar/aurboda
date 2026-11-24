// Separate bounded process: native decoder failures cannot take down the API.
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import sharp from 'sharp'

const [original, work, format, pixels] = process.argv.slice(2)
sharp.concurrency(1)
sharp.cache(false)
let input = original
if (format === 'heic') {
  const info = spawnSync('heif-info', [original], {
    timeout: 10_000,
    maxBuffer: 256 * 1024,
    encoding: 'utf8',
  })
  const dimensions = [...(info.stdout ?? '').matchAll(/image: (\d+)x(\d+)/g)]
  if (
    info.status !== 0 ||
    dimensions.length !== 1 ||
    Number(dimensions[0][1]) * Number(dimensions[0][2]) > Number(pixels)
  ) {
    process.exit(1)
  }
  input = join(work, 'decoded.jpg')
  const converted = spawnSync('heif-convert', [original, input], {
    timeout: 60_000,
    maxBuffer: 256 * 1024,
    stdio: 'pipe',
  })
  if (converted.status !== 0) process.exit(1)
}
const image = sharp(input, { limitInputPixels: Number(pixels), animated: false, failOn: 'warning' })
const meta = await image.metadata()
if (
  !meta.format ||
  !['jpeg', 'png', 'webp', 'heif', 'avif'].includes(meta.format) ||
  !meta.width ||
  !meta.height ||
  meta.width * meta.height > Number(pixels)
) {
  process.exit(1)
}
// Preserve only the timestamp, never the EXIF/GPS payload in shared output.
let captured_at: string | null = null
if (meta.exif) {
  const match = meta.exif
    .toString('latin1')
    .match(/(20\d{2}):([01]\d):([0-3]\d) ([0-2]\d):([0-5]\d):([0-5]\d)/)
  if (match) {
    const candidate = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`
    if (Number.isFinite(Date.parse(candidate))) captured_at = candidate
  }
}
await image
  .clone()
  .rotate()
  .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
  .webp({ quality: 84 })
  .toFile(join(work, 'preview.webp'))
await image
  .clone()
  .rotate()
  .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
  .webp({ quality: 76 })
  .toFile(join(work, 'thumb.webp'))
process.stdout.write(JSON.stringify({ captured_at }))

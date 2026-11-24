import { spawn } from 'node:child_process'
import { lstat, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  familyLimit,
  familyMaxDerivative,
  familyPath,
  familySpace,
  familyWorkspace,
  syncFamilyFile,
} from './family-storage.ts'

// prlimit confines native decoders too. No shell, inherited secrets, network protocols or user paths.
export const familyCommand = (command: string, args: string[], timeout = 900_000, workspace?: string) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn(
      'prlimit',
      ['--as=2147483648', '--fsize=' + familyWorkspace(), '--cpu=900', '--nofile=64', '--', command, ...args],
      {
        env: {
          PATH: process.env.PATH,
          LANG: 'C',
          VIPS_CONCURRENCY: '1',
          MALLOC_ARENA_MAX: '2',
          UV_THREADPOOL_SIZE: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      },
    )
    let output = ''
    let count = 0
    const kill = () => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL')
      } catch {
        /* Already exited. */
      }
    }
    const timer = setTimeout(kill, timeout)
    let watching = false
    const watchdog = workspace
      ? setInterval(() => {
          if (watching) return
          watching = true
          void (async () => {
            let bytes = 0
            for (const name of await readdir(workspace)) bytes += (await lstat(join(workspace, name))).size
            if (bytes > familyWorkspace()) kill()
            await familySpace(1)
          })()
            .catch(kill)
            .finally(() => {
              watching = false
            })
        }, 500)
      : undefined
    const collect = (bytes: Buffer, retain: boolean) => {
      count += bytes.length
      if (count > 1024 * 1024) kill()
      else if (retain) output += bytes.toString()
    }
    child.stdout.on('data', (data: Buffer) => collect(data, true))
    child.stderr.on('data', (data: Buffer) => collect(data, false))
    child.on('error', () => {
      clearTimeout(timer)
      if (watchdog) clearInterval(watchdog)
      reject(new Error('Media processing unavailable'))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (watchdog) clearInterval(watchdog)
      kill()
      if (code === 0) resolve(output)
      else reject(new Error('Media conversion failed'))
    })
  })
interface FamilyVideoStream {
  codec_type?: string
  width?: number
  height?: number
}
interface VideoProbe {
  streams?: FamilyVideoStream[]
  format?: { duration?: string; tags?: { creation_time?: string } }
}
const familyVideoDimensions = (video: FamilyVideoStream) => {
  if (!video?.width || !video.height) return false
  return video.width <= 8192 && video.height <= 8192 && video.width * video.height <= 40_000_000
}
export const probeFamilyVideo = async (path: string) => {
  const data: VideoProbe = JSON.parse(
    await familyCommand(
      'ffprobe',
      [
        '-v',
        'error',
        '-protocol_whitelist',
        'file,pipe',
        '-format_whitelist',
        'mov',
        '-f',
        'mov',
        '-enable_drefs',
        '0',
        '-show_entries',
        'stream=codec_type,width,height:format=duration:format_tags=creation_time',
        '-of',
        'json',
        path,
      ],
      30_000,
    ),
  )
  const video = data.streams?.find((x) => x.codec_type === 'video')
  const duration = Number(data.format?.duration)
  if (
    !familyVideoDimensions(video ?? {}) ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > familyLimit('FAMILY_MAX_VIDEO_SECONDS', 1800, 7200)
  ) {
    throw new Error('Unsupported video dimensions or duration')
  }
  const date = data.format?.tags?.creation_time
  return {
    duration,
    captured_at: date && Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : null,
  }
}
export const processFamilyMedia = async (id: string, kind: 'photo' | 'video', format: string) => {
  await familySpace(familyWorkspace() + familyMaxDerivative())
  const original = await familyPath(id, 'original')
  const work = await familyPath(id, 'work')
  await rm(work, { recursive: true, force: true })
  await mkdir(work, { mode: 0o700 })
  let captured_at: string | null = null
  try {
    if (kind === 'photo') {
      const result = await familyCommand(
        process.execPath,
        [
          '--max-old-space-size=256',
          fileURLToPath(new URL('./family-photo-worker.ts', import.meta.url)),
          original,
          work,
          format,
          String(familyLimit('FAMILY_MAX_IMAGE_PIXELS', 80_000_000, 200_000_000)),
        ],
        120_000,
        work,
      )
      const meta: { captured_at?: string | null } = JSON.parse(result)
      captured_at = meta.captured_at ?? null
    } else {
      const source = await probeFamilyVideo(original)
      captured_at = source.captured_at
      const input = [
        '-nostdin',
        '-v',
        'error',
        '-threads',
        '1',
        '-protocol_whitelist',
        'file,pipe',
        '-format_whitelist',
        'mov',
        '-f',
        'mov',
        '-enable_drefs',
        '0',
        '-i',
        original,
      ]
      await familyCommand(
        'ffmpeg',
        [
          ...input,
          '-map',
          '0:v:0',
          '-map',
          '0:a:0?',
          '-map_metadata',
          '-1',
          '-map_chapters',
          '-1',
          '-sn',
          '-dn',
          '-vf',
          "scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
          '-c:v',
          'libx264',
          '-threads',
          '1',
          '-filter_threads',
          '1',
          '-preset',
          'veryfast',
          '-crf',
          '25',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-movflags',
          '+faststart',
          '-fs',
          String(familyMaxDerivative() - 1024 * 1024),
          '-y',
          work + '/preview.mp4',
        ],
        900_000,
        work,
      )
      const converted = await probeFamilyVideo(work + '/preview.mp4')
      if (Math.abs(converted.duration - source.duration) > Math.max(0.5, source.duration * 0.01)) {
        throw new Error('Preview was truncated')
      }
      await familyCommand(
        'ffmpeg',
        [
          '-nostdin',
          '-v',
          'error',
          '-threads',
          '1',
          '-protocol_whitelist',
          'file,pipe',
          '-f',
          'mov',
          '-i',
          work + '/preview.mp4',
          '-map',
          '0:v:0',
          '-frames:v',
          '1',
          '-vf',
          'scale=480:480:force_original_aspect_ratio=decrease',
          '-map_metadata',
          '-1',
          '-threads',
          '1',
          '-filter_threads',
          '1',
          '-y',
          work + '/thumb.webp',
        ],
        30_000,
      )
    }
    const preview = kind === 'photo' ? 'preview.webp' : 'preview.mp4'
    const size = (await lstat(work + '/' + preview)).size + (await lstat(work + '/thumb.webp')).size
    if (size <= 0 || size >= familyMaxDerivative()) throw new Error('Preview exceeds processing limit')
    // Sharp verifies generated thumbnails; video ffprobe above verifies playable output.
    const signature = await readFile(work + '/thumb.webp')
    if (signature.toString('ascii', 8, 12) !== 'WEBP') throw new Error('Invalid preview')
    await syncFamilyFile(work + '/' + preview)
    await syncFamilyFile(work + '/thumb.webp')
    await rename(work + '/' + preview, await familyPath(id, preview))
    await rename(work + '/thumb.webp', await familyPath(id, 'thumb.webp'))
    await syncFamilyFile(dirname(work))
    return { captured_at, size }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

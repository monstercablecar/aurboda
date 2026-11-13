import type { JournalAttachment } from '@aurboda/api-spec'

import { useEffect, useRef, useState } from 'preact/hooks'

import { journalApi } from '../../state/api/journal'

const MAX_BYTES = 20 * 1024 * 1024
const allowed = /^(audio\/(webm|ogg|mpeg|mp4|wav|x-wav|aac)|image\/(jpeg|png|gif|webp))$/
export const validJournalFile = (file: File) =>
  file.size > 0 && file.size <= MAX_BYTES && allowed.test(file.type.split(';')[0])

export function AudioRecorder({
  onSave,
  promptId,
  onPendingChange,
}: {
  onSave: (file: File, promptId?: string) => Promise<void>
  promptId?: string
  onPendingChange?: (pending: boolean) => void
}) {
  const [status, setStatus] = useState<'idle' | 'recording' | 'paused' | 'requesting'>('idle')
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    onPendingChange?.(Boolean(file) || status !== 'idle')
    return () => onPendingChange?.(false)
  }, [file, status, onPendingChange])
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const mounted = useRef(true)
  const stopTracks = () => {
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
  }
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop()
      stopTracks()
    }
  }, [])
  useEffect(() => {
    if (!file) {
      setUrl('')
      return
    }
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])
  useEffect(() => {
    if (status !== 'recording') return
    const timer = window.setInterval(() => setSeconds((n) => n + 1), 1000)
    return () => window.clearInterval(timer)
  }, [status])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (file || status !== 'idle') {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [file, status])
  const start = async () => {
    setError('')
    if (
      !window.isSecureContext ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setError(
        'Recording needs a supported browser and a secure HTTPS connection. You can upload an audio file instead.',
      )
      return
    }
    setStatus('requesting')
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mounted.current) {
        media.getTracks().forEach((track) => track.stop())
        return
      }
      stream.current = media
      const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((type) =>
        MediaRecorder.isTypeSupported(type),
      )
      const capture = new MediaRecorder(media, mime ? { mimeType: mime } : undefined)
      recorder.current = capture
      const chunks: Blob[] = []
      let bytes = 0
      let failed = false
      capture.ondataavailable = (event) => {
        bytes += event.data.size
        if (bytes <= MAX_BYTES) chunks.push(event.data)
        else if (capture.state !== 'inactive') {
          setError('Recording reached the 20 MB limit and was stopped.')
          capture.stop()
        }
      }
      capture.onerror = () => {
        failed = true
        stopTracks()
        if (mounted.current) {
          setStatus('idle')
          setError('Recording failed. Please try again or upload an audio file.')
        }
      }
      capture.onstop = () => {
        stopTracks()
        if (!mounted.current || failed) return
        const type = capture.mimeType || mime || 'audio/webm'
        const blob = new File(
          chunks,
          `journal-recording.${type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'}`,
          { type },
        )
        if (validJournalFile(blob)) setFile(blob)
        else {
          setError(
            'This recording is empty or uses an unsupported audio format. Please try uploading an audio file.',
          )
        }
        setStatus('idle')
      }
      setSeconds(0)
      capture.start(1000)
      setStatus('recording')
    } catch (cause) {
      stopTracks()
      if (!mounted.current) return
      setStatus('idle')
      setError(
        cause instanceof DOMException && cause.name === 'NotAllowedError'
          ? 'Microphone access was declined. Allow microphone access in your browser or upload an audio file.'
          : 'The microphone could not be started. Check your device and try again.',
      )
    }
  }
  const save = async () => {
    if (!file || saving) return
    setSaving(true)
    setError('')
    try {
      await onSave(file, promptId)
      if (mounted.current) setFile(null)
    } catch {
      if (mounted.current) {
        setError('Upload failed. Your file is still here. Retry or download a copy before leaving.')
      }
    } finally {
      if (mounted.current) setSaving(false)
    }
  }
  return (
    <section class="journal-audio" aria-label={promptId ? 'Audio answer' : 'Record or upload'}>
      <div class="journal-actions">
        {status === 'idle' && !file && (
          <button type="button" onClick={() => void start()}>
            Record audio
          </button>
        )}
        {status === 'requesting' && <span role="status">Waiting for microphone access…</span>}
        {(status === 'recording' || status === 'paused') && (
          <>
            <span role="status">
              {status === 'paused' ? 'Paused' : 'Recording'} · {Math.floor(seconds / 60)}:
              {String(seconds % 60).padStart(2, '0')}
            </span>
            <button
              type="button"
              onClick={() => {
                if (status === 'recording') {
                  recorder.current?.pause()
                  setStatus('paused')
                } else {
                  recorder.current?.resume()
                  setStatus('recording')
                }
              }}
            >
              {status === 'recording' ? 'Pause' : 'Resume'}
            </button>
            <button type="button" onClick={() => recorder.current?.stop()}>
              Stop recording
            </button>
          </>
        )}
        {status === 'idle' && !file && (
          <label>
            Upload image or audio{' '}
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,audio/webm,audio/ogg,audio/mpeg,audio/mp4,audio/wav,audio/x-wav,audio/aac"
              onChange={(event) => {
                const next = event.currentTarget.files?.[0]
                if (next) {
                  if (validJournalFile(next)) {
                    setFile(next)
                    setError('')
                  } else {
                    setError(
                      'Choose an image or audio file under 20 MB. SVG and executable files are not supported.',
                    )
                  }
                }
                event.currentTarget.value = ''
              }}
            />
          </label>
        )}
      </div>
      {file && (
        <div>
          <p>{file.name}</p>
          <MediaPreview url={url} mime={file.type} label="Attachment preview" />
          <p>
            This file is not saved yet. Keep this page open until upload finishes, or download a recovery
            copy.
          </p>
          <div class="journal-actions">
            <button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? 'Uploading…' : 'Save attachment'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                if (window.confirm('Discard this unsaved file?')) setFile(null)
              }}
            >
              Discard
            </button>
            {url && (
              <a href={url} download={file.name}>
                Download recovery copy
              </a>
            )}
          </div>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

export function AttachmentView({
  attachment,
  onDelete,
}: {
  attachment: JournalAttachment
  onDelete: () => Promise<void>
}) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    let objectUrl = ''
    setUrl('')
    setError('')
    void journalApi
      .attachmentBlob(attachment.id)
      .then((blob) => {
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => {
        if (active) setError('Could not load this attachment.')
      })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [attachment.id, attempt])
  return (
    <figure class="journal-attachment">
      <figcaption>{attachment.filename}</figcaption>
      {url &&
        (attachment.mime_type.startsWith('audio/') ? (
          <audio controls src={url} />
        ) : (
          <img src={url} alt={attachment.filename} style={{ maxWidth: '100%', maxHeight: '320px' }} />
        ))}
      <div class="journal-actions">
        {url && (
          <a href={url} download={attachment.filename}>
            Download original
          </a>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm('Permanently delete this attachment?')) return
            setBusy(true)
            try {
              await onDelete()
            } catch {
              setError('Could not delete this attachment.')
              setBusy(false)
            }
          }}
        >
          Delete attachment
        </button>
      </div>
      {error && (
        <p role="alert">
          {error}{' '}
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </button>
        </p>
      )}
    </figure>
  )
}

function MediaPreview({ url, mime, label }: { url: string; mime: string; label: string }) {
  if (!url) return null
  return mime.startsWith('audio/') ? (
    <audio controls src={url} />
  ) : (
    <img src={url} alt={label} style={{ maxWidth: '100%', maxHeight: '240px' }} />
  )
}

import { useEffect, useRef, useState } from 'preact/hooks'

import { familyError, uploadFamily } from '../../state/api/family-photos'
import { currentSessionGeneration } from '../../state/sessionBoundary'
import { FamilyIcon } from './Icon'

type Entry = {
  id: number
  file: File
  preview?: string
  caption: string
  status: 'waiting' | 'uploading' | 'done' | 'failed'
  progress: number
  error: string
}
type UploadProps = {
  maxBytes: number
  onUploaded: () => void
  onBusyChange: (busy: boolean) => void
  onDone: () => void
}
export function FamilyUpload({ maxBytes, onUploaded, onBusyChange, onDone }: UploadProps) {
  const input = useRef<HTMLInputElement>(null)
  const mounted = useRef(true)
  const previews = useRef(new Set<string>())
  const sequence = useRef(0)
  const running = useRef(false)
  const [entries, setEntries] = useState<Entry[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    mounted.current = true
    const urls = previews.current
    return () => {
      mounted.current = false
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }
  }, [])
  const patch = (id: number, update: Partial<Entry>) =>
    setEntries((previous) => previous.map((entry) => (entry.id === id ? { ...entry, ...update } : entry)))
  const add = (files: File[]) => {
    if (running.current) return
    const remaining = Math.max(0, 100 - entries.length)
    setNotice(
      files.length > remaining ? 'Add up to 100 files at a time. The rest can go in your next batch.' : '',
    )
    setEntries((previous) => [
      ...previous,
      ...files.slice(0, remaining).map((file) => {
        const preview = /image\/(jpeg|png|webp|avif)/.test(file.type) ? URL.createObjectURL(file) : undefined
        if (preview) previews.current.add(preview)
        return {
          id: ++sequence.current,
          file,
          preview,
          caption: '',
          status: 'waiting' as const,
          progress: 0,
          error: '',
        }
      }),
    ])
  }
  const remove = (entry: Entry) => {
    if (entry.preview) {
      URL.revokeObjectURL(entry.preview)
      previews.current.delete(entry.preview)
    }
    setEntries((previous) => previous.filter((row) => row.id !== entry.id))
  }
  const upload = async () => {
    if (running.current) return
    const generation = currentSessionGeneration()
    const active = () => mounted.current && generation === currentSessionGeneration()
    running.current = true
    setBusy(true)
    onBusyChange(true)
    let changed = false
    try {
      for (const entry of entries.filter((row) => row.status !== 'done')) {
        // Each request reads the current bearer; never continue a queue under another account.
        if (!active()) break
        if (entry.file.size > maxBytes) {
          patch(entry.id, {
            status: 'failed',
            error: `Larger than the ${Math.floor(maxBytes / 1024 ** 2)} MB limit.`,
          })
          continue
        }
        patch(entry.id, { status: 'uploading', progress: 0, error: '' })
        try {
          await uploadFamily(entry.file, entry.caption, (progress) => {
            if (active()) patch(entry.id, { progress })
          })
          if (!active()) break
          patch(entry.id, { status: 'done', progress: 100 })
          changed = true
        } catch (error) {
          if (active()) patch(entry.id, { status: 'failed', error: familyError(error) })
        }
      }
    } finally {
      running.current = false
      if (active()) {
        setBusy(false)
        onBusyChange(false)
        if (changed) onUploaded()
      }
    }
  }
  const pending = entries.filter((entry) => entry.status !== 'done').length
  return (
    <div
      class="family-upload"
      id="upload"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        add(Array.from(e.dataTransfer?.files ?? []))
      }}
    >
      <button class="family-dropzone" disabled={busy} onClick={() => input.current?.click()}>
        <FamilyIcon name="add" />
        <strong>Choose photos &amp; videos</strong>
        <span>or drop them here · up to {Math.floor(maxBytes / 1024 ** 2)} MB each</span>
      </button>
      <input
        class="family-file-input"
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,video/mp4,video/quicktime,.heic,.heif,.mov"
        disabled={busy}
        aria-label="Choose photos and videos"
        onChange={(e) => {
          add(Array.from(e.currentTarget.files ?? []))
          e.currentTarget.value = ''
        }}
      />
      {notice && <p role="status">{notice}</p>}
      <div class="family-upload-list">
        {entries.map((entry) => (
          <UploadRow
            key={entry.id}
            entry={entry}
            busy={busy}
            onCaption={(caption) => patch(entry.id, { caption })}
            onRemove={() => remove(entry)}
          />
        ))}
      </div>
      {entries.length > 0 && (
        <div class="family-upload-footer">
          <span aria-live="polite">
            {entries.filter((entry) => entry.status === 'done').length} of {entries.length} added
          </span>
          {pending > 0 ? (
            <button class="family-button family-button-primary" disabled={busy} onClick={() => void upload()}>
              {busy ? 'Adding memories…' : `Add ${pending} ${pending === 1 ? 'memory' : 'memories'}`}
            </button>
          ) : (
            <button class="family-button family-button-primary" onClick={onDone}>
              Back to the album
            </button>
          )}
        </div>
      )}
    </div>
  )
}
function UploadRow({
  entry,
  busy,
  onCaption,
  onRemove,
}: {
  entry: Entry
  busy: boolean
  onCaption: (caption: string) => void
  onRemove: () => void
}) {
  return (
    <div class="family-upload-row">
      {entry.preview ? (
        <img src={entry.preview} alt="Selected file preview" />
      ) : (
        <span class="family-upload-thumbnail">
          <FamilyIcon name={entry.file.type.startsWith('video/') ? 'video' : 'photo'} />
        </span>
      )}
      <div>
        <span class="family-upload-filename">{entry.file.name}</span>
        <label class="family-sr-only" for={`family-caption-${entry.id}`}>
          Caption for {entry.file.name}
        </label>
        <input
          id={`family-caption-${entry.id}`}
          placeholder="A few words about this moment…"
          maxLength={2000}
          value={entry.caption}
          disabled={busy || entry.status === 'done'}
          onInput={(e) => onCaption(e.currentTarget.value)}
        />
        <span class="family-upload-status" aria-live="polite">
          {entry.status === 'done' ? 'Added · preparing its preview' : entry.error}
        </span>
        {entry.status === 'uploading' && (
          <progress max={100} value={entry.progress} aria-label={`Uploading ${entry.file.name}`} />
        )}
      </div>
      <button
        class="family-icon-button"
        aria-label={`Remove ${entry.file.name}`}
        disabled={busy}
        onClick={onRemove}
      >
        <FamilyIcon name="close" />
      </button>
    </div>
  )
}

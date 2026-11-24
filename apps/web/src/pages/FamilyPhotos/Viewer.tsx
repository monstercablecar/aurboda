import type { FamilyAccess, FamilyItem, FamilyFolder } from '@aurboda/api-spec'

import { useEffect, useRef, useState } from 'preact/hooks'

import { isEmbedded } from '../../embed'
import {
  downloadFamilyOriginal,
  editFamily,
  familyError,
  familyMediaUrl,
  restoreFamily,
  retryFamily,
  trashFamily,
} from '../../state/api/family-photos'
import { FamilyIcon } from './Icon'
import { MemoryFolder } from './Organization'

export const familyDate = (item: FamilyItem) =>
  new Date(item.captured_at ?? item.created_at).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
export function FamilyViewer({
  items,
  selected,
  access,
  onSelect,
  onClose,
  onChanged,
  folders = [],
}: {
  items: FamilyItem[]
  folders?: FamilyFolder[]
  selected: string
  access: FamilyAccess
  onSelect: (id: string) => void
  onClose: () => void
  onChanged: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const index = items.findIndex((item) => item.id === selected)
  const item = items[index]
  const [details, setDetails] = useState(false)
  const [zoom, setZoom] = useState(false)
  const [playing, setPlaying] = useState(false)
  const touch = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal()
  }, [])
  useEffect(() => {
    setZoom(false)
  }, [selected])
  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => {
      const photos = items.filter((photo) => canZoom(photo))
      const next = photos[(photos.findIndex((photo) => photo.id === selected) + 1) % photos.length]
      if (next) onSelect(next.id)
    }, 6000)
    return () => clearInterval(timer)
  }, [playing, selected, items, onSelect])
  const move = (delta: number) => {
    setPlaying(false)
    const next = items[index + delta]
    if (next) onSelect(next.id)
  }
  useEffect(() => {
    if (!item) onClose()
  }, [item, onClose])
  if (!item) return null
  return (
    <dialog
      ref={dialog}
      class="family-lightbox"
      aria-label="Family photo viewer"
      onClose={onClose}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest('input,textarea,select,video')) return
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          move(1)
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          move(-1)
        }
      }}
    >
      <header class="family-lightbox-bar">
        <button class="family-icon-button" aria-label="Close viewer" onClick={() => dialog.current?.close()}>
          <FamilyIcon name="close" />
        </button>
        <span class="family-viewer-count">
          {index + 1} <span>of {items.length}</span>
        </span>
        <div class="family-lightbox-tools">
          {canZoom(item) && (
            <button
              class="family-icon-button"
              aria-label={zoom ? 'Zoom out' : 'Zoom in'}
              aria-pressed={zoom}
              onClick={() => {
                setZoom(!zoom)
                setPlaying(false)
              }}
            >
              <FamilyIcon name="zoom" />
            </button>
          )}
          {items.filter((photo) => canZoom(photo)).length > 1 && (
            <button
              class="family-icon-button"
              aria-label={playing ? 'Pause slideshow' : 'Play slideshow'}
              aria-pressed={playing}
              onClick={() => {
                setPlaying(!playing)
                setZoom(false)
                setDetails(false)
              }}
            >
              <FamilyIcon name={playing ? 'pause' : 'play'} />
            </button>
          )}
          {!isEmbedded() && isReady(item) && (
            <a
              class="family-icon-button"
              href={familyMediaUrl(item.id, 'download')}
              download
              aria-label="Download"
            >
              <FamilyIcon name="download" />
            </a>
          )}
          <button
            class="family-icon-button"
            aria-label="Photo details"
            aria-pressed={details}
            onClick={() => {
              setDetails(!details)
              setPlaying(false)
            }}
          >
            <FamilyIcon name="info" />
          </button>
        </div>
      </header>
      <div class={`family-viewer-body${details ? ' with-details' : ''}`}>
        <div class="family-viewer-stage">
          <button
            class="family-viewer-arrow family-viewer-prev"
            aria-label="Previous photo"
            disabled={index === 0}
            onClick={() => move(-1)}
          >
            <FamilyIcon name="left" />
          </button>
          <div
            class={`family-viewer-media${zoom ? ' is-zoomed' : ''}`}
            onTouchStart={(e) => {
              const p = e.touches[0]
              touch.current = p ? { x: p.clientX, y: p.clientY } : null
            }}
            onTouchEnd={(e) => {
              const end = e.changedTouches[0]
              const start = touch.current
              touch.current = null
              if (zoom || item.kind !== 'photo' || !start || !end) return
              const dx = end.clientX - start.x
              const dy = end.clientY - start.y
              if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1)
            }}
          >
            {isReady(item) ? (
              <ViewerMedia
                key={item.id}
                item={item}
                onZoom={() => {
                  setZoom(!zoom)
                  setPlaying(false)
                }}
              />
            ) : (
              <ViewerPending item={item} />
            )}
          </div>
          <button
            class="family-viewer-arrow family-viewer-next"
            aria-label="Next photo"
            disabled={index === items.length - 1}
            onClick={() => move(1)}
          >
            <FamilyIcon name="right" />
          </button>
        </div>
        {details && (
          <PhotoDetails key={item.id} item={item} access={access} folders={folders} onChanged={onChanged} />
        )}
      </div>
      <footer class="family-lightbox-footer">
        <p class="family-viewer-caption">{item.caption || familyDate(item)}</p>
        <div class="family-filmstrip" aria-label="Browse memories">
          {items.map((photo, i) => (
            <button
              key={photo.id}
              class={photo.id === selected ? 'is-current' : ''}
              aria-label={`Go to ${photo.kind} ${i + 1}`}
              aria-current={photo.id === selected ? 'true' : undefined}
              onClick={() => {
                onSelect(photo.id)
                setPlaying(false)
              }}
            >
              {isReady(photo) ? (
                <img loading="lazy" src={familyMediaUrl(photo.id, 'thumb')} alt="" />
              ) : (
                <FamilyIcon name={photo.kind} />
              )}
            </button>
          ))}
        </div>
      </footer>
    </dialog>
  )
}
function ViewerMedia({ item, onZoom }: { item: FamilyItem; onZoom: () => void }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <p role="alert">This memory could not load. Close the viewer and try again.</p>
  return item.kind === 'video' ? (
    <video
      controls
      playsInline
      preload="metadata"
      poster={familyMediaUrl(item.id, 'thumb')}
      src={familyMediaUrl(item.id, 'preview')}
      onError={() => setFailed(true)}
    />
  ) : (
    <img
      src={familyMediaUrl(item.id, 'preview')}
      alt={item.caption || 'Family photo'}
      onDblClick={onZoom}
      onError={() => setFailed(true)}
    />
  )
}
function PhotoDetails({
  folders,
  item,
  access,
  onChanged,
}: {
  item: FamilyItem
  folders: FamilyFolder[]
  access: FamilyAccess
  onChanged: () => void
}) {
  const [caption, setCaption] = useState(item.caption)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const act = async (operation: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await operation()
      onChanged()
    } catch (e) {
      setError(familyError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <aside class="family-photo-details">
      <p class="family-eyebrow">About this memory</p>
      <h2>{familyDate(item)}</h2>
      {item.is_owner && <p class="family-note">You added this memory.</p>}
      {access.is_admin ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void act(() => editFamily(item.id, { caption }))
          }}
        >
          <label>
            Caption
            <textarea
              value={caption}
              maxLength={2000}
              onInput={(e) => setCaption(e.currentTarget.value)}
              placeholder="A few words to remember it by…"
            />
          </label>
          <button class="family-button" disabled={busy || caption === item.caption}>
            Save caption
          </button>
        </form>
      ) : (
        item.caption && <p>{item.caption}</p>
      )}
      <AdminMemoryFolder item={item} access={access} folders={folders} onChanged={onChanged} />
      <dl>
        <div>
          <dt>{item.captured_at ? 'Taken' : 'Added'}</dt>
          <dd>{familyDate(item)}</dd>
        </div>
        <div>
          <dt>File</dt>
          <dd>{item.original_filename}</dd>
        </div>
      </dl>
      {error && <p role="alert">{error}</p>}
      {!isEmbedded() && (access.is_admin || access.originals_enabled) && (
        <button
          class="family-button family-button-quiet"
          disabled={busy}
          onClick={() => void act(() => downloadFamilyOriginal(item.id, item.original_filename))}
        >
          Download original
        </button>
      )}
      {isEmbedded() && <p class="family-note">Open Family Photos in your browser to download.</p>}
      <RemovalActions item={item} admin={access.is_admin} busy={busy} act={act} />
    </aside>
  )
}

const isReady = (item: FamilyItem) => item.status === 'ready' && !item.deleted_at
const canZoom = (item: FamilyItem) => item.kind === 'photo' && isReady(item)

function ViewerPending({ item }: { item: FamilyItem }) {
  return (
    <div class="family-viewer-pending">
      <FamilyIcon name="photo" />
      <p>
        {item.deleted_at
          ? 'This memory is in Recently removed.'
          : item.status === 'failed'
            ? 'The preview needs another try.'
            : 'Getting this memory ready…'}
      </p>
      <p>Your original is safely kept.</p>
    </div>
  )
}

function AdminMemoryFolder({
  item,
  access,
  folders,
  onChanged,
}: {
  item: FamilyItem
  access: FamilyAccess
  folders: FamilyFolder[]
  onChanged: () => void
}) {
  if (!access.is_admin || item.deleted_at) return null
  return (
    <MemoryFolder
      key={`${item.id}:${item.album_id}`}
      folders={folders}
      itemId={item.id}
      folderId={item.album_id}
      onChanged={onChanged}
    />
  )
}

function RemovalActions({
  item,
  admin,
  busy,
  act,
}: {
  item: FamilyItem
  admin: boolean
  busy: boolean
  act: (operation: () => Promise<unknown>) => Promise<void>
}) {
  if (!admin && !item.is_owner) return null
  return (
    <div class="family-details-actions">
      {admin && item.status === 'failed' && !item.deleted_at && (
        <button class="family-button" disabled={busy} onClick={() => void act(() => retryFamily(item.id))}>
          Retry preview
        </button>
      )}
      {item.deleted_at ? (
        admin && (
          <button
            class="family-button"
            disabled={busy}
            onClick={() => void act(() => restoreFamily(item.id))}
          >
            Restore memory
          </button>
        )
      ) : (
        <button
          class="family-button family-button-danger"
          disabled={busy}
          onClick={() => void act(() => trashFamily(item.id))}
        >
          Move to trash
        </button>
      )}
      <p class="family-note">
        {admin
          ? 'Memories in trash can be restored for 30 days.'
          : 'An administrator can restore removed memories for 30 days.'}
      </p>
    </div>
  )
}

import type { FamilyAccess, FamilyItem } from '@aurboda/api-spec'

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'

import { isEmbedded } from '../../embed'
import {
  downloadFamilyOriginal,
  editFamily,
  familyError,
  familyMediaUrl,
  fetchFamily,
  refreshFamilySession,
  restoreFamily,
  retryFamily,
  trashFamily,
  useFamilyAccess,
} from '../../state/api/family-photos'
import { FamilyUpload } from './Upload'
import '../../components/ImageViewer.css'
import './style.css'

export function FamilyPhotos() {
  const { data: access, isLoading } = useFamilyAccess()
  if (isLoading) return <p>Loading Family Photos…</p>
  if (!access?.allowed) {
    return (
      <div class="family-page">
        <h1>Family Photos</h1>
        <p>This private channel is available to authorized family members.</p>
      </div>
    )
  }
  return <AuthorizedFamilyPhotos access={access} />
}
function AuthorizedFamilyPhotos({ access }: { access: FamilyAccess }) {
  const embedded = isEmbedded()
  const [view, setView] = useState<'gallery' | 'feed'>('gallery')
  const [kind, setKind] = useState<'' | 'photo' | 'video'>('')
  const [trash, setTrash] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [session, setSession] = useState(false)
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const touch = useRef<number | null>(null)
  const queryClient = useQueryClient()
  const query = useInfiniteQuery({
    queryKey: ['familyMedia', kind, trash],
    enabled: access.allowed === true,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetchFamily({ cursor: pageParam, kind: kind || undefined, trash: trash ? 'true' : 'false' }),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchInterval: 10_000,
  })
  const items = query.data?.pages.flatMap((page) => page.items) ?? []
  const viewable = items.filter((item) => item.status === 'ready')
  const index = viewable.findIndex((item) => item.id === selected)
  const active = viewable[index]
  const reload = () => void queryClient.invalidateQueries({ queryKey: ['familyMedia'] })
  useEffect(() => {
    if (!access.allowed) {
      setSession(false)
      setSelected(null)
      return
    }
    let current = true
    const refresh = () =>
      void refreshFamilySession().then(
        () => {
          if (current) setSession(true)
        },
        () => {
          if (current) {
            setSession(false)
            setError('Your media session expired. Refresh this page to continue.')
          }
        },
      )
    refresh()
    const timer = setInterval(refresh, 180_000)
    return () => {
      current = false
      clearInterval(timer)
    }
  }, [access.allowed])
  useEffect(() => {
    if (selected && dialog.current && !dialog.current.open) dialog.current.showModal()
  }, [selected])
  const move = (delta: number) => {
    const item = viewable[index + delta]
    if (item) setSelected(item.id)
  }
  const act = async (operation: () => Promise<unknown>) => {
    try {
      await operation()
      setError('')
      reload()
    } catch (e) {
      setError(familyError(e))
    }
  }
  const tools = (item: FamilyItem) => (
    <div class="family-item-tools">
      {item.status === 'ready' && !embedded && (
        <a class="btn-secondary" href={familyMediaUrl(item.id, 'download')} download>
          Download
        </a>
      )}
      {!embedded && (access.is_admin || access.originals_enabled) && (
        <button
          class="btn-secondary"
          onClick={() => void act(() => downloadFamilyOriginal(item.id, item.original_filename))}
        >
          Download original
        </button>
      )}
      {access.is_admin && (
        <>
          <button
            onClick={() => {
              const caption = prompt('Caption', item.caption)
              if (caption !== null) void act(() => editFamily(item.id, { caption }))
            }}
          >
            Edit caption
          </button>
          {item.deleted_at ? (
            <button class="btn-secondary" onClick={() => void act(() => restoreFamily(item.id))}>
              Restore
            </button>
          ) : (
            <button class="btn-secondary" onClick={() => void act(() => trashFamily(item.id))}>
              Move to trash
            </button>
          )}
          {item.status === 'failed' && !item.deleted_at && (
            <button class="btn-secondary" onClick={() => void act(() => retryFamily(item.id))}>
              Retry preview
            </button>
          )}
        </>
      )}
    </div>
  )
  let previousDate = ''
  return (
    <main class="family-page">
      <header>
        <p class="family-eyebrow">Private family channel</p>
        <h1>Family Photos</h1>
        <h2>Marcroft Family</h2>
      </header>
      {embedded && <BrowserDownloads />}
      {access.is_admin && <FamilyUpload maxBytes={access.max_upload_bytes} onUploaded={reload} />}
      <nav class="family-filters" aria-label="Gallery options">
        <button class="btn-secondary" aria-pressed={view === 'gallery'} onClick={() => setView('gallery')}>
          Gallery
        </button>
        <button class="btn-secondary" aria-pressed={view === 'feed'} onClick={() => setView('feed')}>
          Feed
        </button>
        <label>
          Show{' '}
          <select value={kind} onChange={(e) => setKind(e.currentTarget.value as typeof kind)}>
            <option value="">Photos &amp; videos</option>
            <option value="photo">Photos</option>
            <option value="video">Videos</option>
          </select>
        </label>
        {access.is_admin && (
          <label>
            <input type="checkbox" checked={trash} onChange={(e) => setTrash(e.currentTarget.checked)} />{' '}
            Trash (30 days)
          </label>
        )}
      </nav>
      <GalleryStatus
        error={error}
        queryError={query.error}
        loading={query.isLoading}
        empty={!items.length}
        trash={trash}
      />
      <div class={`family-items family-${view}`}>
        {items.map((item) => {
          const date = new Date(item.created_at).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
          const group = previousDate !== date
          previousDate = date
          return (
            <Fragment key={item.id}>
              {group && <h3 class="family-date">{date}</h3>}
              <article class="family-entry">
                {item.status === 'ready' && session ? (
                  <button
                    class="family-open"
                    aria-label={item.caption || `Open ${item.kind}`}
                    onClick={() => setSelected(item.id)}
                  >
                    <img
                      loading="lazy"
                      decoding="async"
                      src={familyMediaUrl(
                        item.id,
                        view === 'feed' && item.kind === 'photo' ? 'preview' : 'thumb',
                      )}
                      alt={item.caption || 'Family memory'}
                    />
                    {item.kind === 'video' && <span class="family-video">▶ Video</span>}
                  </button>
                ) : (
                  <p>
                    {item.status === 'failed'
                      ? 'Preview failed. The original is safely retained.'
                      : 'Preparing preview…'}
                  </p>
                )}
                {item.caption && <p>{item.caption}</p>}
                {item.captured_at && (
                  <p class="family-capture">Captured {new Date(item.captured_at).toLocaleDateString()}</p>
                )}
                {tools(item)}
              </article>
            </Fragment>
          )
        })}
      </div>
      {query.hasNextPage && (
        <button
          class="btn-secondary"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
      {active && session && (
        <dialog
          ref={dialog}
          class="image-viewer family-viewer"
          aria-label="Family photo viewer"
          onClose={() => setSelected(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') move(1)
            if (e.key === 'ArrowLeft') move(-1)
          }}
          onTouchStart={(e) => {
            touch.current = e.touches[0]?.clientX ?? null
          }}
          onTouchEnd={(e) => {
            if (touch.current !== null) {
              const delta = (e.changedTouches[0]?.clientX ?? touch.current) - touch.current
              if (Math.abs(delta) > 60) move(delta < 0 ? 1 : -1)
            }
            touch.current = null
          }}
        >
          <button
            class="image-viewer-close"
            aria-label="Close viewer"
            onClick={() => dialog.current?.close()}
          >
            ✕
          </button>
          {active.kind === 'video' ? (
            <video
              key={active.id}
              controls
              playsInline
              preload="metadata"
              poster={familyMediaUrl(active.id, 'thumb')}
              src={familyMediaUrl(active.id, 'preview')}
            />
          ) : (
            <img
              key={active.id}
              src={familyMediaUrl(active.id, 'preview')}
              alt={active.caption || 'Family photo'}
            />
          )}
          <p>{active.caption}</p>
          <div class="family-viewer-actions">
            <button class="btn-secondary" disabled={index <= 0} onClick={() => move(-1)}>
              Previous
            </button>
            {tools(active)}
            <button class="btn-secondary" disabled={index >= viewable.length - 1} onClick={() => move(1)}>
              Next
            </button>
          </div>
        </dialog>
      )}
    </main>
  )
}

function GalleryStatus({
  error,
  queryError,
  loading,
  empty,
  trash,
}: {
  error: string
  queryError: unknown
  loading: boolean
  empty: boolean
  trash: boolean
}) {
  if (error || queryError) return <p role="alert">{error || familyError(queryError)}</p>
  if (loading) return <p>Loading photos…</p>
  if (empty) return <p>{trash ? 'Trash is empty.' : 'Your family memories will appear here.'}</p>
  return null
}

function BrowserDownloads() {
  return (
    <aside class="family-upload" aria-label="Download in browser">
      <h2>Save photos and videos</h2>
      <p>
        Downloads are available in your browser. Open this link in your browser and sign in to save files.
      </p>
      <label>
        Browser link
        <input
          readOnly
          value={`${window.location.origin}/family-photos`}
          onFocus={(e) => e.currentTarget.select()}
        />
      </label>
    </aside>
  )
}

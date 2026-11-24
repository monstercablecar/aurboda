import type { FamilyAccess, FamilyItem, FamilyFolder } from '@aurboda/api-spec'

import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'

import { isEmbedded } from '../../embed'
import {
  familyError,
  familyMediaUrl,
  fetchFamily,
  fetchFamilyFolders,
  refreshFamilySession,
  useFamilyAccess,
} from '../../state/api/family-photos'
import { FamilyIcon } from './Icon'
import { AlbumOrganization, SelectionTools, familyDateQuery, type AlbumFilters } from './Organization'
import { FamilyUpload } from './Upload'
import { FamilyViewer, familyDate } from './Viewer'
import './style.css'

export function FamilyPhotos() {
  const { data: access, isLoading } = useFamilyAccess()
  if (isLoading) {
    return (
      <div class="family-page">
        <p class="family-note">Opening the family album…</p>
      </div>
    )
  }
  if (!access?.allowed) {
    return (
      <div class="family-page">
        <h1>Family Photos</h1>
        <p>This private channel is available to authorized family members.</p>
      </div>
    )
  }
  return <FamilyAlbum access={access} />
}
function FamilyAlbum({ access }: { access: FamilyAccess }) {
  const [filters, setFilters] = useState<AlbumFilters>({ folder: '', from: '', to: '' })
  const [selection, setSelection] = useState<string[] | null>(null)
  const folderQuery = useQuery({
    queryKey: ['familyFolders'],
    queryFn: fetchFamilyFolders,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchInterval: 15_000,
  })
  const folders = folderQuery.data ?? []
  const [view, setView] = useState<'gallery' | 'feed'>('gallery')
  const [kind, setKind] = useState<'' | 'photo' | 'video'>('')
  const [trash, setTrash] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(window.location.hash === '#upload')
  const [session, setSession] = useState(false)
  const [error, setError] = useState('')
  const queryClient = useQueryClient()
  const query = useInfiniteQuery({
    queryKey: ['familyMedia', kind, trash, filters],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetchFamily({
        cursor: pageParam,
        kind: kind || undefined,
        trash: trash ? 'true' : 'false',
        album_id: filters.folder || undefined,
        ...familyDateQuery(filters),
      }),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchInterval: 10_000,
  })
  const items = query.data?.pages.flatMap((page) => page.items) ?? []
  const reload = () => {
    void queryClient.invalidateQueries({ queryKey: ['familyMedia'] })
    void queryClient.invalidateQueries({ queryKey: ['familyFolders'] })
  }
  useEffect(() => {
    setSelection(null)
  }, [kind, trash, filters])
  useEffect(() => {
    let current = true
    const refresh = () =>
      void refreshFamilySession().then(
        () => {
          if (current) setSession(true)
        },
        () => {
          if (current) {
            setSession(false)
            setError('Please refresh the album to reconnect.')
          }
        },
      )
    refresh()
    const timer = setInterval(refresh, 180_000)
    return () => {
      current = false
      clearInterval(timer)
    }
  }, [])
  useEffect(() => {
    const open = () => {
      if (window.location.hash === '#upload') setUploadOpen(true)
    }
    window.addEventListener('hashchange', open)
    return () => window.removeEventListener('hashchange', open)
  }, [])
  return (
    <main class="family-page">
      <AlbumHeader onUpload={() => setUploadOpen(true)} />
      {uploadOpen && (
        <UploadPanel
          folders={folders}
          folderId={filters.folder}
          maxBytes={access.max_upload_bytes}
          onUploaded={reload}
          onClose={() => setUploadOpen(false)}
        />
      )}
      <AlbumToolbar
        view={view}
        onView={setView}
        kind={kind}
        onKind={setKind}
        trash={trash}
        onTrash={setTrash}
        admin={access.is_admin}
        onSelectMemories={() => setSelection([])}
      />
      <AlbumOrganization
        folders={folders}
        filters={filters}
        onFilters={setFilters}
        admin={access.is_admin}
        onChanged={reload}
      />
      <OrganizeSelection
        admin={access.is_admin}
        trash={trash}
        folders={folders}
        selection={selection}
        items={items}
        onSelection={setSelection}
        onChanged={reload}
      />
      <AlbumMessage error="" queryError={folderQuery.error} />
      {isEmbedded() && (
        <details class="family-browser-note">
          <summary>Saving photos to your device</summary>
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
        </details>
      )}
      <AlbumMessage error={error} queryError={query.error} />
      {trash && (
        <div class="family-trash-note">
          <span>Recently removed · kept for 30 days</span>
          <button class="family-text-button" onClick={() => setTrash(false)}>
            Back to our memories
          </button>
        </div>
      )}
      {query.isLoading ? (
        <div class="family-grid family-skeleton" aria-label="Loading memories">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} />
          ))}
        </div>
      ) : (
        <MemoryCollection
          items={items}
          view={view}
          session={session}
          onSelect={setSelected}
          selection={selection}
          onSelection={setSelection}
        />
      )}
      {!query.isLoading && !query.error && items.length === 0 && (
        <EmptyAlbum trash={trash} filtered={hasFilters(filters, kind)} onUpload={() => setUploadOpen(true)} />
      )}
      {query.hasNextPage && (
        <LoadMore busy={query.isFetchingNextPage} onMore={() => void query.fetchNextPage()} />
      )}
      {selected && session && (
        <FamilyViewer
          items={items}
          folders={folders}
          selected={selected}
          access={access}
          onSelect={setSelected}
          onClose={() => setSelected(null)}
          onChanged={reload}
        />
      )}
      <p class="family-album-end">Made of moments. Shared with family.</p>
    </main>
  )
}
function AlbumToolbar({
  view,
  onView,
  kind,
  onKind,
  trash,
  onTrash,
  admin,
  onSelectMemories,
}: {
  onSelectMemories: () => void
  view: 'gallery' | 'feed'
  onView: (v: 'gallery' | 'feed') => void
  kind: '' | 'photo' | 'video'
  onKind: (v: '' | 'photo' | 'video') => void
  trash: boolean
  onTrash: (v: boolean) => void
  admin: boolean
}) {
  return (
    <nav class="family-toolbar" aria-label="Gallery options">
      <div class="family-segments" aria-label="Media filter">
        {(
          [
            { value: '', label: 'All memories' },
            { value: 'photo', label: 'Photos' },
            { value: 'video', label: 'Videos' },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            aria-pressed={kind === option.value}
            onClick={() => onKind(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div class="family-view-options">
        <button
          class="family-text-button"
          aria-pressed={view === 'gallery'}
          onClick={() => onView('gallery')}
        >
          Gallery
        </button>
        <button class="family-text-button" aria-pressed={view === 'feed'} onClick={() => onView('feed')}>
          Timeline
        </button>
        {admin && !trash && (
          <button class="family-text-button" aria-label="Select memories" onClick={onSelectMemories}>
            Select
          </button>
        )}
        {admin && (
          <details class="family-album-options">
            <summary aria-label="Album options">
              <FamilyIcon name="more" />
            </summary>
            <div>
              <button onClick={() => onTrash(!trash)}>
                {trash ? 'View family album' : 'Recently removed'}
              </button>
              <a href="/admin/users">Manage family access</a>
            </div>
          </details>
        )}
      </div>
    </nav>
  )
}
function MemoryCollection({
  selection,
  onSelection,
  items,
  view,
  session,
  onSelect,
}: {
  items: FamilyItem[]
  selection: string[] | null
  onSelection: (selection: string[]) => void
  view: 'gallery' | 'feed'
  session: boolean
  onSelect: (id: string) => void
}) {
  let previousDay = ''
  return (
    <div class={view === 'gallery' ? 'family-grid' : 'family-timeline'}>
      {items.map((item) => {
        const day = familyDate(item)
        const heading = day !== previousDay
        previousDay = day
        return (
          <Fragment key={item.id}>
            {heading && (
              <h2 class="family-date">
                {day}
                <span aria-hidden="true" />
              </h2>
            )}
            <MemoryTile
              item={item}
              session={session}
              onOpen={() => onSelect(item.id)}
              timeline={view === 'feed'}
              selection={selection}
              onToggle={() => {
                if (!selection) return
                onSelection(
                  selection.includes(item.id)
                    ? selection.filter((id) => id !== item.id)
                    : [...selection, item.id].slice(0, 200),
                )
              }}
            />
          </Fragment>
        )
      })}
    </div>
  )
}
function MemoryTile({
  selection,
  onToggle,
  item,
  session,
  onOpen,
  timeline,
}: {
  item: FamilyItem
  session: boolean
  onOpen: () => void
  selection: string[] | null
  onToggle: () => void
  timeline: boolean
}) {
  const [failed, setFailed] = useState(false)
  const ready = item.status === 'ready' && !item.deleted_at && session
  return (
    <article class={`family-memory${timeline ? ' family-memory-story' : ''}`}>
      <MemorySelection selection={selection} id={item.id} caption={item.caption} onToggle={onToggle} />
      <button
        class="family-open"
        aria-label={item.caption || `Open ${item.kind}`}
        onClick={() => {
          if (selection) onToggle()
          else onOpen()
        }}
        disabled={!session}
      >
        {ready && !failed ? (
          <img
            loading="lazy"
            decoding="async"
            src={familyMediaUrl(item.id, timeline && item.kind === 'photo' ? 'preview' : 'thumb')}
            alt={item.caption || 'Family memory'}
            onError={() => setFailed(true)}
          />
        ) : (
          <PendingMemory item={item} failed={failed} />
        )}
        <span class="family-memory-overlay">
          {item.kind === 'video' && (
            <span class="family-video-label">
              <FamilyIcon name="play" />
              Video
            </span>
          )}
          {item.caption && !timeline && <span class="family-tile-caption">{item.caption}</span>}
          <span class="family-open-hint">
            <FamilyIcon name="zoom" />
          </span>
        </span>
      </button>
      {timeline && item.caption && <p class="family-story-caption">{item.caption}</p>}
    </article>
  )
}
function LoadMore({ busy, onMore }: { busy: boolean; onMore: () => void }) {
  const marker = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!marker.current || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !busy) onMore()
      },
      { rootMargin: '300px' },
    )
    observer.observe(marker.current)
    return () => observer.disconnect()
  }, [busy, onMore])
  return (
    <div ref={marker} class="family-load-more">
      <button class="family-button family-button-quiet" disabled={busy} onClick={onMore}>
        {busy ? 'Opening more memories…' : 'More memories'}
      </button>
    </div>
  )
}

function AlbumHeader({ onUpload }: { onUpload: () => void }) {
  return (
    <header class="family-album-header">
      <div class="family-album-title">
        <p class="family-eyebrow">Family Photos</p>
        <h1>Marcroft Family</h1>
        <p class="family-album-subtitle">Our shared memories, all together.</p>
      </div>
      <div class="family-header-actions">
        <span class="family-private">
          <FamilyIcon name="lock" /> A private family album
        </span>
        <button class="family-button family-button-primary" onClick={onUpload}>
          <FamilyIcon name="add" />
          Add photos &amp; videos
        </button>
      </div>
    </header>
  )
}
function UploadPanel({
  folders,
  folderId,
  maxBytes,
  onUploaded,
  onClose,
}: {
  maxBytes: number
  folders: FamilyFolder[]
  folderId: string
  onUploaded: () => void
  onClose: () => void
}) {
  const [uploadBusy, setUploadBusy] = useState(false)
  return (
    <section class="family-upload-panel" aria-label="Upload Photo / Video">
      <div class="family-panel-heading">
        <div>
          <p class="family-eyebrow">A new memory</p>
          <h2>Add to the family album</h2>
        </div>
        <button class="family-icon-button" aria-label="Close upload" disabled={uploadBusy} onClick={onClose}>
          <FamilyIcon name="close" />
        </button>
      </div>
      <FamilyUpload
        maxBytes={maxBytes}
        folders={folders}
        folderId={folderId === 'unfiled' ? '' : folderId}
        onUploaded={onUploaded}
        onBusyChange={setUploadBusy}
        onDone={onClose}
      />
    </section>
  )
}
function EmptyAlbum({
  trash,
  filtered,
  onUpload,
}: {
  trash: boolean
  filtered: boolean
  onUpload: () => void
}) {
  return (
    <div class="family-empty">
      <FamilyIcon name="photo" />
      <h2>{trash ? 'Nothing in trash' : filtered ? 'No memories here yet' : 'The beginning of our album'}</h2>
      <p>
        {trash
          ? 'All our memories are right where they belong.'
          : filtered
            ? 'Try another folder or date range, or add a new memory.'
            : 'A place for the big days and the little moments in between.'}
      </p>
      {!trash && (
        <button class="family-button family-button-primary" onClick={onUpload}>
          Add photos
        </button>
      )}
    </div>
  )
}

function PendingMemory({ item, failed }: { item: FamilyItem; failed: boolean }) {
  return (
    <span class="family-memory-pending">
      <FamilyIcon name={item.kind} />
      <span>
        {item.deleted_at
          ? 'Removed memory · open to restore'
          : item.status === 'failed'
            ? 'Preview needs a retry'
            : failed
              ? 'Tap to try opening this memory'
              : 'Getting this memory ready…'}
      </span>
    </span>
  )
}

function AlbumMessage({ error, queryError }: { error: string; queryError: unknown }) {
  if (!error && !queryError) return null
  return (
    <p class="family-message" role="alert">
      {error || familyError(queryError)}
    </p>
  )
}

function MemorySelection({
  selection,
  id,
  caption,
  onToggle,
}: {
  selection: string[] | null
  id: string
  caption: string
  onToggle: () => void
}) {
  if (!selection) return null
  return (
    <label class="family-memory-select">
      <input
        type="checkbox"
        checked={selection.includes(id)}
        disabled={!selection.includes(id) && selection.length >= 200}
        aria-label={`Select ${caption || 'memory'}`}
        onChange={onToggle}
      />
    </label>
  )
}
function OrganizeSelection({
  admin,
  trash,
  folders,
  selection,
  items,
  onSelection,
  onChanged,
}: {
  admin: boolean
  trash: boolean
  folders: FamilyFolder[]
  selection: string[] | null
  items: FamilyItem[]
  onSelection: (ids: string[] | null) => void
  onChanged: () => void
}) {
  if (!admin || trash || !selection) return null
  return (
    <SelectionTools
      folders={folders}
      ids={selection}
      shown={items.map((item) => item.id)}
      onSelection={onSelection}
      onChanged={onChanged}
    />
  )
}

const hasFilters = (filters: AlbumFilters, kind: string) =>
  !!(filters.folder || filters.from || filters.to || kind)

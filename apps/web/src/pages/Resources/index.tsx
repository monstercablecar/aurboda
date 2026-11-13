import type { ResourceFolder, ResourceItem } from '@aurboda/api-spec'
import type { ComponentChildren } from 'preact'

import { useEffect, useRef, useState } from 'preact/hooks'

import * as api from '../../state/api/resources'
import './style.css'

const icons: Record<string, string> = { pdf: '▤', image: '▧', video: '▷', document: '▱', link: '↗' }
export const safeResourceLink = (value: string | null) => {
  try {
    const url = new URL(value ?? '')
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined
  } catch {
    return undefined
  }
}
export const folderTrail = (folders: ResourceFolder[], id: string | null): ResourceFolder[] => {
  const trail: ResourceFolder[] = []
  const seen = new Set<string>()
  while (id && !seen.has(id)) {
    seen.add(id)
    const folder = folders.find((f) => f.id === id)
    if (!folder) break
    trail.unshift(folder)
    id = folder.parent_id
  }
  return trail
}
const sizeLabel = (size: number | null) =>
  size === null
    ? ''
    : size < 1024 * 1024
      ? `${Math.max(1, Math.round(size / 1024))} KB`
      : `${(size / 1024 / 1024).toFixed(1)} MB`
function Dialog({
  title,
  close,
  children,
}: {
  title: string
  close: () => void
  children: ComponentChildren
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement
    ref.current?.showModal()
    return () => previous?.focus()
  }, [])
  return (
    <dialog
      ref={ref}
      class="resource-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
    >
      <header>
        <h2>{title}</h2>
        <button type="button" aria-label="Close dialog" onClick={close}>
          ×
        </button>
      </header>
      {children}
    </dialog>
  )
}
type Editor = { kind: 'folder' | 'link' | 'item'; record?: ResourceFolder | ResourceItem }
// eslint-disable-next-line complexity -- Folder, file, and link forms share labeled controls with optional metadata.
function ResourceEditor({
  editor,
  folders,
  parent,
  close,
  saved,
}: {
  editor: Editor
  folders: ResourceFolder[]
  parent: string | null
  close: () => void
  saved: () => Promise<void>
}) {
  const record = editor.record
  const [title, setTitle] = useState(record?.title ?? '')
  const [description, setDescription] = useState(
    record && 'description' in record ? (record.description ?? '') : '',
  )
  const [url, setUrl] = useState(record && 'external_url' in record ? (record.external_url ?? '') : '')
  const [folder, setFolder] = useState((record ? record.parent_id : parent) ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isFolder = editor.kind === 'folder'
  const isLink = editor.kind === 'link'
  const choices = folders.filter(
    (f) => !isFolder || !record || !folderTrail(folders, f.id).some((ancestor) => ancestor.id === record.id),
  )
  return (
    <Dialog
      title={`${record ? 'Edit' : 'New'} ${isFolder ? 'folder' : isLink ? 'link' : 'resource'}`}
      close={() => !busy && close()}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          setError('')
          setBusy(true)
          try {
            if (isLink && !safeResourceLink(url)) {
              throw new Error('Enter a complete http:// or https:// link.')
            }
            const body = { title: title.trim(), parent_id: folder || null }
            if (isFolder) {
              if (record) {
                await api.updateResourceFolder(record.id, { ...body, expected_updated_at: record.updated_at })
              } else await api.createResourceFolder(body)
            } else if (record) {
              await api.updateResource(record.id, {
                ...body,
                description: description.trim() || null,
                ...(isLink ? { external_url: url } : {}),
                expected_updated_at: record.updated_at,
              })
            } else {
              await api.createResourceLink({
                ...body,
                description: description.trim() || null,
                external_url: url,
              })
            }
            await saved()
            close()
          } catch (e) {
            setError(api.resourceError(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        <label>
          Title
          <input required maxLength={255} value={title} onInput={(e) => setTitle(e.currentTarget.value)} />
        </label>
        {isLink && (
          <label>
            Website URL
            <input
              required
              type="url"
              placeholder="https://example.com"
              value={url}
              onInput={(e) => setUrl(e.currentTarget.value)}
            />
          </label>
        )}
        {!isFolder && (
          <label>
            Description
            <textarea
              maxLength={10000}
              rows={3}
              value={description}
              onInput={(e) => setDescription(e.currentTarget.value)}
            />
          </label>
        )}
        <label>
          Folder
          <select value={folder} onChange={(e) => setFolder(e.currentTarget.value)}>
            <option value="">Library root</option>
            {choices.map((f) => (
              <option key={f.id} value={f.id}>
                {folderTrail(folders, f.id)
                  .map((p) => p.title)
                  .join(' / ')}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p role="alert" class="resource-error">
            {error}
          </p>
        )}
        <footer>
          <button type="button" disabled={busy} onClick={close}>
            Cancel
          </button>
          <button class="resource-primary" disabled={busy || !title.trim()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </form>
    </Dialog>
  )
}
function Preview({ item, close }: { item: ResourceItem; close: () => void }) {
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const prepare = async () => {
    setState('loading')
    try {
      await api.prepareResourceMedia(item.id)
      setState('ready')
    } catch (e) {
      setError(api.resourceError(e))
      setState('error')
    }
  }
  useEffect(() => {
    void prepare()
    const timer = setInterval(
      () => {
        void api.refreshResourceSession().catch((e) => {
          setError(api.resourceError(e))
          setState('error')
        })
      },
      10 * 60 * 1000,
    )
    return () => clearInterval(timer)
  }, [item.id])
  const failed = () => {
    setError('This file could not be previewed. Try downloading it to open on your device.')
    setState('error')
  }
  const src = api.resourceContentUrl(item.id)
  return (
    <Dialog title={item.title} close={close}>
      <p class="resource-muted">
        {item.original_filename} · {sizeLabel(item.file_size)}
      </p>
      {item.description && <p>{item.description}</p>}
      {state === 'loading' && <p role="status">Preparing secure preview…</p>}
      {state === 'error' && (
        <div role="alert">
          <p class="resource-error">{error}</p>
          <button onClick={prepare}>Retry</button>
        </div>
      )}
      {state === 'ready' && (
        <div class="resource-preview">
          {item.kind === 'image' ? (
            <img src={src} alt={item.title} onError={failed} />
          ) : item.kind === 'video' ? (
            <video src={src} controls preload="metadata" onError={failed} />
          ) : item.kind === 'pdf' ? (
            <iframe src={src} title={`Preview of ${item.title}`} onError={failed} />
          ) : (
            <div class="resource-empty">
              <span aria-hidden="true">▱</span>
              <p>No browser preview for this file type.</p>
              <p>Download it to open on your device.</p>
            </div>
          )}
        </div>
      )}
      {state !== 'loading' && (
        <footer>
          <a class="resource-download" href={api.resourceContentUrl(item.id, true)}>
            Download original
          </a>
        </footer>
      )}
    </Dialog>
  )
}
// eslint-disable-next-line complexity -- Page orchestration renders independent browsing, management, upload, and preview states.
export function Resources() {
  const [folders, setFolders] = useState<ResourceFolder[]>([])
  const [items, setItems] = useState<ResourceItem[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [parent, setParent] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState('all')
  const [sort, setSort] = useState('title')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [preview, setPreview] = useState<ResourceItem | null>(null)
  const [deleting, setDeleting] = useState<{ record: ResourceItem | ResourceFolder; folder: boolean } | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const refresh = async () => {
    const data = await api.fetchResources()
    if (!data.success) throw new Error('Could not load the library.')
    setFolders(data.folders)
    setItems(data.resources)
    setCanManage(data.can_manage)
    setParent((current) => (current && !data.folders.some((f) => f.id === current) ? null : current))
  }
  const load = async () => {
    setLoading(true)
    setError('')
    try {
      await refresh()
    } catch (e) {
      setError(api.resourceError(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
    const onFocus = () => {
      void refresh().catch((e) => setError(api.resourceError(e)))
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])
  const upload = async (files: File[]) => {
    if (!canManage || uploading || !files.length) return
    setUploading(true)
    setUploadErrors([])
    const failures: string[] = []
    for (const [index, file] of files.entries()) {
      const label = `${index + 1} of ${files.length}: ${file.name}`
      setUploadStatus(`${label} — uploading`)
      try {
        await api.uploadResource(file, parent, (percent) => setUploadStatus(`${label} — ${percent}%`))
      } catch (e) {
        failures.push(`${file.name}: ${api.resourceError(e)}`)
        setUploadErrors([...failures])
      }
    }
    setUploadStatus(`${files.length - failures.length} of ${files.length} files uploaded.`)
    setUploading(false)
    try {
      await refresh()
    } catch (e) {
      setError(api.resourceError(e))
    }
  }
  const query = search.trim().toLowerCase()
  const visibleFolders = folders
    .filter((f) => kind === 'all' && (query ? f.title.toLowerCase().includes(query) : f.parent_id === parent))
    .sort((a, b) => a.title.localeCompare(b.title))
  const visibleItems = items
    .filter(
      (item) =>
        (kind === 'all' || item.kind === kind) &&
        (query
          ? [item.title, item.description, ...folderTrail(folders, item.parent_id).map((f) => f.title)].some(
              (text) => text?.toLowerCase().includes(query),
            )
          : item.parent_id === parent),
    )
    .sort((a, b) =>
      sort === 'newest'
        ? b.created_at.localeCompare(a.created_at)
        : sort === 'size'
          ? (b.file_size ?? 0) - (a.file_size ?? 0)
          : a.title.localeCompare(b.title),
    )
  const navigate = (id: string | null) => {
    setParent(id)
    setSearch('')
  }
  return (
    <main
      class={`resources-page ${dragging ? 'resources-dragging' : ''}`}
      onDragOver={(e) => {
        if (canManage) {
          e.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={(e) => {
        if (canManage) {
          e.preventDefault()
          setDragging(false)
          void upload(Array.from(e.dataTransfer?.files ?? []))
        }
      }}
    >
      <header class="resources-heading">
        <div>
          <p class="resource-eyebrow">THE SHARED LIBRARY</p>
          <h1>Resources</h1>
          <p class="resource-muted">Useful things, all in one place. Browse, learn, and keep exploring.</p>
        </div>
        {canManage && (
          <div class="resource-actions">
            <button onClick={() => setEditor({ kind: 'folder' })}>＋ Folder</button>
            <button onClick={() => setEditor({ kind: 'link' })}>↗ Add link</button>
            <button class="resource-primary" disabled={uploading} onClick={() => picker.current?.click()}>
              ↑ Upload files
            </button>
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              aria-label="Choose files to upload"
              onChange={(e) => {
                void upload(Array.from(e.currentTarget.files ?? []))
                e.currentTarget.value = ''
              }}
            />
          </div>
        )}
      </header>
      <nav aria-label="Folder breadcrumbs" class="resource-breadcrumbs">
        <button onClick={() => navigate(null)}>Library</button>
        {folderTrail(folders, parent).map((f) => (
          <span key={f.id}>
            {' '}
            / <button onClick={() => navigate(f.id)}>{f.title}</button>
          </span>
        ))}
      </nav>
      <div class="resource-toolbar">
        <label class="resource-search">
          <span class="sr-only">Search library</span>
          <input
            type="search"
            placeholder="Search titles, descriptions, and folders…"
            value={search}
            onInput={(e) => setSearch(e.currentTarget.value)}
          />
        </label>
        <label>
          <span class="sr-only">Resource type</span>
          <select aria-label="Resource type" value={kind} onChange={(e) => setKind(e.currentTarget.value)}>
            <option value="all">All types</option>
            {Object.keys(icons).map((k) => (
              <option value={k} key={k}>
                {k === 'pdf' ? 'PDF' : k.charAt(0).toUpperCase() + k.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span class="sr-only">Sort resources</span>
          <select aria-label="Sort resources" value={sort} onChange={(e) => setSort(e.currentTarget.value)}>
            <option value="title">Name A–Z</option>
            <option value="newest">Newest first</option>
            <option value="size">Largest first</option>
          </select>
        </label>
      </div>
      {uploadStatus && (
        <p role="status" class="resource-upload-status">
          {uploadStatus}
        </p>
      )}
      {uploadErrors.map((message) => (
        <p key={message} role="alert" class="resource-error">
          {message}
        </p>
      ))}
      {error && (
        <div role="alert" class="resource-error">
          {error} <button onClick={load}>Reload library</button>
        </div>
      )}
      {loading ? (
        <div role="status" class="resource-empty">
          Loading your shared library…
        </div>
      ) : (
        <>
          <p class="resource-section-label">
            {query
              ? 'SEARCH RESULTS · ENTIRE LIBRARY'
              : parent
                ? folders.find((f) => f.id === parent)?.title
                : 'LIBRARY'}{' '}
            <span>{visibleFolders.length + visibleItems.length} items</span>
          </p>
          {!visibleFolders.length && !visibleItems.length && !error && (
            <div class="resource-empty">
              <span aria-hidden="true">▱</span>
              <h2>{query || kind !== 'all' ? 'Nothing matches yet' : 'A little space for useful things'}</h2>
              <p>
                {query || kind !== 'all'
                  ? 'Try another search or resource type.'
                  : canManage
                    ? 'Create a folder, add a link, or drop files here to get started.'
                    : 'Resources shared by your administrators will appear here.'}
              </p>
            </div>
          )}
          <div class="resource-grid">
            {visibleFolders.map((folder) => (
              <article class="resource-card resource-folder" key={folder.id}>
                <button class="resource-card-open" onClick={() => navigate(folder.id)}>
                  <span class="resource-icon" aria-hidden="true">
                    📁
                  </span>
                  <h3>{folder.title}</h3>
                  <p class="resource-muted">
                    {folders.filter((f) => f.parent_id === folder.id).length +
                      items.filter((i) => i.parent_id === folder.id).length}{' '}
                    items
                  </p>
                </button>
                {canManage && (
                  <div class="resource-card-actions">
                    <button
                      aria-label={`Edit folder ${folder.title}`}
                      onClick={() => setEditor({ kind: 'folder', record: folder })}
                    >
                      Edit
                    </button>
                    <button
                      aria-label={`Delete folder ${folder.title}`}
                      onClick={() => {
                        setError('')
                        setDeleting({ record: folder, folder: true })
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </article>
            ))}
            {visibleItems.map((item) => (
              <article class="resource-card" key={item.id}>
                <div class={`resource-cover resource-kind-${item.kind}`}>
                  <span aria-hidden="true">{icons[item.kind] ?? '▱'}</span>
                  <span class="resource-kind-label">{item.kind === 'pdf' ? 'PDF' : item.kind}</span>
                </div>
                <div class="resource-card-body">
                  <h3>{item.title}</h3>
                  <p class="resource-description">
                    {item.description ||
                      (item.kind === 'link'
                        ? safeResourceLink(item.external_url)
                          ? new URL(item.external_url ?? '').hostname
                          : 'Unavailable link'
                        : item.original_filename)}
                  </p>
                  <p class="resource-muted resource-meta">
                    {item.kind === 'link' ? 'Website' : sizeLabel(item.file_size)}
                    {query && item.parent_id
                      ? ` · ${folderTrail(folders, item.parent_id)
                          .map((f) => f.title)
                          .join(' / ')}`
                      : ''}
                  </p>
                  <div class="resource-card-actions">
                    {item.kind === 'link' ? (
                      safeResourceLink(item.external_url) && (
                        <a
                          href={safeResourceLink(item.external_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open link ↗
                        </a>
                      )
                    ) : (
                      <button onClick={() => setPreview(item)}>
                        {item.kind === 'document' ? 'File details & download' : 'View & download'}
                      </button>
                    )}
                    {canManage && (
                      <>
                        <button
                          aria-label={`Edit ${item.title}`}
                          onClick={() =>
                            setEditor({ kind: item.kind === 'link' ? 'link' : 'item', record: item })
                          }
                        >
                          Edit
                        </button>
                        <button
                          aria-label={`Delete ${item.title}`}
                          onClick={() => {
                            setError('')
                            setDeleting({ record: item, folder: false })
                          }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
          {canManage && (
            <p class="resource-drop-hint">
              Drop files anywhere here to upload to {parent ? 'this folder' : 'the library'}. Files with the
              same name are kept separately.
            </p>
          )}
        </>
      )}
      {editor && (
        <ResourceEditor
          editor={editor}
          folders={folders}
          parent={parent}
          close={() => setEditor(null)}
          saved={refresh}
        />
      )}
      {preview && <Preview item={preview} close={() => setPreview(null)} />}
      {deleting && (
        <Dialog
          title={`Delete ${deleting.folder ? 'folder' : 'resource'}?`}
          close={() => !busy && setDeleting(null)}
        >
          <p>Delete “{deleting.record.title}”?</p>
          <p>
            {deleting.folder
              ? 'This permanently deletes this folder, every nested folder, and all files and links inside. This cannot be undone.'
              : 'This permanently removes this shared resource for everyone. This cannot be undone.'}
          </p>
          {error && (
            <p role="alert" class="resource-error">
              {error}
            </p>
          )}
          <footer>
            <button disabled={busy} onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button
              class="resource-danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setError('')
                try {
                  await api.deleteResource(deleting.record.id, deleting.folder)
                  await refresh()
                  setDeleting(null)
                } catch (e) {
                  setError(api.resourceError(e))
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? 'Deleting…' : deleting.folder ? 'Delete folder and all contents' : 'Delete resource'}
            </button>
          </footer>
        </Dialog>
      )}
    </main>
  )
}

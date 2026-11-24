import type { FamilyFolder } from '@aurboda/api-spec'

import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'preact/hooks'

import {
  createFamilyFolder,
  familyError,
  moveFamily,
  removeFamilyFolder,
  renameFamilyFolder,
} from '../../state/api/family-photos'
import { FamilyIcon } from './Icon'

export type AlbumFilters = { folder: string; from: string; to: string }
export function FolderSelect({
  folders,
  value,
  onChange,
  disabled = false,
  label = 'Folder',
  browsing = false,
}: {
  folders: FamilyFolder[]
  value: string
  onChange: (id: string) => void
  disabled?: boolean
  label?: string
  browsing?: boolean
}) {
  return (
    <label class="family-folder-select">
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.currentTarget.value)}>
        {browsing && <option value="">All folders</option>}
        <option value={browsing ? 'unfiled' : ''}>Unfiled</option>
        {value && value !== 'unfiled' && !folders.some((folder) => folder.id === value) && (
          <option value={value}>Folder unavailable</option>
        )}
        {folders.map((folder) => (
          <option key={folder.id} value={folder.id}>
            {folder.name}
            {browsing ? ` (${folder.count})` : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
export function AlbumOrganization({
  folders,
  filters,
  onFilters,
  admin,
  onChanged,
}: {
  folders: FamilyFolder[]
  filters: AlbumFilters
  onFilters: (filters: AlbumFilters) => void
  admin: boolean
  onChanged: () => void
}) {
  const current = folders.find((folder) => folder.id === filters.folder)
  return (
    <div class="family-organization">
      <div class="family-folder-browse">
        <FamilyIcon name="folder" />
        <FolderSelect
          folders={folders}
          value={filters.folder}
          onChange={(folder) => onFilters({ ...filters, folder })}
          browsing
        />
        {admin && (
          <FolderEditor
            key={current?.id ?? 'new'}
            folder={current}
            onCreated={(folder) => {
              onChanged()
              onFilters({ ...filters, folder })
            }}
            onRemoved={() => {
              onChanged()
              onFilters({ ...filters, folder: '' })
            }}
            onChanged={onChanged}
          />
        )}
      </div>
      <DateFilter key={`${filters.from}:${filters.to}`} filters={filters} onFilters={onFilters} />
    </div>
  )
}
function FolderEditor({
  folder,
  onCreated,
  onRemoved,
  onChanged,
}: {
  folder?: FamilyFolder
  onCreated: (id: string) => void
  onRemoved: () => void
  onChanged: () => void
}) {
  const panel = useRef<HTMLDetailsElement>(null)
  const [name, setName] = useState('')
  const [rename, setRename] = useState(folder?.name ?? '')
  const change = useMutation({
    mutationFn: async (operation: 'create' | 'rename' | 'remove') => {
      if (operation === 'create') {
        const result = await createFamilyFolder(name)
        return { operation, id: result.id }
      }
      if (!folder) throw new Error('Choose a folder')
      if (operation === 'rename') await renameFamilyFolder(folder.id, rename)
      else await removeFamilyFolder(folder.id)
      return { operation, id: folder.id }
    },
    onSuccess: (result) => {
      if (panel.current) panel.current.open = false
      setName('')
      if (result.operation === 'create') onCreated(result.id)
      else if (result.operation === 'remove') onRemoved()
      else onChanged()
    },
  })
  return (
    <details ref={panel} class="family-organize-popover">
      <summary aria-label={folder ? 'Folder options' : 'New folder'}>
        {folder ? 'Folder options' : '+ New folder'}
      </summary>
      <div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            change.mutate('create')
          }}
        >
          <label>
            New folder
            <input
              value={name}
              maxLength={80}
              placeholder="Summer days, birthdays…"
              onInput={(e) => setName(e.currentTarget.value)}
            />
          </label>
          <button class="family-button" disabled={change.isPending || !name.trim()}>
            Create folder
          </button>
        </form>
        {folder && (
          <div class="family-folder-edit">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                change.mutate('rename')
              }}
            >
              <label>
                Folder name
                <input value={rename} maxLength={80} onInput={(e) => setRename(e.currentTarget.value)} />
              </label>
              <button
                class="family-button"
                disabled={change.isPending || !rename.trim() || rename === folder.name}
              >
                Rename folder
              </button>
            </form>
            <p class="family-note">Removing this folder keeps its photos in the album.</p>
            <button
              class="family-text-button"
              disabled={change.isPending}
              onClick={() => change.mutate('remove')}
            >
              Remove folder
            </button>
          </div>
        )}
        {change.error && <p role="alert">{familyError(change.error)}</p>}
      </div>
    </details>
  )
}
function DateFilter({
  filters,
  onFilters,
}: {
  filters: AlbumFilters
  onFilters: (filters: AlbumFilters) => void
}) {
  const panel = useRef<HTMLDetailsElement>(null)
  const [from, setFrom] = useState(filters.from)
  const [to, setTo] = useState(filters.to)
  const invalid = !!from && !!to && from > to
  return (
    <details ref={panel} class="family-organize-popover family-date-filter">
      <summary>
        <FamilyIcon name="calendar" />
        {filters.from || filters.to ? 'Dates selected' : 'Date'}
      </summary>
      <div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (invalid) return
            onFilters({ ...filters, from, to })
            if (panel.current) panel.current.open = false
          }}
        >
          <label>
            From
            <input
              type="date"
              value={from}
              max={to || '9999-12-31'}
              min="0001-01-01"
              onInput={(e) => setFrom(e.currentTarget.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={to}
              min={from || '0001-01-01'}
              max="9999-12-31"
              onInput={(e) => setTo(e.currentTarget.value)}
            />
          </label>
          <p class="family-note">Uses the date taken, or the date added when unavailable.</p>
          {invalid && <p role="alert">Choose an end date after the start date.</p>}
          <button class="family-button" disabled={invalid}>
            Apply dates
          </button>
          <button
            type="button"
            class="family-text-button"
            onClick={() => {
              onFilters({ ...filters, from: '', to: '' })
              if (panel.current) panel.current.open = false
            }}
          >
            Clear dates
          </button>
        </form>
      </div>
    </details>
  )
}
export function MemoryFolder({
  folders,
  itemId,
  folderId,
  onChanged,
}: {
  folders: FamilyFolder[]
  itemId: string
  folderId: string | null
  onChanged: () => void
}) {
  const [destination, setDestination] = useState(folderId ?? '')
  const move = useMutation({
    mutationFn: () => moveFamily({ ids: [itemId], album_id: destination || null }),
    onSuccess: onChanged,
  })
  return (
    <div class="family-memory-folder">
      <FolderSelect
        folders={folders}
        value={destination}
        onChange={setDestination}
        disabled={move.isPending}
      />
      <button
        class="family-button"
        disabled={move.isPending || destination === (folderId ?? '')}
        onClick={() => move.mutate()}
      >
        Move memory
      </button>
      {move.error && <p role="alert">{familyError(move.error)}</p>}
    </div>
  )
}
export function SelectionTools({
  folders,
  ids,
  shown,
  onSelection,
  onChanged,
}: {
  folders: FamilyFolder[]
  ids: string[] | null
  shown: string[]
  onSelection: (ids: string[] | null) => void
  onChanged: () => void
}) {
  const [destination, setDestination] = useState('')
  const move = useMutation({
    mutationFn: () => moveFamily({ ids: ids ?? [], album_id: destination || null }),
    onSuccess: () => {
      onSelection(null)
      onChanged()
    },
  })
  if (!ids) {
    return (
      <div class="family-selection-entry">
        <button class="family-text-button" disabled={!shown.length} onClick={() => onSelection([])}>
          Select memories
        </button>
      </div>
    )
  }
  return (
    <div class="family-selection-bar" aria-label="Organize selected memories">
      <span>{ids.length} selected</span>
      <button
        class="family-text-button"
        disabled={move.isPending}
        onClick={() => onSelection(shown.slice(0, 200))}
      >
        Select shown{shown.length > 200 ? ' (up to 200)' : ''}
      </button>
      <FolderSelect
        folders={folders}
        value={destination}
        onChange={setDestination}
        disabled={move.isPending}
        label="Move to"
      />
      <button class="family-button" disabled={move.isPending || !ids.length} onClick={() => move.mutate()}>
        {move.isPending ? 'Moving…' : 'Move selected'}
      </button>
      <button class="family-text-button" disabled={move.isPending} onClick={() => onSelection(null)}>
        Cancel selection
      </button>
      {move.error && <p role="alert">{familyError(move.error)}</p>}
    </div>
  )
}

/** Offsets at each local midnight keep inclusive calendar dates correct across daylight saving changes. */
export function familyDateQuery(filters: AlbumFilters) {
  const start = filters.from ? new Date(`${filters.from}T00:00:00`) : undefined
  const end = filters.to ? new Date(`${filters.to}T00:00:00`) : undefined
  if (end) end.setDate(end.getDate() + 1)
  return {
    from_date: filters.from || undefined,
    to_date: filters.to || undefined,
    from_offset: start?.getTimezoneOffset(),
    to_offset: end?.getTimezoneOffset(),
  }
}

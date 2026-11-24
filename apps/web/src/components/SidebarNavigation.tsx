import type { JSX } from 'preact'

import { useEffect, useRef, useState } from 'preact/hooks'

import type { NavigationLink } from './nav-links'

import { useFamilyAccess } from '../state/api/family-photos'
import { auth } from '../state/auth'
import { currentSessionGeneration } from '../state/sessionBoundary'
import { isPageVisible, setPageVisibility } from './feature-control'
import {
  moveSidebarEntry,
  orderSidebarEntries,
  savedSidebarOrder,
  type SidebarEntry,
  sidebarEntries,
} from './sidebar-order'
import { usePageVisibility } from './usePageVisibility'
import { useSidebarPreferences } from './useSidebarPreferences'
import './SidebarNavigation.css'

export function SidebarNavigation({
  url,
  collapsed = false,
  drawer = false,
  onNavigate,
  onEditingChange,
  beforeReorganize,
}: {
  url: string
  collapsed?: boolean
  drawer?: boolean
  onNavigate?: () => void
  onEditingChange?: (editing: boolean) => void
  beforeReorganize?: JSX.Element
}) {
  const visible = usePageVisibility()
  const { data: family } = useFamilyAccess()
  const preferences = useSidebarPreferences()
  const { query, busy, message, failed, save } = preferences
  const [editing, setEditing] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    'group:sharing': true,
    'group:data-sources': url.startsWith('/data-sources'),
  })
  const [draft, setDraft] = useState<string[] | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const drag = useRef<{
    key: string
    keys: string[]
    pointerId: number
    generation: number
    clientY: number
    clientX: number
  } | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<string | null>(null)
  const entries = orderSidebarEntries(
    sidebarEntries(Boolean(auth.value.is_admin)),
    query.data?.sidebar_order,
  ).filter(
    (entry) =>
      (entry.href !== '/family-photos' || family?.allowed === true) &&
      (entry.children || visible(entry.href) || editing),
  )
  const ordered = draft ? orderSidebarEntries(entries, draft) : entries
  const keys = entries.map((entry) => entry.key)
  const disabled = busy || query.status !== 'success'

  useEffect(() => {
    setEditing(false)
    setDraft(null)
    setDragging(null)
    pendingFocus.current = null
    drag.current = null
    onEditingChange?.(false)
  }, [auth.value.token])

  useEffect(() => {
    const key = pendingFocus.current
    if (!key) return
    pendingFocus.current = null
    const entry = [...(root.current?.querySelectorAll<HTMLElement>('[data-sidebar-key]') ?? [])].find(
      (element) => element.dataset.sidebarKey === key,
    )
    entry?.querySelector<HTMLButtonElement>('.sidebar-drag-handle')?.focus({ preventScroll: true })
  }, [query.data?.sidebar_order])

  const updateDragTarget = (clientX: number, clientY: number) => {
    const current = drag.current
    const target = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-sidebar-key]')
    const targetKey = target?.dataset.sidebarKey
    const heading = target?.querySelector('.sidebar-entry-heading')?.getBoundingClientRect()
    if (!current || !target || !root.current?.contains(target) || !targetKey || !heading) return
    const index = current.keys.indexOf(current.key)
    const targetIndex = current.keys.indexOf(targetKey)
    const midpoint = heading.top + heading.height / 2
    const crossed = targetIndex > index ? clientY > midpoint : clientY < midpoint
    if (targetIndex === index || !crossed) return
    current.keys = moveSidebarEntry(current.keys, current.key, targetKey)
    setDraft(current.keys)
  }

  useEffect(() => {
    if (!dragging) return
    let frame: number
    const scroll = root.current?.closest<HTMLElement>(drawer ? '.nav-drawer' : '.sidebar')
    const tick = () => {
      const current = drag.current
      if (!current || !scroll) return
      const bounds = scroll.getBoundingClientRect()
      if (current.clientY < bounds.top + 48) scroll.scrollTop -= 8
      if (current.clientY > bounds.bottom - 48) scroll.scrollTop += 8
      updateDragTarget(current.clientX, current.clientY)
      frame = requestAnimationFrame(tick)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      drag.current = null
      setDragging(null)
      setDraft(null)
    }
    window.addEventListener('keydown', onKey)
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKey)
    }
  }, [dragging, drawer])

  const toggleEditing = () => {
    if (drag.current) return
    const next = !editing
    setEditing(next)
    onEditingChange?.(next)
  }
  const persistOrder = (next: string[]) => {
    if (disabled) return
    void save({ sidebar_order: savedSidebarOrder(query.data?.sidebar_order ?? [], next) })
  }
  const move = (key: string, direction: number) => {
    const index = keys.indexOf(key)
    if (index + direction < 0 || index + direction >= keys.length) return
    pendingFocus.current = key
    persistOrder(moveSidebarEntry(keys, key, keys[index + direction]))
  }
  const finishDrag = (event: JSX.TargetedPointerEvent<HTMLDivElement>, cancel = false) => {
    const current = drag.current
    if (!current || event.pointerId !== current.pointerId) return
    drag.current = null
    setDragging(null)
    setDraft(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (
      !cancel &&
      current.generation === currentSessionGeneration() &&
      current.keys.join('\n') !== keys.join('\n')
    ) {
      persistOrder(current.keys)
    }
  }
  const dragHandle = (key: string, label: string) => (
    <button
      type="button"
      class="sidebar-drag-handle"
      aria-label={`Move ${label}`}
      title="Drag to move, or use Up and Down arrow keys"
      disabled={disabled}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          drag.current = null
          setDragging(null)
          setDraft(null)
        }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault()
          move(key, event.key === 'ArrowUp' ? -1 : 1)
        }
      }}
      onPointerDown={(event) => {
        if (drag.current || disabled || (event.pointerType === 'mouse' && event.button !== 0)) return
        event.preventDefault()
        event.currentTarget.focus()
        root.current?.setPointerCapture(event.pointerId)
        drag.current = {
          key,
          keys,
          pointerId: event.pointerId,
          generation: currentSessionGeneration(),
          clientY: event.clientY,
          clientX: event.clientX,
        }
        setDragging(key)
      }}
    >
      ⠿
    </button>
  )
  const visibilitySwitch = (link: NavigationLink) => (
    <input
      type="checkbox"
      role="switch"
      class="sidebar-page-switch"
      aria-label={`Show ${link.label}`}
      title={link.href === '/settings' ? 'Settings is always available' : `Show ${link.label}`}
      checked={isPageVisible(link.href, query.data?.hidden_pages)}
      disabled={disabled || Boolean(dragging) || link.href === '/settings'}
      onChange={(event) =>
        void save({
          hidden_pages: setPageVisibility(
            query.data?.hidden_pages ?? [],
            link.href,
            event.currentTarget.checked,
          ),
        })
      }
    />
  )
  const page = (link: NavigationLink, child = false, active = false) => {
    const isActive = active || url === link.href
    return (
      <div
        class={`sidebar-page-row${editing && !isPageVisible(link.href, query.data?.hidden_pages) ? ' page-hidden' : ''}`}
        key={link.href}
      >
        <a
          href={link.href}
          class={
            drawer
              ? `${child ? 'drawer-sub-link' : ''}${isActive ? ' active' : ''}`
              : `sidebar-link${isActive ? ' active' : ''}`
          }
          title={collapsed && !editing ? link.label : link.description}
          onClick={onNavigate}
        >
          {!drawer && <span class="sidebar-icon">{link.icon}</span>}
          <span class="sidebar-label">{link.label}</span>
        </a>
        {editing && visibilitySwitch(link)}
      </div>
    )
  }

  const groupChildren = (children: NavigationLink[] | undefined, open: boolean) => {
    if (!children || !open || (collapsed && !editing)) return null
    return (
      <div class={drawer ? 'drawer-sub-links' : 'sidebar-sub-links'}>
        {children.map((link) => page(link, true))}
      </div>
    )
  }

  const moveButtons = (entry: SidebarEntry) => (
    <span class="sidebar-move-buttons">
      <button
        type="button"
        aria-label={`Move ${entry.label} up`}
        disabled={disabled || keys.indexOf(entry.key) === 0}
        onClick={() => move(entry.key, -1)}
      >
        ↑
      </button>
      <button
        type="button"
        aria-label={`Move ${entry.label} down`}
        disabled={disabled || keys.indexOf(entry.key) === keys.length - 1}
        onClick={() => move(entry.key, 1)}
      >
        ↓
      </button>
    </span>
  )

  const groupHeading = (entry: SidebarEntry, children: NavigationLink[], open: boolean, active: boolean) =>
    collapsed && !editing ? (
      entry.key === 'group:sharing' ? (
        <div class="sidebar-collapsed-group">{children.map((link) => page(link))}</div>
      ) : (
        page({ ...children[0], label: entry.label, icon: entry.icon }, false, active)
      )
    ) : (
      <button
        type="button"
        class={
          drawer
            ? `drawer-section-toggle${active ? ' active' : ''}`
            : `sidebar-section-btn${active ? ' active' : ''}`
        }
        aria-expanded={Boolean(open)}
        onClick={() => setExpanded((value) => ({ ...value, [entry.key]: !open }))}
        disabled={editing}
      >
        {!drawer && <span class="sidebar-icon">{entry.icon}</span>}
        <span class="sidebar-label">{entry.label}</span>
        <span class={drawer ? 'dropdown-arrow' : 'sidebar-section-arrow'}>{open ? '▴' : '▾'}</span>
      </button>
    )

  const editingHelp = () => (
    <div class="sidebar-edit-help">
      <p>Drag handles to reorder pages. Use arrow keys or move buttons too. Switches show or hide pages.</p>
      {query.isPending && <p role="status">Loading preferences…</p>}
      {query.isError && (
        <p role="alert">
          Could not load your preferences.{' '}
          <button type="button" onClick={() => void query.refetch()}>
            Retry
          </button>
        </p>
      )}
    </div>
  )

  return (
    <>
      <div
        class={`sidebar-pages${editing ? ' reorganizing' : ''}`}
        ref={root}
        onPointerMove={(event) => {
          const current = drag.current
          if (!current || event.pointerId !== current.pointerId) return
          current.clientX = event.clientX
          current.clientY = event.clientY
          updateDragTarget(event.clientX, event.clientY)
        }}
        onPointerUp={(event) => finishDrag(event)}
        onPointerCancel={(event) => finishDrag(event, true)}
        onLostPointerCapture={(event) => finishDrag(event, true)}
      >
        {editing && editingHelp()}
        {ordered.map((entry) => {
          const children = entry.children?.filter((link) => visible(link.href) || editing)
          if (!editing && children?.length === 0) return null
          const open = editing || expanded[entry.key]
          const active = children?.some(
            (link) => url === link.href || (link.href !== '/data-sources' && url.startsWith(`${link.href}/`)),
          )
          return (
            <div
              key={entry.key}
              data-sidebar-key={entry.key}
              class={`sidebar-entry${dragging === entry.key ? ' dragging' : ''}`}
            >
              <div class="sidebar-entry-heading">
                {editing && dragHandle(entry.key, entry.label)}
                {children ? groupHeading(entry, children, Boolean(open), Boolean(active)) : page(entry)}
                {editing && moveButtons(entry)}
              </div>
              {groupChildren(children, Boolean(open))}
            </div>
          )
        })}
        {editing && (
          <p class="sidebar-save-status" role={failed ? 'alert' : 'status'}>
            {busy ? 'Saving…' : message}
          </p>
        )}
      </div>
      {beforeReorganize}
      <label class="sidebar-reorganize" title="Reorganize pages">
        <span>{collapsed && !editing ? '↕' : 'Reorganize'}</span>
        <input
          type="checkbox"
          role="switch"
          aria-label="Reorganize"
          checked={editing}
          onChange={toggleEditing}
        />
      </label>
    </>
  )
}

import type { ComponentChildren } from 'preact'

import { useEffect, useRef, useState } from 'preact/hooks'

import { planningError } from '../state/api/planning-error'
import './PlanningUI.css'

export function PlanningDialog({
  title,
  close,
  children,
  busy = false,
}: {
  title: string
  close: () => void
  children: ComponentChildren
  busy?: boolean
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
      class="planning-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) close()
      }}
    >
      <header>
        <h2>{title}</h2>
        <button type="button" aria-label="Close dialog" disabled={busy} onClick={close}>
          ×
        </button>
      </header>
      {children}
    </dialog>
  )
}
export function PlanningError({ error, retry }: { error: unknown; retry?: () => void }) {
  return error ? (
    <div class="planning-error" role="alert">
      {planningError(error)}{' '}
      {retry && (
        <button type="button" onClick={retry}>
          Retry
        </button>
      )}
    </div>
  ) : null
}
export function Pagination({
  page,
  total,
  size = 20,
  change,
}: {
  page: number
  total: number
  size?: number
  change: (page: number) => void
}) {
  return total > size || page > 1 ? (
    <nav class="planning-pagination" aria-label="Pagination">
      <button disabled={page <= 1} onClick={() => change(page - 1)}>
        Previous
      </button>
      <span>
        Page {page}
        {page <= Math.max(1, Math.ceil(total / size)) ? ` of ${Math.max(1, Math.ceil(total / size))}` : ''}
      </span>
      <button disabled={page * size >= total} onClick={() => change(page + 1)}>
        Next
      </button>
    </nav>
  ) : null
}
export function DeletePlanningItem({
  title,
  remove,
  close,
  saved,
}: {
  title: string
  remove: () => Promise<unknown>
  close: () => void
  saved: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  return (
    <PlanningDialog title="Delete item" close={close} busy={busy}>
      <p>Delete “{title}”? This cannot be undone.</p>
      <PlanningError error={error} />
      <div class="planning-actions">
        <button disabled={busy} onClick={close}>
          Cancel
        </button>
        <button
          class="planning-danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              await remove()
              saved()
              close()
            } catch (e) {
              setError(e)
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </PlanningDialog>
  )
}
export const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export const shiftDate = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00`)
  value.setDate(value.getDate() + days)
  return localDate(value)
}
export const prettyDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
export const quantityText = (value: number | null) =>
  value === null ? '' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value)

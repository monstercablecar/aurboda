import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'preact/hooks'

import { fetchUserSettings, updateUserSettings } from '../state/api'
import { auth } from '../state/auth'
import { currentSessionGeneration } from '../state/sessionBoundary'
import { featurePages, isPageVisible, setPageVisibility } from './feature-control'
import './FeatureControl.css'

export function FeatureControl({
  inline = false,
  disabled = false,
  onBusyChange,
}: {
  inline?: boolean
  disabled?: boolean
  onBusyChange?: (busy: boolean) => void
}) {
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['userSettings'], queryFn: fetchUserSettings })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const saving = useRef(false)
  const mounted = useRef(true)
  useEffect(
    () => () => {
      mounted.current = false
    },
    [],
  )
  const change = async (path: string, visible: boolean) => {
    if (saving.current || !query.data) return
    saving.current = true
    const session = currentSessionGeneration()
    const isCurrent = () => mounted.current && session === currentSessionGeneration()
    setBusy(true)
    onBusyChange?.(true)
    setMessage('')
    setFailed(false)
    try {
      await client.cancelQueries({ queryKey: ['userSettings'] })
      if (!isCurrent()) return
      const hidden_pages = setPageVisibility(query.data.hidden_pages ?? [], path, visible)
      const result = await updateUserSettings({ hidden_pages })
      if (!result.success) throw new Error('Settings update failed')
      if (!isCurrent()) return
      client.setQueryData(['userSettings'], result)
      setMessage('Saved')
    } catch {
      if (isCurrent()) {
        setFailed(true)
        setMessage('Could not save. Your menu is unchanged. Try the switch again.')
      }
    } finally {
      saving.current = false
      if (isCurrent()) {
        setBusy(false)
        onBusyChange?.(false)
      }
    }
  }
  return (
    <section
      class={inline ? 'feature-control' : 'settings-section feature-control'}
      aria-label="Feature Control"
    >
      {!inline && <h2>Feature Control</h2>}
      <p>
        Choose the pages shown in your menus. You can unhide them here anytime. Hiding a page keeps its data,
        tracking and direct links available.
      </p>
      {query.isPending ? (
        <p role="status">Loading pages…</p>
      ) : query.isError ? (
        <p role="alert">
          Could not load your preferences.{' '}
          <button type="button" onClick={() => void query.refetch()}>
            Retry
          </button>
        </p>
      ) : (
        <div class="feature-control-list">
          {featurePages(Boolean(auth.value.is_admin)).map((page) => {
            const locked = page.href === '/settings'
            const description = page.description ?? `Show ${page.label} in your menus.`
            return (
              <label class="feature-control-row" key={page.href} title={description}>
                <span class="feature-control-page">
                  <span>
                    {page.icon} {page.label}
                  </span>
                  <small id={`feature-${encodeURIComponent(page.href)}`}>{description}</small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={`Show ${page.label}`}
                  aria-describedby={`feature-${encodeURIComponent(page.href)}`}
                  checked={isPageVisible(page.href, query.data?.hidden_pages)}
                  disabled={locked || busy || disabled}
                  onChange={(event) => void change(page.href, event.currentTarget.checked)}
                />
                {locked && <small>Always available</small>}
              </label>
            )
          })}
        </div>
      )}
      <p role={failed ? 'alert' : 'status'} class="feature-control-status">
        {busy ? 'Saving…' : message}
      </p>
    </section>
  )
}

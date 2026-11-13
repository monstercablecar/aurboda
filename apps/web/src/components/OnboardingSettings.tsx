import { useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'preact-iso'
import { useRef, useState } from 'preact/hooks'

import { updateUserSettings } from '../state/api'
import { currentSessionGeneration } from '../state/sessionBoundary'

export function OnboardingSettings() {
  const session = useRef(currentSessionGeneration())
  const client = useQueryClient()
  const { route } = useLocation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const reopen = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const settings = await updateUserSettings({ onboarding_dismissed_at: null })
      if (session.current !== currentSessionGeneration()) return
      client.setQueryData(['userSettings'], settings)
      route('/?onboarding=review')
    } catch {
      if (session.current === currentSessionGeneration()) {
        setError('Could not open the guide. Please try again.')
      }
    } finally {
      if (session.current === currentSessionGeneration()) setBusy(false)
    }
  }
  return (
    <section class="settings-section">
      <h2>Setup guide</h2>
      <p>Revisit setup, skipped integrations and the feature tour. Your saved progress stays intact.</p>
      <button type="button" disabled={busy} onClick={() => void reopen()}>
        {busy ? 'Opening…' : 'Open setup guide'}
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

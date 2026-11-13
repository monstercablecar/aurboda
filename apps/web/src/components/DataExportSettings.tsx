import { useEffect, useRef, useState } from 'preact/hooks'

import { apiErrorMessage, requestExportDumpLink } from '../state/api'
import { currentSessionGeneration } from '../state/sessionBoundary'
import { SettingsSection } from './SettingsSection'

const DOCS_URL = 'https://github.com/fiddur/aurboda/blob/develop/docs/data-export.md'

export function DataExportSettings() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pending = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const onDownload = async () => {
    if (pending.current) return
    pending.current = true
    const generation = currentSessionGeneration()
    const isCurrent = () => mounted.current && generation === currentSessionGeneration()
    setError(null)
    setBusy(true)
    try {
      const { url } = await requestExportDumpLink()
      if (isCurrent()) window.location.href = url
    } catch (err) {
      if (isCurrent()) setError(apiErrorMessage(err, 'Could not start the export'))
    } finally {
      pending.current = false
      if (isCurrent()) setBusy(false)
    }
  }

  return (
    <SettingsSection title="Export account data">
      <p class="section-description">
        Download your saved account database as a gzipped SQL file, which you can restore into another
        compatible Aurboda installation. <a href={DOCS_URL}>How to restore it</a>.
      </p>
      <p class="section-description">
        Includes saved People profiles, history, goals and important dates; Work records; CPAP data;
        treatments; questionnaire definitions and answers; and custom settings and metrics.
      </p>
      <p class="field-description">
        Excludes shared Resources and server shared catalogs, server sign-in and access configuration, and
        unsaved browser drafts.
      </p>
      <p class="field-description">
        The export includes the credentials Aurboda stores for your integrations (e.g. Garmin and Oura
        tokens), so keep the file safe.
      </p>
      <button type="button" class="primary" disabled={busy} onClick={onDownload}>
        {busy ? 'Preparing export…' : 'Download export'}
      </button>
      {busy && <p role="status">Preparing your account export…</p>}
      {error && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
    </SettingsSection>
  )
}

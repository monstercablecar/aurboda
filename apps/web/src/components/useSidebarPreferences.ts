import type { UpdateSettingsInput } from '@aurboda/api-spec'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'preact/hooks'

import { fetchUserSettings, updateUserSettings } from '../state/api'
import { auth } from '../state/auth'
import { currentSessionGeneration } from '../state/sessionBoundary'

export function useSidebarPreferences() {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ['userSettings'],
    queryFn: fetchUserSettings,
    enabled: Boolean(auth.value.token),
  })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const saving = useRef<number | null>(null)
  const mounted = useRef(true)
  useEffect(
    () => () => {
      mounted.current = false
    },
    [],
  )

  useEffect(() => {
    saving.current = null
    setBusy(false)
    setFailed(false)
    setMessage('')
  }, [auth.value.token])

  const save = async (update: Pick<UpdateSettingsInput, 'sidebar_order' | 'hidden_pages'>) => {
    const generation = currentSessionGeneration()
    if (saving.current === generation || !query.data) return
    saving.current = generation
    const isCurrent = () => mounted.current && generation === currentSessionGeneration()
    setBusy(true)
    setFailed(false)
    setMessage('')
    try {
      await client.cancelQueries({ queryKey: ['userSettings'] })
      if (!isCurrent()) return
      const result = await updateUserSettings(update)
      if (!result.success) throw new Error('Settings update failed')
      if (!isCurrent()) return
      await client.cancelQueries({ queryKey: ['userSettings'] })
      if (!isCurrent()) return
      client.setQueryData(['userSettings'], result)
      setMessage('Saved')
    } catch {
      if (isCurrent()) {
        setFailed(true)
        setMessage('Could not save. Your menu is unchanged. Try again.')
      }
    } finally {
      if (saving.current === generation) saving.current = null
      if (isCurrent()) setBusy(false)
    }
  }
  return { query, busy, message, failed, save }
}

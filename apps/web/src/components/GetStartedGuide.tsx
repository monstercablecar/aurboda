import type { OnboardingStepId, UpdateSettingsInput, UserSettingsResponse } from '@aurboda/api-spec'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { endOfDay, startOfDay, subDays } from 'date-fns'
import { useLocation } from 'preact-iso'
import { useEffect, useRef, useState } from 'preact/hooks'

import {
  fetchActivityWatchStatus,
  fetchFollowing,
  fetchProductivity,
  fetchRawRecordCount,
  fetchUserSettings,
  listMyChallengeParticipations,
  updateUserSettings,
} from '../state/api'
import { currentSessionGeneration } from '../state/sessionBoundary'
import { ActivityWatchInstall } from './ActivityWatchInstall'
import { Celebration } from './Celebration'
import { nextCelebration, type CelebrationEvent } from './celebration-catalog'
import { FeatureControl } from './FeatureControl'
import { onboardingCounts, onboardingSteps, FOGHOUSE_URL, type StepStatus } from './onboarding-model'
import { OnboardingFlow } from './OnboardingFlow'

const staleTime = 10 * 60 * 1000
function useSetupSignals(
  settings: UserSettingsResponse | undefined,
  needs: (id: OnboardingStepId) => boolean,
  active: boolean,
) {
  const health = useQuery({
    enabled: needs('android_app'),
    queryKey: ['getStarted', 'healthConnectRecords'],
    queryFn: () => fetchRawRecordCount({ source: 'health_connect' }),
    staleTime,
    refetchInterval: active ? 30000 : false,
  })
  const wearable = useQuery({
    enabled: needs('wearable'),
    queryKey: [
      'getStarted',
      'wearable',
      settings?.garmin_connected,
      settings?.oura_connected,
      settings?.strava_connected,
    ],
    queryFn: async () => {
      const results = await Promise.all([
        settings?.garmin_connected ? fetchRawRecordCount({ source: 'garmin' }) : 0,
        settings?.oura_connected ? fetchRawRecordCount({ source: 'oura' }) : 0,
        settings?.strava_connected ? fetchRawRecordCount({ source: 'strava' }) : 0,
      ])
      return results.some((count) => count > 0)
    },
    staleTime,
    refetchInterval: active ? 30000 : false,
  })
  const desktop = useQuery({
    enabled: needs('computer_time'),
    queryKey: ['getStarted', 'desktop'],
    queryFn: async () => {
      const devices = await fetchActivityWatchStatus()
      if (!devices.length) return false
      const result = await fetchProductivity(startOfDay(subDays(new Date(), 7)), endOfDay(new Date()))
      return result.records.some((record) => record.source === 'activitywatch' && !record.is_mobile)
    },
    staleTime,
    refetchInterval: active ? 30000 : false,
  })
  const social = useQuery({
    enabled: needs('social'),
    queryKey: ['getStarted', 'social'],
    queryFn: async () =>
      (await fetchFollowing()).length > 0 || (await listMyChallengeParticipations()).length > 0,
    staleTime,
  })
  return [
    { id: 'android_app' as const, query: health, detected: (health.data ?? 0) > 0 },
    { id: 'wearable' as const, query: wearable, detected: !!wearable.data },
    { id: 'computer_time' as const, query: desktop, detected: !!desktop.data },
    { id: 'social' as const, query: social, detected: !!social.data },
  ]
}

export function GetStartedGuide({ forceReview = false }: { forceReview?: boolean }) {
  const location = useLocation()
  const review =
    forceReview || new URLSearchParams(location.url.split('?')[1] ?? '').get('onboarding') === 'review'
  const client = useQueryClient()
  const settingsQuery = useQuery({ queryFn: fetchUserSettings, queryKey: ['userSettings'] })
  const settings = settingsQuery.data
  const [hidden, setHidden] = useState(false)
  const [chapter, setChapter] = useState(0)
  const [selectedId, setSelectedId] = useState<OnboardingStepId>('feature_control')
  const [busy, setBusy] = useState(false)
  const [featureBusy, setFeatureBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const session = useRef(currentSessionGeneration())
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [celebration, setCelebration] = useState<CelebrationEvent | null>(null)
  const saving = useRef(false)
  const initialPending = useRef<boolean | null>(null)
  const baseline = useRef<Partial<Record<OnboardingStepId, boolean>>>({})
  const attempted = useRef(new Set<string>())
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const steps = onboardingSteps(settings?.onboarding_progress, settings?.onboarding_manual_done)
  if (settings && initialPending.current === null) {
    initialPending.current = onboardingCounts(steps).remaining > 0
    const firstPending = steps.find((step) => step.status === 'pending') ?? steps[0]
    setChapter(firstPending.chapter)
    setSelectedId(firstPending.id)
  }
  const active = isGuideActive(settings, hidden, review, initialPending.current)
  const needs = (id: OnboardingStepId) => active && steps.find((s) => s.id === id)?.status === 'pending'
  const signals = useSetupSignals(settings, needs, active)
  const [health, wearable, desktop, social] = signals.map((signal) => signal.query)
  const save = async (update: UpdateSettingsInput, celebrate: boolean, hide = false) => {
    if (saving.current) return false
    saving.current = true
    setBusy(true)
    setError('')
    try {
      const result = await updateUserSettings(update)
      if (!mounted.current || session.current !== currentSessionGeneration()) return false
      client.setQueryData(['userSettings'], result)
      if (hide) setHidden(true)
      if (celebrate) {
        const counts = onboardingCounts(
          onboardingSteps(result.onboarding_progress, result.onboarding_manual_done),
        )
        setCelebration(
          nextCelebration(
            counts.remaining === 0 && counts.completed > 0 ? 'onboarding-finish' : 'onboarding-step',
          ),
        )
      }
      return true
    } catch {
      if (mounted.current && session.current === currentSessionGeneration()) {
        setError('Your change could not be saved. Please try again. Your progress is unchanged.')
      }
      return false
    } finally {
      saving.current = false
      if (mounted.current && session.current === currentSessionGeneration()) setBusy(false)
    }
  }
  useEffect(() => {
    if (!active || featureBusy) return
    for (const signal of signals) {
      if (!signal.query.isSuccess) continue
      const isInitial = baseline.current[signal.id] === undefined
      if (isInitial) baseline.current[signal.id] = signal.detected
      if (!signal.detected || !needs(signal.id) || saving.current) continue
      const key = `${signal.id}:${steps.find((s) => s.id === signal.id)?.status}`
      if (attempted.current.has(key)) continue
      attempted.current.add(key)
      void save(
        { onboarding_progress: { [signal.id]: 'completed' } },
        !isInitial && baseline.current[signal.id] === false,
      )
      break
    }
  }, [
    active,
    featureBusy,
    settings,
    health.data,
    health.isSuccess,
    wearable.data,
    wearable.isSuccess,
    desktop.data,
    desktop.isSuccess,
    social.data,
    social.isSuccess,
    busy,
    retry,
  ])
  if (!settings || !active) return null
  const signalCopy: Partial<Record<OnboardingStepId, string>> = {}
  for (const signal of signals) {
    signalCopy[signal.id] = signalText(signal, settings)
  }
  const changeChapter = (next: number) => {
    setChapter(next)
    const chapterSteps = steps.filter((s) => s.chapter === next)
    setSelectedId((chapterSteps.find((s) => s.status === 'pending') ?? chapterSteps[0]).id)
  }
  const changeStatus = async (id: OnboardingStepId, status: StepStatus) => {
    if (status === 'completed' && !steps.find((s) => s.id === id)?.manualLabel) return
    const success = await save({ onboarding_progress: { [id]: status } }, status === 'completed')
    if (!mounted.current || session.current !== currentSessionGeneration()) return
    if (success && status !== 'pending') {
      const next = steps.find((s) => s.chapter === chapter && s.id !== id && s.status === 'pending')
      if (next) setSelectedId(next.id)
    }
    if (status === 'pending') attempted.current.delete(`${id}:pending`)
  }
  return (
    <>
      <OnboardingFlow
        steps={onboardingSteps(settings.onboarding_progress, settings.onboarding_manual_done, signalCopy)}
        chapter={chapter}
        selectedId={selectedId}
        busy={[busy, featureBusy].some(Boolean)}
        error={
          error ||
          (signals.some((s) => s.query.isError)
            ? 'Some setup checks are unavailable. You can continue exploring.'
            : '')
        }
        copied={copied}
        onChapter={changeChapter}
        onSelect={setSelectedId}
        onStatus={(id, status) => void changeStatus(id, status)}
        onHide={() => void save({ onboarding_dismissed_at: new Date().toISOString() }, false, true)}
        onCopyUrl={() => {
          void navigator.clipboard
            .writeText(FOGHOUSE_URL)
            .then(() => setCopied(true))
            .catch(() => setError('Could not copy. Select and copy the website address above.'))
        }}
        onRetry={() => {
          attempted.current.clear()
          setError('')
          setRetry((value) => value + 1)
          for (const s of signals) if (needs(s.id)) void s.query.refetch()
        }}
        featureControl={<FeatureControl inline disabled={busy} onBusyChange={setFeatureBusy} />}
        computerSetup={<ActivityWatchInstall manualHref="/data-sources/activitywatch-desktop" />}
      />
      {celebration && <Celebration {...celebration} onDone={() => setCelebration(null)} />}
    </>
  )
}

function isGuideActive(
  settings: UserSettingsResponse | undefined,
  hidden: boolean,
  review: boolean,
  initiallyPending: boolean | null,
) {
  return (
    !!settings && !hidden && (review || !settings.onboarding_dismissed_at) && (review || !!initiallyPending)
  )
}
function signalText(signal: ReturnType<typeof useSetupSignals>[number], settings: UserSettingsResponse) {
  return signal.query.isError
    ? 'Status unavailable — retry the check below.'
    : signal.query.isPending
      ? 'Checking setup…'
      : signal.detected
        ? 'Data verified — saving setup progress…'
        : signal.id === 'wearable' &&
            (settings.garmin_connected || settings.oura_connected || settings.strava_connected)
          ? 'Connected — waiting for first data'
          : signal.id === 'social'
            ? 'No follow or challenge found yet.'
            : 'Waiting for first data'
}

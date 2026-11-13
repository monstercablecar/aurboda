import { useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, subDays } from 'date-fns'
import { useLocation } from 'preact-iso'
import { useEffect, useMemo, useState } from 'preact/hooks'

import { Celebration } from '../../components/Celebration'
import { nextCelebration, type CelebrationEvent } from '../../components/celebration-catalog'
import {
  fetchAssessments,
  fetchPharmacologyTimeline,
  fetchQuestionnaires,
  fetchSubstances,
  fetchTreatmentSessions,
  fetchTreatmentTypes,
  pharmacologyErrorMessage,
} from '../../state/api'
import { auth } from '../../state/auth'
import { InsightsView } from './InsightsView'
import { LibraryView } from './LibraryView'
import { localDateKey, treatmentUrl, treatmentViews, type TreatmentsView } from './model'
import { nutritionQuestionnaireIds, treatmentQuestionnaires } from './questionnaire-scope'
import { TimelineView } from './TimelineView'
import { TodayView } from './TodayView'
import { TreatmentJournal } from './TreatmentJournal'
import './style.css'

const viewForQuery = (view: string | undefined, action: string | undefined): TreatmentsView => {
  if (treatmentViews.some((candidate) => candidate.key === view)) return view as TreatmentsView
  if (['substance', 'regimen', 'treatment-type', 'context-type'].includes(action ?? '')) return 'library'
  if (action === 'treatment') return 'journal'
  return 'today'
}

// eslint-disable-next-line complexity -- journal view coordinates independent timeline and treatment data sources
function JournalView({
  notify,
  timezone,
}: {
  notify: (message: string, tone?: 'success' | 'error', celebrationMessage?: string) => void
  timezone: string
}) {
  const queryClient = useQueryClient()
  const start = useMemo(() => subDays(new Date(), 120).toISOString(), [])
  const end = useMemo(() => addDays(new Date(), 30).toISOString(), [])
  const timelineQuery = useQuery({
    queryFn: () => fetchPharmacologyTimeline({ end, limit: 1000, start }),
    queryKey: ['pharmacology', 'timeline', start, end],
  })
  const sessionsQuery = useQuery({
    queryFn: () => fetchTreatmentSessions({ limit: 1000, start, end }),
    queryKey: ['pharmacology', 'treatments', start, end],
  })
  const treatmentTypesQuery = useQuery({
    queryFn: fetchTreatmentTypes,
    queryKey: ['pharmacology', 'treatment-types'],
  })
  const questionnairesQuery = useQuery({
    queryFn: fetchQuestionnaires,
    queryKey: ['pharmacology', 'questionnaires'],
  })
  const assessmentsQuery = useQuery({
    queryFn: () => fetchAssessments({ limit: 1000, start, end }),
    queryKey: ['pharmacology', 'assessments', start, end],
  })
  const substancesQuery = useQuery({
    queryFn: () => fetchSubstances({ limit: 1000 }),
    queryKey: ['pharmacology', 'substances'],
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['pharmacology'] })
  const error =
    timelineQuery.error ??
    sessionsQuery.error ??
    treatmentTypesQuery.error ??
    questionnairesQuery.error ??
    assessmentsQuery.error ??
    substancesQuery.error
  if (error) {
    return (
      <div class="empty-state error-state">
        <h2>Journal could not load</h2>
        <p>{pharmacologyErrorMessage(error)}</p>
      </div>
    )
  }
  if (
    timelineQuery.isLoading ||
    sessionsQuery.isLoading ||
    treatmentTypesQuery.isLoading ||
    questionnairesQuery.isLoading ||
    assessmentsQuery.isLoading ||
    substancesQuery.isLoading
  ) {
    return <p class="loading-state">Loading journal…</p>
  }

  const nutritionIds = nutritionQuestionnaireIds(questionnairesQuery.data ?? [])
  const timeline = (timelineQuery.data ?? []).filter(
    (entry) => entry.type !== 'assessment' || !nutritionIds.has(entry.data.template_id),
  )
  const substances = substancesQuery.data ?? []
  const administrations = timeline
    .filter((entry) => entry.type === 'administration')
    .map((entry) => entry.data)
  return (
    <div class="journal-view">
      <TreatmentJournal
        administrations={administrations}
        assessments={(assessmentsQuery.data ?? []).filter(
          (assessment) => !nutritionIds.has(assessment.template_id),
        )}
        notify={notify}
        onRefresh={refresh}
        questionnaires={treatmentQuestionnaires(questionnairesQuery.data ?? [])}
        sessions={sessionsQuery.data ?? []}
        substances={substances}
        timezone={timezone}
        treatmentTypes={treatmentTypesQuery.data ?? []}
      />
      <TimelineView
        entries={timeline}
        notify={notify}
        onRefresh={refresh}
        substanceNames={new Map(substances.map((substance) => [substance.id, substance.display_name]))}
      />
    </div>
  )
}

export function Treatments() {
  const { query, route } = useLocation()
  const isLoggedIn = !!auth.value.token
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const view = viewForQuery(query.view, query.action)
  const [currentDate, setCurrentDate] = useState(localDateKey)
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentDate(localDateKey()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const date = query.date || currentDate
  const [feedback, setFeedback] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)
  const [celebration, setCelebration] = useState<CelebrationEvent | null>(null)
  const notify = (message: string, tone: 'success' | 'error' = 'success', celebrationMessage?: string) => {
    setFeedback({ message, tone })
    if (tone === 'success' && celebrationMessage) {
      setCelebration(nextCelebration('check-in'))
    }
  }

  useEffect(() => {
    if (!feedback) return
    const timeout = window.setTimeout(() => setFeedback(null), 5000)
    return () => window.clearTimeout(timeout)
  }, [feedback])

  if (!isLoggedIn) {
    return (
      <div class="treatments-page logged-out-state">
        <h1>Treatments</h1>
        <p>Please log in to use your treatment journal.</p>
      </div>
    )
  }

  return (
    <div class="treatments-page">
      {celebration && (
        <Celebration key={celebration.id} {...celebration} onDone={() => setCelebration(null)} />
      )}
      <header class="treatments-page-header">
        <div>
          <p class="treatments-kicker">Personal treatment & recovery journal</p>
          <h1>Treatments</h1>
        </div>
        <p class="header-disclaimer">Observations, not medical advice</p>
      </header>
      <nav class="treatments-tabs" aria-label="Treatments views">
        {treatmentViews.map((item) => (
          <a
            aria-current={view === item.key ? 'page' : undefined}
            class={view === item.key ? 'active' : ''}
            href={treatmentUrl(query, {
              action: undefined,
              assessment: undefined,
              context: undefined,
              regimen: undefined,
              substance: undefined,
              treatment: undefined,
              view: item.key,
            })}
            key={item.key}
            onClick={(event) => {
              event.preventDefault()
              route((event.currentTarget as HTMLAnchorElement).href.replace(window.location.origin, ''))
            }}
          >
            {item.label}
          </a>
        ))}
      </nav>
      {feedback && (
        <div
          class={`feedback-banner ${feedback.tone}`}
          role={feedback.tone === 'error' ? 'alert' : celebration ? undefined : 'status'}
          aria-live={celebration && feedback.tone !== 'error' ? 'off' : 'polite'}
        >
          <span>{feedback.message}</span>
          <button type="button" onClick={() => setFeedback(null)} aria-label="Dismiss message">
            ×
          </button>
        </div>
      )}
      <div class="treatments-view">
        {view === 'today' && <TodayView date={date} notify={notify} timezone={timezone} />}
        {view === 'journal' && <JournalView notify={notify} timezone={timezone} />}
        {view === 'library' && <LibraryView notify={notify} />}
        {view === 'insights' && <InsightsView notify={notify} timezone={timezone} />}
      </div>
    </div>
  )
}

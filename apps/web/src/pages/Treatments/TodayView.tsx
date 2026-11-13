import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'preact-iso'

import {
  fetchContextTypes,
  fetchPharmacologyToday,
  fetchQuestionnaires,
  fetchSubstances,
  pharmacologyErrorMessage,
} from '../../state/api'
import { AssessmentCard } from './AssessmentCard'
import { AssessmentForm } from './AssessmentForm'
import { ConfirmRegimen } from './ConfirmRegimen'
import { ContextEventForm } from './ContextEventForm'
import { actualVsScheduledLabel, treatmentStageLabel, treatmentUrl } from './model'
import { PrnForm } from './PrnForm'
import { isNutritionQuestionnaire, NutritionQuestionnaireNotice } from './questionnaire-scope'
import { RegimenCard } from './RegimenCard'

// eslint-disable-next-line complexity -- daily dashboard intentionally keeps all routine actions in one view
export function TodayView({
  date,
  notify,
  timezone,
}: {
  date: string
  notify: (message: string, tone?: 'success' | 'error', celebrationMessage?: string) => void
  timezone: string
}) {
  const { query, route } = useLocation()
  const queryClient = useQueryClient()
  const action = query.action
  const closeAction = () =>
    route(
      treatmentUrl(query, {
        action: undefined,
        assessment: undefined,
        regimen: undefined,
        substance: undefined,
      }),
      true,
    )
  const openAction = (changes: Record<string, string | undefined>) =>
    route(treatmentUrl(query, { ...changes, view: 'today' }))

  const todayQuery = useQuery({
    queryFn: () => fetchPharmacologyToday({ date, timezone }),
    queryKey: ['pharmacology', 'today', date, timezone],
    refetchInterval: 60_000,
  })
  const substancesQuery = useQuery({
    queryFn: () => fetchSubstances({ limit: 1000 }),
    queryKey: ['pharmacology', 'substances'],
  })
  const questionnairesQuery = useQuery({
    queryFn: fetchQuestionnaires,
    queryKey: ['pharmacology', 'questionnaires'],
  })
  const contextTypesQuery = useQuery({
    queryFn: fetchContextTypes,
    queryKey: ['pharmacology', 'context-types'],
  })

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['pharmacology'] })
  }
  const due = todayQuery.data?.due_regimens.find((item) => item.regimen.id === query.regimen)
  const assessmentTemplate = questionnairesQuery.data?.find(
    (template) => template.stable_key === query.assessment || template.id === query.assessment,
  )
  const completion = new Map(
    (todayQuery.data?.assessment_completion ?? []).map((item) => [item.template_id, item.completed]),
  )
  const dailyTemplates = (questionnairesQuery.data ?? [])
    .filter((template) => !isNutritionQuestionnaire(template))
    .filter(
      (template) =>
        !template.stable_key.startsWith('mental_') &&
        template.enabled &&
        ['morning', 'midday', 'evening', 'custom'].includes(template.moment),
    )
  const substanceNames = new Map(
    (substancesQuery.data ?? []).map((substance) => [substance.id, substance.display_name]),
  )
  const loading = todayQuery.isLoading || substancesQuery.isLoading || questionnairesQuery.isLoading
  const queryError = todayQuery.error ?? substancesQuery.error ?? questionnairesQuery.error

  if (loading) return <p class="loading-state">Loading today’s plan…</p>
  if (queryError) {
    return (
      <div class="empty-state error-state" role="alert">
        <h2>Today’s plan could not load</h2>
        <p>{pharmacologyErrorMessage(queryError)}</p>
        <button class="btn-secondary" type="button" onClick={() => void refresh()}>
          Try again
        </button>
      </div>
    )
  }

  const today = todayQuery.data
  if (!today) return null

  return (
    <div class="today-view">
      <section class="today-hero">
        <div>
          <p class="treatments-kicker">
            {new Date(`${date}T12:00:00`).toLocaleDateString([], { dateStyle: 'full' })}
          </p>
          <h2>Today</h2>
          <p>Review what was planned, then record what actually happened.</p>
        </div>
        <button class="prn-button" type="button" onClick={() => openAction({ action: 'prn' })}>
          <span aria-hidden="true">＋</span> Add PRN
        </button>
      </section>

      <div class="quick-actions" aria-label="Quick actions">
        <button class="btn-secondary" type="button" onClick={() => openAction({ action: 'context' })}>
          Add context
        </button>
        <a
          class="btn-secondary link-button"
          href={treatmentUrl(query, { action: 'treatment', view: 'journal' })}
        >
          Start treatment
        </a>
      </div>

      <section class="view-section" aria-labelledby="stacks-heading">
        <div class="section-heading">
          <div>
            <h2 id="stacks-heading">Stacks</h2>
            <p>Scheduled for your local day</p>
          </div>
          <span class="count-badge">{today.due_regimens.length}</span>
        </div>
        <div class="card-list">
          {today.due_regimens.length === 0 ? (
            <div class="empty-state compact-empty">No scheduled stacks today.</div>
          ) : (
            today.due_regimens.map((item) => (
              <RegimenCard
                due={item}
                key={item.regimen.id}
                onConfirm={() => openAction({ action: 'confirm', regimen: item.regimen.id })}
              />
            ))
          )}
        </div>
      </section>

      {dailyTemplates.length > 0 && (
        <section class="view-section" aria-labelledby="checkins-heading">
          <div class="section-heading">
            <div>
              <h2 id="checkins-heading">Check-ins</h2>
              <p>Raw answers are saved without a composite wellness score.</p>
            </div>
          </div>
          <div class="assessment-grid">
            {dailyTemplates.map((template) => (
              <AssessmentCard
                completed={completion.get(template.id) ?? false}
                key={template.id}
                template={template}
                onOpen={() => openAction({ action: 'assessment', assessment: template.stable_key })}
              />
            ))}
          </div>
        </section>
      )}

      <div class="two-column-sections">
        <section class="view-section" aria-labelledby="upcoming-heading">
          <div class="section-heading">
            <div>
              <h2 id="upcoming-heading">Upcoming treatments</h2>
              <p>Planned sessions</p>
            </div>
          </div>
          {today.upcoming_treatments.length === 0 ? (
            <div class="empty-state compact-empty">Nothing upcoming.</div>
          ) : (
            <div class="card-list">
              {today.upcoming_treatments.map((session) => (
                <a
                  class="treatments-card linked-card"
                  href={treatmentUrl(query, { treatment: session.id, view: 'journal' })}
                  key={session.id}
                >
                  <div>
                    <p class="treatments-kicker">{treatmentStageLabel(session.status)}</p>
                    <h3>{session.treatment_type.display_name}</h3>
                    <p>
                      {session.planned_at ? new Date(session.planned_at).toLocaleString() : 'No planned time'}
                    </p>
                  </div>
                  <span aria-hidden="true">›</span>
                </a>
              ))}
            </div>
          )}
        </section>

        <section class="view-section" aria-labelledby="recent-heading">
          <div class="section-heading">
            <div>
              <h2 id="recent-heading">Recent activity</h2>
              <p>Actual administrations</p>
            </div>
            <a href={treatmentUrl(query, { view: 'journal' })}>See journal</a>
          </div>
          {today.recent_administrations.length === 0 ? (
            <div class="empty-state compact-empty">No recent administrations.</div>
          ) : (
            <div class="compact-feed">
              {today.recent_administrations.map((event) => (
                <div class="compact-feed-row" key={event.id}>
                  <span class={`feed-dot status-${event.status}`} />
                  <div>
                    <strong>{substanceNames.get(event.substance_id) ?? 'Substance'}</strong>
                    <p>{actualVsScheduledLabel(event.administered_at, event.scheduled_at)}</p>
                  </div>
                  <span>
                    {event.dose} {event.dose_unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {today.incomplete_items.length > 0 && (
        <section class="incomplete-callout" aria-labelledby="incomplete-heading">
          <h2 id="incomplete-heading">Needs reconciliation</h2>
          <p>
            {today.incomplete_items.length} past-due item(s) have no recorded outcome. Open the stack and
            enter the actual date and time. An unrecorded item does not necessarily mean a missed dose.
          </p>
        </section>
      )}

      {action && (
        <div
          class="modal-backdrop"
          role="presentation"
          onClick={(event) => event.target === event.currentTarget && closeAction()}
        >
          <div class="modal-sheet" role="dialog" aria-modal="true">
            {action === 'confirm' && due && (
              <ConfirmRegimen
                key={`${due.regimen.id}:${today.date}`}
                date={today.date}
                due={due}
                timezone={timezone}
                onCancel={closeAction}
                onSaved={(events) => {
                  notify(`${events.length} administration${events.length === 1 ? '' : 's'} recorded.`)
                  void refresh()
                }}
              />
            )}
            {action === 'prn' && (
              <PrnForm
                key={`${today.date}:${query.substance ?? ''}`}
                date={today.date}
                initialSubstanceId={query.substance}
                substances={substancesQuery.data ?? []}
                timezone={timezone}
                onCancel={closeAction}
                onSaved={() => {
                  notify('PRN administration recorded.')
                  void refresh()
                  closeAction()
                }}
              />
            )}
            {action === 'assessment' &&
              assessmentTemplate &&
              isNutritionQuestionnaire(assessmentTemplate) && (
                <NutritionQuestionnaireNotice onClose={closeAction} />
              )}
            {action === 'assessment' &&
              assessmentTemplate &&
              !isNutritionQuestionnaire(assessmentTemplate) && (
                <AssessmentForm
                  key={`${today.date}:${assessmentTemplate.id}`}
                  date={today.date}
                  template={assessmentTemplate}
                  timezone={timezone}
                  onCancel={closeAction}
                  onSaved={() => {
                    notify(
                      `${assessmentTemplate.display_name} saved.`,
                      'success',
                      `${assessmentTemplate.display_name} is safely in your journal.`,
                    )
                    void refresh()
                    closeAction()
                  }}
                />
              )}
            {action === 'context' && (
              <ContextEventForm
                key={today.date}
                date={today.date}
                contextTypes={contextTypesQuery.data ?? []}
                timezone={timezone}
                onCancel={closeAction}
                onSaved={() => {
                  notify('Context added to the journal.')
                  void refresh()
                  closeAction()
                }}
              />
            )}
            {action === 'confirm' && !due && <p class="empty-state">That stack is not in today’s plan.</p>}
            {action === 'assessment' && !assessmentTemplate && (
              <p class="empty-state">That questionnaire is not available.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

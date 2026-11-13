import type { ContextEventType, TreatmentType } from '@aurboda/api-spec'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'preact-iso'
import { useState } from 'preact/hooks'

import {
  createContextType,
  createTreatmentType,
  fetchContextTypes,
  fetchQuestionnaires,
  fetchRegimens,
  fetchSubstances,
  fetchTreatmentTypes,
  pharmacologyErrorMessage,
  updateContextType,
  updateQuestionnaire,
  updateTreatmentType,
} from '../../state/api'
import { scheduleSummary, treatmentStageLabel, treatmentUrl } from './model'
import {
  isNutritionQuestionnaire,
  NutritionQuestionnaireNotice,
  treatmentQuestionnaires,
} from './questionnaire-scope'
import { QuestionnaireForm } from './QuestionnaireForm'
import { RegimenForm } from './RegimenForm'
import { SubstanceForm } from './SubstanceForm'

function TreatmentTypeForm({
  onCancel,
  onSaved,
  treatmentType,
}: {
  onCancel: () => void
  onSaved: (message: string) => void
  treatmentType?: TreatmentType
}) {
  const [displayName, setDisplayName] = useState(treatmentType?.display_name ?? '')
  const [key, setKey] = useState(treatmentType?.key ?? '')
  const [category, setCategory] = useState(treatmentType?.category ?? '')
  const [description, setDescription] = useState(treatmentType?.description ?? '')
  const [active, setActive] = useState(treatmentType?.active ?? true)
  const [followUps, setFollowUps] = useState(treatmentType?.default_follow_up_hours.join(', ') ?? '24, 168')
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        active,
        category,
        default_follow_up_hours: followUps
          .split(',')
          .map((value) => Number(value.trim()))
          .filter(Number.isFinite),
        description: description || undefined,
        display_name: displayName,
        key,
      }
      return treatmentType ? updateTreatmentType(treatmentType.id, body) : createTreatmentType(body)
    },
    onError: (mutationError) => setError(pharmacologyErrorMessage(mutationError)),
    onSuccess: () => onSaved(treatmentType ? 'Treatment type updated.' : 'Treatment type created.'),
  })
  return (
    <form
      class="treatments-form"
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate()
      }}
    >
      <div class="form-heading">
        <h2>{treatmentType ? 'Edit treatment type' : 'New treatment type'}</h2>
        <button class="icon-button" type="button" onClick={onCancel} aria-label="Close treatment type form">
          ×
        </button>
      </div>
      <div class="form-grid">
        <label class="field">
          <span>Name</span>
          <input
            required
            value={displayName}
            onInput={(event) => setDisplayName((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          <span>Stable key</span>
          <input
            required
            pattern="[a-z][a-z0-9_]*"
            value={key}
            onInput={(event) => setKey((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field full-field">
          <span>Category</span>
          <input
            required
            value={category}
            onInput={(event) => setCategory((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field full-field">
          <span>Description</span>
          <textarea
            value={description}
            onInput={(event) => setDescription((event.target as HTMLTextAreaElement).value)}
          />
        </label>
        <label class="field full-field">
          <span>Default follow-up hours</span>
          <input
            value={followUps}
            onInput={(event) => setFollowUps((event.target as HTMLInputElement).value)}
          />
        </label>
      </div>
      <label class="check-label">
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => setActive((event.target as HTMLInputElement).checked)}
        />
        Active
      </label>
      {error && <p class="form-error">{error}</p>}
      <div class="form-actions">
        <button class="btn-secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button class="btn-primary" type="submit" disabled={mutation.isPending}>
          Save
        </button>
      </div>
    </form>
  )
}

function ContextTypeForm({
  contextType,
  onCancel,
  onSaved,
}: {
  contextType?: ContextEventType
  onCancel: () => void
  onSaved: (message: string) => void
}) {
  const [displayName, setDisplayName] = useState(contextType?.display_name ?? '')
  const [key, setKey] = useState(contextType?.key ?? '')
  const [description, setDescription] = useState(contextType?.description ?? '')
  const [active, setActive] = useState(contextType?.active ?? true)
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: () => {
      const body = { active, description: description || undefined, display_name: displayName, key }
      return contextType ? updateContextType(contextType.id, body) : createContextType(body)
    },
    onError: (mutationError) => setError(pharmacologyErrorMessage(mutationError)),
    onSuccess: () => onSaved(contextType ? 'Context type updated.' : 'Context type created.'),
  })
  return (
    <form
      class="treatments-form"
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate()
      }}
    >
      <div class="form-heading">
        <h2>{contextType ? 'Edit context type' : 'New context type'}</h2>
        <button class="icon-button" type="button" onClick={onCancel} aria-label="Close context type form">
          ×
        </button>
      </div>
      <div class="form-grid">
        <label class="field">
          <span>Name</span>
          <input
            required
            value={displayName}
            onInput={(event) => setDisplayName((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          <span>Stable key</span>
          <input
            required
            pattern="[a-z][a-z0-9_]*"
            value={key}
            onInput={(event) => setKey((event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field full-field">
          <span>Description</span>
          <textarea
            value={description}
            onInput={(event) => setDescription((event.target as HTMLTextAreaElement).value)}
          />
        </label>
      </div>
      <label class="check-label">
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => setActive((event.target as HTMLInputElement).checked)}
        />
        Active
      </label>
      {error && <p class="form-error">{error}</p>}
      <div class="form-actions">
        <button class="btn-secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button class="btn-primary" type="submit" disabled={mutation.isPending}>
          Save
        </button>
      </div>
    </form>
  )
}

// eslint-disable-next-line complexity -- library view coordinates four independently configurable registries
export function LibraryView({ notify }: { notify: (message: string, tone?: 'success' | 'error') => void }) {
  const { query, route } = useLocation()
  const queryClient = useQueryClient()
  const substancesQuery = useQuery({
    queryFn: () => fetchSubstances({ limit: 1000 }),
    queryKey: ['pharmacology', 'substances'],
  })
  const regimensQuery = useQuery({
    queryFn: () => fetchRegimens({ limit: 1000 }),
    queryKey: ['pharmacology', 'regimens'],
  })
  const typesQuery = useQuery({ queryFn: fetchTreatmentTypes, queryKey: ['pharmacology', 'treatment-types'] })
  const questionnairesQuery = useQuery({
    queryFn: fetchQuestionnaires,
    queryKey: ['pharmacology', 'questionnaires'],
  })
  const contextTypesQuery = useQuery({
    queryFn: fetchContextTypes,
    queryKey: ['pharmacology', 'context-types'],
  })
  const action = query.action
  const selectedSubstance = substancesQuery.data?.find((item) => item.id === query.substance)
  const selectedRegimen = regimensQuery.data?.find((item) => item.id === query.regimen)
  const selectedTreatmentType = typesQuery.data?.find((item) => item.id === query.treatment)
  const selectedContextType = contextTypesQuery.data?.find((item) => item.id === query.context)
  const selectedQuestionnaire = questionnairesQuery.data?.find((item) => item.id === query.questionnaire)
  const close = () =>
    route(
      treatmentUrl(query, {
        action: undefined,
        context: undefined,
        questionnaire: undefined,
        regimen: undefined,
        substance: undefined,
        treatment: undefined,
      }),
      true,
    )
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ['pharmacology'] })
  const saved = (message: string) => {
    notify(message)
    void refresh()
    close()
  }
  const questionnaireMutation = useMutation({
    mutationFn: ({ enabled, id }: { enabled: boolean; id: string }) => updateQuestionnaire(id, { enabled }),
    onError: (error) => notify(pharmacologyErrorMessage(error), 'error'),
    onSuccess: () => {
      notify('Questionnaire updated.')
      void refresh()
    },
  })
  const error =
    substancesQuery.error ??
    regimensQuery.error ??
    typesQuery.error ??
    questionnairesQuery.error ??
    contextTypesQuery.error
  if (error)
    {return (
      <div class="empty-state error-state">
        <h2>Library could not load</h2>
        <p>{pharmacologyErrorMessage(error)}</p>
      </div>
    )}

  return (
    <div class="library-view">
      <section class="library-section">
        <div class="section-heading">
          <div>
            <h2>Substances</h2>
            <p>Medication, supplement, and PRN registry</p>
          </div>
          <button
            class="btn-primary"
            type="button"
            onClick={() =>
              route(treatmentUrl(query, { action: 'substance', substance: undefined, view: 'library' }))
            }
          >
            Add substance
          </button>
        </div>
        <div class="library-grid">
          {(substancesQuery.data ?? []).map((substance) => (
            <button
              class="library-card"
              type="button"
              key={substance.id}
              onClick={() =>
                route(treatmentUrl(query, { action: 'substance', substance: substance.id, view: 'library' }))
              }
            >
              <span class="library-icon" aria-hidden="true">
                {substance.favorite ? '★' : '○'}
              </span>
              <span>
                <strong>{substance.display_name}</strong>
                <small>
                  {substance.category} · {substance.formulation || 'formulation not set'} · {substance.status}
                </small>
              </span>
              <span>
                {substance.default_dose ?? '—'} {substance.dose_unit}
              </span>
            </button>
          ))}
        </div>
      </section>
      <section class="library-section">
        <div class="section-heading">
          <div>
            <h2>Stacks & regimens</h2>
            <p>Reusable schedules and item-specific overrides</p>
          </div>
          <button
            class="btn-primary"
            type="button"
            onClick={() =>
              route(treatmentUrl(query, { action: 'regimen', regimen: undefined, view: 'library' }))
            }
          >
            Add regimen
          </button>
        </div>
        <div class="library-grid">
          {(regimensQuery.data ?? []).map((regimen) => (
            <button
              class="library-card"
              type="button"
              key={regimen.id}
              onClick={() =>
                route(treatmentUrl(query, { action: 'regimen', regimen: regimen.id, view: 'library' }))
              }
            >
              <span class="library-icon" aria-hidden="true">
                ◫
              </span>
              <span>
                <strong>{regimen.name}</strong>
                <small>
                  {scheduleSummary(regimen.schedule)} · {regimen.items.length} item(s)
                </small>
              </span>
              <span class={`due-badge due-${regimen.status}`}>{treatmentStageLabel(regimen.status)}</span>
            </button>
          ))}
        </div>
      </section>
      <div class="library-columns">
        <section class="library-section">
          <div class="section-heading">
            <div>
              <h2>Treatment types</h2>
              <p>Generic session templates</p>
            </div>
            <button
              class="btn-secondary compact-button"
              type="button"
              onClick={() =>
                route(
                  treatmentUrl(query, { action: 'treatment-type', treatment: undefined, view: 'library' }),
                )
              }
            >
              Add
            </button>
          </div>
          <div class="compact-library-list">
            {(typesQuery.data ?? []).map((type) => (
              <button
                type="button"
                key={type.id}
                onClick={() =>
                  route(
                    treatmentUrl(query, { action: 'treatment-type', treatment: type.id, view: 'library' }),
                  )
                }
              >
                <span>
                  <strong>{type.display_name}</strong>
                  <small>
                    {type.category} · {type.default_follow_up_hours.length} follow-up time(s)
                  </small>
                </span>
                <span>{type.active ? 'Active' : 'Inactive'}</span>
              </button>
            ))}
          </div>
        </section>
        <section class="library-section">
          <div class="section-heading">
            <div>
              <h2>Context types</h2>
              <p>Illness, stress, travel, and more</p>
            </div>
            <button
              class="btn-secondary compact-button"
              type="button"
              onClick={() =>
                route(treatmentUrl(query, { action: 'context-type', context: undefined, view: 'library' }))
              }
            >
              Add
            </button>
          </div>
          <div class="compact-library-list">
            {(contextTypesQuery.data ?? []).map((type) => (
              <button
                type="button"
                key={type.id}
                onClick={() =>
                  route(treatmentUrl(query, { action: 'context-type', context: type.id, view: 'library' }))
                }
              >
                <span>
                  <strong>{type.display_name}</strong>
                  <small>{type.key}</small>
                </span>
                <span>{type.active ? 'Active' : 'Inactive'}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
      <section class="library-section">
        <div class="section-heading">
          <div>
            <h2>Questionnaires</h2>
            <p>Versioned questions rendered dynamically in check-ins and treatment stages</p>
          </div>
          <button
            class="btn-secondary compact-button"
            type="button"
            onClick={() =>
              route(
                treatmentUrl(query, { action: 'questionnaire', questionnaire: undefined, view: 'library' }),
              )
            }
          >
            Add
          </button>
        </div>
        <div class="questionnaire-list">
          {treatmentQuestionnaires(questionnairesQuery.data ?? []).map((template) => (
            <details class="questionnaire-card" key={template.id}>
              <summary>
                <span>
                  <strong>{template.display_name}</strong>
                  <small>
                    {treatmentStageLabel(template.moment)} · version {template.version} ·{' '}
                    {template.questions.length} questions
                  </small>
                </span>
                <label class="switch-label" onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={template.enabled}
                    disabled={questionnaireMutation.isPending}
                    onChange={(event) =>
                      questionnaireMutation.mutate({
                        enabled: (event.target as HTMLInputElement).checked,
                        id: template.id,
                      })
                    }
                  />
                  Enabled
                </label>
              </summary>
              <ol>
                {template.questions
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((question) => (
                    <li>
                      <span>{question.prompt}</span>
                      <small>
                        {treatmentStageLabel(question.response_type)} ·{' '}
                        {question.required ? 'required' : 'optional'} ·{' '}
                        {question.enabled ? 'enabled' : 'disabled'}
                      </small>
                    </li>
                  ))}
              </ol>
              <button
                class="btn-secondary compact-button"
                type="button"
                onClick={() =>
                  route(
                    treatmentUrl(query, {
                      action: 'questionnaire',
                      questionnaire: template.id,
                      view: 'library',
                    }),
                  )
                }
              >
                Edit questionnaire
              </button>
            </details>
          ))}
        </div>
      </section>
      {action && (
        <div class="modal-backdrop" role="presentation">
          <div class="modal-sheet" role="dialog" aria-modal="true">
            {action === 'substance' && (
              <SubstanceForm substance={selectedSubstance} onCancel={close} onSaved={saved} />
            )}
            {action === 'regimen' && (
              <RegimenForm
                regimen={selectedRegimen}
                substances={substancesQuery.data ?? []}
                onCancel={close}
                onSaved={saved}
              />
            )}
            {action === 'treatment-type' && (
              <TreatmentTypeForm treatmentType={selectedTreatmentType} onCancel={close} onSaved={saved} />
            )}
            {action === 'context-type' && (
              <ContextTypeForm contextType={selectedContextType} onCancel={close} onSaved={saved} />
            )}
            {action === 'questionnaire' &&
              selectedQuestionnaire &&
              isNutritionQuestionnaire(selectedQuestionnaire) && (
                <NutritionQuestionnaireNotice onClose={close} />
              )}
            {action === 'questionnaire' &&
              (!selectedQuestionnaire || !isNutritionQuestionnaire(selectedQuestionnaire)) && (
                <QuestionnaireForm template={selectedQuestionnaire} onCancel={close} onSaved={saved} />
              )}
          </div>
        </div>
      )}
    </div>
  )
}

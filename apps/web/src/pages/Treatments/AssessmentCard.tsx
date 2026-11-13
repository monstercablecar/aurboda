import type { QuestionnaireTemplate } from '@aurboda/api-spec'

import { treatmentStageLabel } from './model'

export function AssessmentCard({
  completed,
  onOpen,
  template,
}: {
  completed: boolean
  onOpen: () => void
  template: QuestionnaireTemplate
}) {
  return (
    <article class={`treatments-card assessment-card${completed ? ' completed' : ''}`}>
      <div>
        <p class="treatments-kicker">{treatmentStageLabel(template.moment)}</p>
        <h3>{template.display_name}</h3>
        {template.description && <p>{template.description}</p>}
      </div>
      <button class={completed ? 'btn-secondary compact-button' : 'btn-primary compact-button'} type="button" onClick={onOpen}>
        {completed ? 'Add another' : 'Check in'}
      </button>
    </article>
  )
}

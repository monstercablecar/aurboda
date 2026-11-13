import type { QuestionnaireTemplate } from '@aurboda/api-spec'

import { SIMPLE_FOOD_DAILY_KEY, SIMPLE_FOOD_REAPS_KEY, SIMPLE_FOOD_INTAKE_KEY } from '../SimpleFood/model'

const nutritionKeys = new Set<string>([SIMPLE_FOOD_DAILY_KEY, SIMPLE_FOOD_REAPS_KEY, SIMPLE_FOOD_INTAKE_KEY])
export const isNutritionQuestionnaire = (template: Pick<QuestionnaireTemplate, 'stable_key'>) =>
  nutritionKeys.has(template.stable_key)
export const treatmentQuestionnaires = (templates: QuestionnaireTemplate[]) =>
  templates.filter((template) => !isNutritionQuestionnaire(template))
export const nutritionQuestionnaireIds = (templates: QuestionnaireTemplate[]) =>
  new Set(templates.filter(isNutritionQuestionnaire).map((template) => template.id))

export function NutritionQuestionnaireNotice({ onClose }: { onClose: () => void }) {
  return (
    <section class="treatments-form">
      <h2>This nutrition check is on Simple Food</h2>
      <p>Your nutrition questionnaires and saved answers are available there.</p>
      <div class="form-actions">
        <button class="btn-secondary" type="button" onClick={onClose}>
          Close
        </button>
        <a class="btn-primary" href="/simple-food">
          Open Simple Food
        </a>
      </div>
    </section>
  )
}

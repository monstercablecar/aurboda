import type { AssessmentQuestion } from '@aurboda/api-spec'

export interface QuestionnaireChoice {
  value: string
  label: string
  detail?: string
}

export const configuredChoices = (question?: Pick<AssessmentQuestion, 'config'>): QuestionnaireChoice[] => {
  const values = question?.config.choices ?? question?.config.options
  if (!Array.isArray(values)) return []
  return values.flatMap((item): QuestionnaireChoice[] => {
    if (typeof item === 'string') return [{ value: item, label: item }]
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    if (
      !('value' in item) ||
      typeof item.value !== 'string' ||
      !('label' in item) ||
      typeof item.label !== 'string'
    )
      {return []}
    return [
      {
        value: item.value,
        label: item.label,
        ...('detail' in item && typeof item.detail === 'string' ? { detail: item.detail } : {}),
      },
    ]
  })
}

export const hasStructuredChoices = (config: AssessmentQuestion['config']): boolean => {
  const values = config.choices ?? config.options
  return Array.isArray(values) && values.some((item) => item !== null && typeof item === 'object')
}

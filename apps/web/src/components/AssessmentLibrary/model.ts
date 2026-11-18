import type { Assessment, QuestionnaireTemplate } from '@aurboda/api-spec'

import { instrumentScore, libraryInstrument } from '@aurboda/api-spec'

// eslint-disable-next-line complexity -- export distinguishes frozen metadata, missing scores and optional notes without inventing historical values
export function recordedEntryText(entry: Assessment, template: QuestionnaireTemplate): string {
  const score = entry.definition?.score?.value ?? instrumentScore(template, entry)
  const instrument = libraryInstrument(template.stable_key)
  return `${entry.definition?.display_name ?? template.display_name} · questionnaire version ${entry.template_version}\nObserved: ${entry.assessed_at} (${entry.timezone}); recorded: ${entry.created_at}\nRecall: ${entry.definition?.library?.recall_period ?? (template.version === entry.template_version ? template.library?.recall_period : undefined) ?? 'Historical recall instructions unavailable'}\n${instrument ? (score === null ? 'Score unavailable: incomplete answers or a different definition.\n' : `Recorded score: ${Number(score.toFixed(2))}/${instrument.score_max} (${instrument.scoring === 'mean' ? 'mean' : 'sum'}; not a diagnosis).\n`) : ''}${entry.responses.map((a) => `${a.question_prompt ?? template.questions.find((q) => q.id === a.question_id && q.version === a.question_version)?.prompt ?? 'Historical question'} [question version ${a.question_version}]: ${Array.isArray(a.value) ? a.value.join(', ') : String(a.value)}`).join('\n')}${entry.notes ? `\nNotes: ${entry.notes}` : ''}`
}

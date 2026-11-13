import { assessmentBody, ensureTemplate, entryValues } from '../../pages/Assessments/model'
import { createQuestionnaire, fetchQuestionnaires, submitAssessment } from '../../state/api/pharmacology'
import { currentSessionGeneration } from '../../state/sessionBoundary'
import { memoryInstrument, reactionInstrument } from './instruments'
import { serializeResult, type GameResult } from './protocol'

export const saveApi = { list: fetchQuestionnaires, create: createQuestionnaire, submit: submitAssessment }
export async function saveGameResult(
  result: GameResult,
  conditions: string,
  generation: number,
  isActive: () => boolean,
  api = saveApi,
) {
  const guard = () => {
    if (!isActive() || currentSessionGeneration() !== generation) {
      throw new Error('Session changed. This result was not saved to the new account.')
    }
  }
  guard()
  const instrument = result.game === 'memory' ? memoryInstrument : reactionInstrument
  const values = entryValues(instrument, {
    ...Object.fromEntries(Object.entries(result.metrics).map(([key, value]) => [key, String(value)])),
    device: result.device,
    conditions,
    report: serializeResult(result),
  })
  const template = await ensureTemplate(instrument, {
    list: () => {
      guard()
      return api.list()
    },
    create: (body) => {
      guard()
      return api.create(body)
    },
  })
  guard()
  const saved = await api.submit(
    assessmentBody(template, values, result.completed_at, Intl.DateTimeFormat().resolvedOptions().timeZone),
  )
  guard()
  return saved
}

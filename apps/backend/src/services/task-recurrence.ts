import { planningDateSchema, type TaskRecurrence } from '@aurboda/api-spec'

import { httpError } from '../http-error.ts'

/** Calendar arithmetic, never elapsed hours; the input and output are date-only. */
export const nextTaskOccurrence = (
  dueDate: string,
  recurrence: TaskRecurrence,
  monthlyAnchor?: number | null,
): { due_date: string; recurrence_anchor_day: number | null } => {
  if (!planningDateSchema.safeParse(dueDate).success || Number(dueDate.slice(0, 4)) < 1) {
    throw httpError(400, 'Choose a valid calendar due date for this repeating task.')
  }
  const next = new Date(`${dueDate}T00:00:00.000Z`)
  const anchor =
    typeof monthlyAnchor === 'number' &&
    Number.isInteger(monthlyAnchor) &&
    monthlyAnchor >= 1 &&
    monthlyAnchor <= 31
      ? monthlyAnchor
      : next.getUTCDate()
  if (recurrence === 'monthly') {
    next.setUTCDate(1)
    next.setUTCMonth(next.getUTCMonth() + 1)
    const endOfMonth = new Date(next)
    endOfMonth.setUTCMonth(endOfMonth.getUTCMonth() + 1)
    endOfMonth.setUTCDate(0)
    next.setUTCDate(Math.min(anchor, endOfMonth.getUTCDate()))
  } else {
    next.setUTCDate(next.getUTCDate() + (recurrence === 'weekly' ? 7 : 1))
  }
  if (!Number.isFinite(next.getTime()) || next.getUTCFullYear() > 9999 || next.getUTCFullYear() < 1) {
    throw httpError(
      400,
      'The next occurrence is outside the supported calendar range. Change the due date or turn repeating off.',
    )
  }
  return {
    due_date: next.toISOString().slice(0, 10),
    recurrence_anchor_day: recurrence === 'monthly' ? anchor : null,
  }
}

import type { TaskItem, TaskRecurrence } from '@aurboda/api-spec'
export const recurrenceLabels: Record<TaskRecurrence, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
}
export function TaskRecurrenceBadge({ item }: { item: TaskItem }) {
  return (
    <>
      {item.recurrence && (
        <span class="task-recurrence-badge">
          <span aria-hidden="true">↻</span> {recurrenceLabels[item.recurrence]}
        </span>
      )}
      {item.next_occurrence_id && <span class="task-next-occurrence">Next occurrence created</span>}
    </>
  )
}

import type { TaskItem, TaskWorkflowStatus } from '@aurboda/api-spec'
export const workflowColumns: { value: TaskWorkflowStatus; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
]
export const workflowOf = (item: TaskItem): TaskWorkflowStatus =>
  item.done ? 'done' : item.workflow_status === 'in_progress' ? 'in_progress' : 'todo'
export const workflowLabel = (item: TaskItem) =>
  workflowColumns.find((column) => column.value === workflowOf(item))?.label ?? 'To do'

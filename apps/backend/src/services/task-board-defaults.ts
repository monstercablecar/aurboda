import type { TaskBoardColumn } from '@aurboda/api-spec'

export const defaultTaskColumns: TaskBoardColumn[] = [
  { id: 'todo', title: 'To do', status: 'todo', color: '#64748b', wip_limit: null },
  { id: 'in_progress', title: 'In progress', status: 'in_progress', color: '#3b82f6', wip_limit: null },
  { id: 'done', title: 'Done', status: 'done', color: '#22c55e', wip_limit: null },
]

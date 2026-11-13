import type { TaskItem, TaskBoardColumn, TaskItemsQuery } from '@aurboda/api-spec'

import { workflowOf } from './task-workflow'
export type BoardFilters = {
  priority: string
  label: string
  blocked: boolean
  due_before: string
  due_after: string
  archived: 'exclude' | 'include' | 'only'
  sort: NonNullable<TaskItemsQuery['sort']>
}
export const defaultFilters: BoardFilters = {
  priority: '',
  label: '',
  blocked: false,
  due_before: '',
  due_after: '',
  archived: 'exclude',
  sort: 'manual',
}
export const columnOf = (item: TaskItem, columns: TaskBoardColumn[]) =>
  item.column_id ?? columns.find((c) => c.status === workflowOf(item))?.id
export function positionBefore(items: TaskItem[], target?: TaskItem) {
  if (!target) return Math.max(0, ...items.map((i) => i.position ?? 0)) + 1024
  const index = items.findIndex((i) => i.id === target.id)
  const right = target.position ?? 0
  const left = index > 0 ? (items[index - 1].position ?? 0) : right - 2048
  if (left >= right) {
    throw new Error(
      'These tasks have equal ordering positions. Move the target up or down first, then retry.',
    )
  }
  const position = left + (right - left) / 2
  if (position === left || position === right) {
    throw new Error('Ordering is too tight. Move the target to the end first, then retry.')
  }
  return position
}
export function readViews(user: string): { name: string; filters: BoardFilters }[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(`aurboda:task-views:${encodeURIComponent(user)}`) ?? '[]',
    )
    if (!Array.isArray(value)) return []
    return value.slice(0, 20).flatMap((v) => {
      if (!v || typeof v.name !== 'string' || v.name.length > 80 || !v.filters) return []
      const f = v.filters
      if (
        !['', '0', '1', '2', '3'].includes(f.priority) ||
        typeof f.label !== 'string' ||
        f.label.length > 40 ||
        typeof f.blocked !== 'boolean' ||
        !['exclude', 'include', 'only'].includes(f.archived) ||
        !['manual', 'due', 'priority', 'newest', 'oldest', 'title'].includes(f.sort)
      ) {
        return []
      }
      if (
        ![f.due_before, f.due_after].every(
          (d) => typeof d === 'string' && (d === '' || /^\d{4}-\d{2}-\d{2}$/.test(d)),
        )
      ) {
        return []
      }
      return [
        {
          name: v.name,
          filters: {
            priority: f.priority,
            label: f.label,
            blocked: f.blocked,
            due_before: f.due_before,
            due_after: f.due_after,
            archived: f.archived,
            sort: f.sort,
          },
        },
      ]
    })
  } catch {
    return []
  }
}

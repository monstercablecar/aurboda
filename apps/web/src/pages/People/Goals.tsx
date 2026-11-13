import type { PeopleEvent, PeopleOptions } from '@aurboda/api-spec'

import { Panel } from './ui'

export function Goals({
  goals,
  options,
  onAdd,
  onEdit,
}: {
  goals: PeopleEvent[]
  options: PeopleOptions
  onAdd: () => void
  onEdit: (goal: PeopleEvent) => void
}) {
  return (
    <Panel title="Goals" id="people-goals">
      <button class="people-primary" onClick={onAdd}>
        Add goal
      </button>
      {goals.length === 0 ? (
        <p class="people-muted">
          No goals yet. Add something you want to work toward, then update its progress here.
        </p>
      ) : (
        <ul class="people-history">
          {goals.map((goal) => {
            const status = goal.payload.goal_status ?? 'active'
            return (
              <li key={goal.id}>
                <h3 class="people-preserve-lines">
                  {goal.payload.title?.trim() || goal.payload.note?.trim() || 'Untitled goal'}
                </h3>
                {goal.payload.title && goal.payload.note && (
                  <p class="people-preserve-lines">{goal.payload.note}</p>
                )}
                <p>
                  Status: {options.goal_statuses?.find((option) => option.value === status)?.label ?? status}
                </p>
                {goal.payload.target_date && (
                  <p>
                    Target date: <time dateTime={goal.payload.target_date}>{goal.payload.target_date}</time>
                  </p>
                )}
                <button onClick={() => onEdit(goal)}>Edit goal</button>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

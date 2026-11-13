import { createTaskItemBodySchema, taskBoardSettingsSchema, type TaskBoardColumn } from '@aurboda/api-spec'
import { randomUUID } from 'node:crypto'

import { type UserDb, withTransaction } from '../db/pool.ts'
import { defaultTaskColumns } from './task-board-defaults.ts'
import { onboardingCatalog } from './task-onboarding-catalog.ts'

const catalogKey = 'optional-kanban-onboarding'

export const seedTaskOnboarding = (db: UserDb): Promise<void> =>
  withTransaction(db, async (tx) => {
    await tx.query('INSERT INTO task_board_settings (id, columns) VALUES (1,$1) ON CONFLICT DO NOTHING', [
      JSON.stringify(defaultTaskColumns),
    ])
    const board = await tx.query('SELECT columns, updated_at FROM task_board_settings WHERE id=1 FOR UPDATE')
    // This marker deliberately outlives every seeded task and the column, and every catalog revision.
    if ((await tx.query('SELECT 1 FROM task_onboarding_seed WHERE id=1')).rowCount) return

    const columns = taskBoardSettingsSchema.parse({
      columns: board.rows[0].columns,
      updated_at: board.rows[0].updated_at.toISOString(),
    }).columns
    const column: TaskBoardColumn = {
      id: randomUUID(),
      title: 'Onboarding',
      status: 'todo',
      color: '#8b5cf6',
      wip_limit: null,
    }
    const cards = onboardingCatalog(columns)
    const seededColumns = taskBoardSettingsSchema.shape.columns.parse([...columns, column])
    await tx.query(
      `UPDATE task_board_settings SET columns=$1,
       updated_at=GREATEST(date_trunc('milliseconds', clock_timestamp()), updated_at+interval '1 millisecond')
       WHERE id=1`,
      [JSON.stringify(seededColumns)],
    )
    for (const [position, card] of cards.entries()) {
      const { project_id, ...body } = createTaskItemBodySchema.parse({
        title: card.title,
        description: card.description,
        column_id: column.id,
        workflow_status: 'todo',
        position,
        labels: [],
        checklist: [],
        custom_fields: [],
        blocked_reason: '',
        archived: false,
      })
      await tx.query('INSERT INTO task_items (project_id, payload) VALUES ($1,$2)', [
        project_id,
        JSON.stringify({
          ...body,
          done: false,
          completed_at: null,
          recurrence: null,
          recurrence_anchor_day: null,
          next_occurrence_id: null,
        }),
      ])
    }
    await tx.query('INSERT INTO task_onboarding_seed (id, catalog_key, column_id) VALUES (1,$1,$2)', [
      catalogKey,
      column.id,
    ])
  })

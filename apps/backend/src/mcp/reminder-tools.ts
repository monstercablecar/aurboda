import { addReminderBodySchema, updateReminderBodySchema } from '@aurboda/api-spec'
import { z } from 'zod'

import { httpError, isHttpError } from '../http-error.ts'
import { reminderActions } from '../services/reminders.ts'
import { jsonResponse, type McpServer } from './helpers.ts'

export const registerReminderTools = (server: McpServer, user: string, actions = reminderActions): void => {
  const run = async (action: () => Promise<unknown>) => {
    try {
      return jsonResponse(await action())
    } catch (error) {
      if (isHttpError(error)) {
        return { ...jsonResponse({ success: false, error: error.message }), isError: true }
      }
      throw error
    }
  }
  server.tool(
    'list_reminders',
    'List your private custom reminders and scheduler availability.',
    {},
    async () =>
      run(async () => ({
        success: true,
        reminders: await actions.list(user),
        scheduler_ready: actions.ready(),
      })),
  )
  server.tool(
    'add_reminder',
    'Create a private phone reminder. Delivery uses Android polling, not an exact alarm. Weekly repeats on the start date weekday.',
    { ...addReminderBodySchema.shape },
    async (body) => run(async () => ({ success: true, reminder: await actions.add(user, body) })),
  )
  server.tool(
    'update_reminder',
    'Change or pause a private reminder. Edits schedule only future occurrences.',
    { id: z.string().uuid(), ...updateReminderBodySchema.shape },
    async ({ id, ...patch }) =>
      run(async () => {
        if (!Object.keys(patch).length) throw httpError(400, 'Provide a reminder change.')
        return { success: true, reminder: await actions.change(user, id, patch) }
      }),
  )
  server.tool(
    'delete_reminder',
    'Delete a private reminder. Calendar copies are independent.',
    { id: z.string().uuid() },
    async ({ id }) =>
      run(async () => {
        await actions.remove(user, id)
        return { success: true }
      }),
  )
  server.tool(
    'test_reminder_notification',
    'Queue a test of a saved reminder through the normal notification preferences. At most one test per account per minute; Android must poll to receive it.',
    { id: z.string().uuid() },
    async ({ id }) => run(async () => ({ success: true, queued: await actions.test(user, id) })),
  )
}

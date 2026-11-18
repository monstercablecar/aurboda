import type {
  AddReminderBody,
  BaseResponse,
  Reminder,
  ReminderResponse,
  RemindersResponse,
  ReminderTestResponse,
  UpdateReminderBody,
} from '@aurboda/api-spec'

import axios from 'axios'

import { API_URL } from '../../config'
import { auth } from '../auth'
import { currentSessionGeneration } from '../sessionBoundary'

export const createRemindersClient = () => {
  const generation = currentSessionGeneration()
  const token = auth.value.token
  const options = () => {
    if (generation !== currentSessionGeneration() || token !== auth.value.token || !token) {
      throw new Error('Your session changed. Reopen Settings to continue.')
    }
    return { headers: { Authorization: `Bearer ${token}` } }
  }
  const endpoint = (id: string) => `${API_URL}/reminders/${encodeURIComponent(id)}`
  const saved = (data: ReminderResponse): Reminder => {
    if (!data.success || !data.reminder) throw new Error('The notification could not be saved.')
    return data.reminder
  }
  return {
    list: async (): Promise<RemindersResponse> => {
      const { data } = await axios.get<RemindersResponse>(`${API_URL}/reminders`, options())
      if (!data.success) throw new Error('Could not load custom notifications.')
      return data
    },
    add: async (body: AddReminderBody): Promise<Reminder> =>
      saved((await axios.post<ReminderResponse>(`${API_URL}/reminders`, body, options())).data),
    update: async (id: string, body: UpdateReminderBody): Promise<Reminder> =>
      saved((await axios.patch<ReminderResponse>(endpoint(id), body, options())).data),
    remove: async (id: string): Promise<void> => {
      const { data } = await axios.delete<BaseResponse>(endpoint(id), options())
      if (!data.success) throw new Error('The notification could not be deleted.')
    },
    test: async (id: string): Promise<boolean> => {
      const { data } = await axios.post<ReminderTestResponse>(`${endpoint(id)}/test`, undefined, options())
      if (!data.success) throw new Error('The test could not be queued.')
      return data.queued
    },
  }
}

import type { WorkDayBody, WorkDayResponse } from '@aurboda/api-spec'

import axios from 'axios'

import { API_URL } from '../../config'
import { auth } from '../auth'
export const saveWorkDay = async (body: WorkDayBody) => {
  try {
    const response = await axios.post<WorkDayResponse>(`${API_URL}/work/days`, body, {
      headers: { Authorization: `Bearer ${auth.value.token}` },
    })
    if (!response.data.success || !response.data.data) {
      throw new Error(
        response.data.error ?? 'Workday could not be saved. Your draft is retained; retry when ready.',
      )
    }
    return response.data.data
  } catch (error) {
    if (axios.isAxiosError<WorkDayResponse>(error) && typeof error.response?.data.error === 'string') {
      throw new Error(`${error.response.data.error} Your draft is retained.`)
    }
    throw error
  }
}

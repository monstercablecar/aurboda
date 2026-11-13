import axios from 'axios'

import { apiErrorText } from '../../utils/profile'

export const planningError = (error: unknown) =>
  axios.isAxiosError(error) && error.response?.status === 409
    ? apiErrorText(
        error.response?.data?.error,
        'This item changed since you opened it. Close this form and refresh before trying again.',
      )
    : axios.isAxiosError(error)
      ? apiErrorText(error.response?.data?.error, 'Unable to save. Please try again.')
      : error instanceof Error
        ? error.message
        : 'Something went wrong. Please try again.'

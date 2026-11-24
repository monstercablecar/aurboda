import type {
  ActivityPeopleResponse,
  PersonTimeWithQuery,
  PersonTimeWithResponse,
  PrivateLinkTargetsResponse,
} from '@aurboda/api-spec'

import axios from 'axios'

import { API_URL } from '../../config'
import { auth } from '../auth'
const config = () => ({ headers: { Authorization: `Bearer ${auth.value.token}` } })
export const privateLinks = {
  targets: async (search = '') =>
    (
      await axios.get<PrivateLinkTargetsResponse>(`${API_URL}/private-link-targets`, {
        ...config(),
        params: { search },
      })
    ).data.data,
  people: async (id: string, activityIds: string[] = []) =>
    (
      await axios.get<ActivityPeopleResponse>(`${API_URL}/activities/${encodeURIComponent(id)}/people`, {
        ...config(),
        params: { activity_ids: activityIds.length ? activityIds.join(',') : undefined },
      })
    ).data.data,
  setPeople: async (id: string, person_ids: string[], activity_ids: string[] = []) =>
    (
      await axios.put<ActivityPeopleResponse>(
        `${API_URL}/activities/${encodeURIComponent(id)}/people`,
        { person_ids, activity_ids },
        config(),
      )
    ).data.data,
  timeWith: async (id: string, params: PersonTimeWithQuery) =>
    (
      await axios.get<PersonTimeWithResponse>(`${API_URL}/people/${encodeURIComponent(id)}/time-with`, {
        ...config(),
        params,
      })
    ).data.data,
}

import type {
  PeopleCalendarQuery,
  PeopleCalendarResponse,
  PeopleHelpTreeResponse,
  CreatePersonBody,
  UpdatePersonBody,
  PeopleEventBody,
  UpdatePeopleEventBody,
  PeopleFeedbackBody,
  PeopleGuidanceQuery,
  PersonResponse,
  PeopleResponse,
  PeopleDashboardResponse,
  PeopleEventsResponse,
  PeopleEventResponse,
  PeopleGuidanceResponse,
  PeopleSourcesResponse,
  PeopleOptionsResponse,
  PeopleMutationResponse,
} from '@aurboda/api-spec'

import axios from 'axios'

import { API_URL } from '../../config'
import { auth } from '../auth'

const config = (token = auth.value.token) => ({ headers: { Authorization: `Bearer ${token}` } })
const personUrl = (id: string) => `${API_URL}/people/${encodeURIComponent(id)}`
export function peopleData<T>(response: { success: boolean; data?: T; error?: string }): T {
  if (!response.success || response.data === undefined) {
    throw new Error(response.error ?? 'Could not load People data.')
  }
  return response.data
}
export const fetchPeople = async () =>
  peopleData((await axios.get<PeopleResponse>(`${API_URL}/people`, config())).data)
export const fetchPeopleOptions = async () =>
  peopleData((await axios.get<PeopleOptionsResponse>(`${API_URL}/people/options`, config())).data)
export const fetchPeopleSources = async () =>
  peopleData((await axios.get<PeopleSourcesResponse>(`${API_URL}/people/catalog/sources`, config())).data)
export const createPerson = async (body: CreatePersonBody) =>
  peopleData((await axios.post<PersonResponse>(`${API_URL}/people`, body, config())).data)
export const updatePerson = async (id: string, body: UpdatePersonBody) =>
  peopleData((await axios.patch<PersonResponse>(personUrl(id), body, config())).data)
export const deletePerson = async (id: string) => {
  peopleData((await axios.delete<PeopleMutationResponse>(personUrl(id), config())).data)
}
export const fetchPeopleDashboard = async (id: string) =>
  peopleData((await axios.get<PeopleDashboardResponse>(`${personUrl(id)}/dashboard`, config())).data)
export const fetchPeopleGuidance = async (id: string, params: PeopleGuidanceQuery = {}) =>
  peopleData(
    (await axios.get<PeopleGuidanceResponse>(`${personUrl(id)}/guidance`, { ...config(), params })).data,
  )
export const fetchPeopleEvents = async (id: string) =>
  peopleData((await axios.get<PeopleEventsResponse>(`${personUrl(id)}/events`, config())).data)
export const createPeopleEvent = async (id: string, body: PeopleEventBody) =>
  peopleData((await axios.post<PeopleEventResponse>(`${personUrl(id)}/events`, body, config())).data)
export const updatePeopleEvent = async (id: string, eventId: string, body: UpdatePeopleEventBody) =>
  peopleData(
    (
      await axios.patch<PeopleEventResponse>(
        `${personUrl(id)}/events/${encodeURIComponent(eventId)}`,
        body,
        config(),
      )
    ).data,
  )
export const deletePeopleEvent = async (id: string, eventId: string) => {
  peopleData(
    (
      await axios.delete<PeopleMutationResponse>(
        `${personUrl(id)}/events/${encodeURIComponent(eventId)}`,
        config(),
      )
    ).data,
  )
}
export const peopleGuidanceFeedback = async (id: string, guidanceId: string, body: PeopleFeedbackBody) => {
  peopleData(
    (
      await axios.post<PeopleMutationResponse>(
        `${personUrl(id)}/guidance/${encodeURIComponent(guidanceId)}/feedback`,
        body,
        config(),
      )
    ).data,
  )
}

export const fetchPeopleCalendar = async (params: PeopleCalendarQuery, token = auth.value.token) =>
  peopleData(
    (await axios.get<PeopleCalendarResponse>(`${API_URL}/people/calendar`, { ...config(token), params }))
      .data,
  )

export const fetchPeopleHelpTree = async (person_id?: string) =>
  peopleData(
    (
      await axios.get<PeopleHelpTreeResponse>(`${API_URL}/people/help-tree`, {
        ...config(),
        params: { person_id },
      })
    ).data,
  )

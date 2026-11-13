import type {
  AdministrationEvent,
  AdministrationResponse,
  AdministrationsResponse,
  Assessment,
  AssessmentResponse,
  AssessmentsResponse,
  ConfirmRegimenBody,
  ConfirmRegimenResponse,
  ContextEvent,
  ContextEventResponse,
  ContextEventsResponse,
  ContextEventType,
  ContextEventTypeResponse,
  ContextEventTypesResponse,
  CorrectAssessmentBody,
  CreateAdministrationBody,
  CreateContextEventBody,
  CreateContextEventTypeBody,
  CreateQuestionnaireBody,
  CreateRegimenBody,
  CreateSubstanceBody,
  CreateTreatmentSessionBody,
  CreateTreatmentTypeBody,
  InsightsQuery,
  InsightsResponse,
  PharmacologyListQuery,
  PharmacologyTimelineQuery,
  PharmacologyTimelineResponse,
  QuestionnaireResponse,
  QuestionnairesResponse,
  QuestionnaireTemplate,
  Regimen,
  RegimenResponse,
  RegimensResponse,
  SubmitAssessmentBody,
  Substance,
  SubstanceResponse,
  SubstancesResponse,
  PharmacologyTodayQuery,
  TodayResponse,
  TreatmentSession,
  TreatmentSessionResponse,
  TreatmentSessionsResponse,
  TreatmentType,
  TreatmentTypeResponse,
  TreatmentTypesResponse,
  UpdateAdministrationBody,
  UpdateContextEventBody,
  UpdateContextEventTypeBody,
  UpdateQuestionnaireBody,
  UpdateRegimenBody,
  UpdateSubstanceBody,
  UpdateTreatmentSessionBody,
  UpdateTreatmentTypeBody,
} from '@aurboda/api-spec'

import axios from 'axios'

import { API_URL } from '../../config'
import { apiErrorText } from '../../utils/profile'
import { auth } from '../auth'

const BASE = `${API_URL}/pharmacology`
const idPath = (id: string) => encodeURIComponent(id)
const options = () => ({ headers: { Authorization: `Bearer ${auth.value.token}` } })

const dataOrThrow = <T>(response: { data?: T; error?: unknown }, fallback: string): T => {
  if (response.data !== undefined) return response.data
  throw new Error(apiErrorText(response.error, fallback))
}

export const pharmacologyErrorMessage = (error: unknown, fallback = 'Something went wrong.'): string => {
  if (error instanceof Error && !axios.isAxiosError(error)) return error.message
  if (axios.isAxiosError<{ error?: unknown }>(error)) {
    return apiErrorText(error.response?.data?.error, error.message || fallback)
  }
  return fallback
}

export const fetchPharmacologyToday = async (
  params: PharmacologyTodayQuery,
): Promise<TodayResponse['data']> => {
  const response = await axios.get<TodayResponse>(`${BASE}/today`, { ...options(), params })
  return response.data.data
}

export const fetchSubstances = async (params?: PharmacologyListQuery): Promise<Substance[]> => {
  const response = await axios.get<SubstancesResponse>(`${BASE}/substances`, { ...options(), params })
  return response.data.data ?? []
}

export const createSubstance = async (body: CreateSubstanceBody): Promise<Substance> => {
  const response = await axios.post<SubstanceResponse>(`${BASE}/substances`, body, options())
  return dataOrThrow(response.data, 'Failed to create substance.')
}

export const updateSubstance = async (id: string, body: UpdateSubstanceBody): Promise<Substance> => {
  const response = await axios.patch<SubstanceResponse>(`${BASE}/substances/${idPath(id)}`, body, options())
  return dataOrThrow(response.data, 'Failed to update substance.')
}

export const archiveSubstance = async (id: string): Promise<void> => {
  await axios.delete(`${BASE}/substances/${idPath(id)}`, options())
}

export const fetchRegimens = async (params?: PharmacologyListQuery): Promise<Regimen[]> => {
  const response = await axios.get<RegimensResponse>(`${BASE}/regimens`, { ...options(), params })
  return response.data.data ?? []
}

export const createRegimen = async (body: CreateRegimenBody): Promise<Regimen> => {
  const response = await axios.post<RegimenResponse>(`${BASE}/regimens`, body, options())
  return dataOrThrow(response.data, 'Failed to create regimen.')
}

export const updateRegimen = async (id: string, body: UpdateRegimenBody): Promise<Regimen> => {
  const response = await axios.patch<RegimenResponse>(`${BASE}/regimens/${idPath(id)}`, body, options())
  return dataOrThrow(response.data, 'Failed to update regimen.')
}

export const archiveRegimen = async (id: string): Promise<void> => {
  await axios.delete(`${BASE}/regimens/${idPath(id)}`, options())
}

export const confirmRegimen = async (
  id: string,
  body: ConfirmRegimenBody,
): Promise<AdministrationEvent[]> => {
  const response = await axios.post<ConfirmRegimenResponse>(
    `${BASE}/regimens/${idPath(id)}/confirm`,
    body,
    options(),
  )
  return response.data.data ?? []
}

export const fetchAdministrations = async (
  params?: PharmacologyListQuery,
): Promise<AdministrationEvent[]> => {
  const response = await axios.get<AdministrationsResponse>(`${BASE}/administrations`, {
    ...options(),
    params,
  })
  return response.data.data ?? []
}

export const createAdministration = async (
  body: CreateAdministrationBody,
): Promise<AdministrationEvent> => {
  const response = await axios.post<AdministrationResponse>(`${BASE}/administrations`, body, options())
  return dataOrThrow(response.data, 'Failed to record administration.')
}

export const updateAdministration = async (
  id: string,
  body: UpdateAdministrationBody,
): Promise<AdministrationEvent> => {
  const response = await axios.patch<AdministrationResponse>(
    `${BASE}/administrations/${idPath(id)}`,
    body,
    options(),
  )
  return dataOrThrow(response.data, 'Failed to correct administration.')
}

export const voidAdministration = async (id: string): Promise<void> => {
  await axios.delete(`${BASE}/administrations/${idPath(id)}`, options())
}

export const fetchTreatmentTypes = async (): Promise<TreatmentType[]> => {
  const response = await axios.get<TreatmentTypesResponse>(`${BASE}/treatment-types`, options())
  return response.data.data ?? []
}

export const createTreatmentType = async (body: CreateTreatmentTypeBody): Promise<TreatmentType> => {
  const response = await axios.post<TreatmentTypeResponse>(`${BASE}/treatment-types`, body, options())
  return dataOrThrow(response.data, 'Failed to create treatment type.')
}

export const updateTreatmentType = async (
  id: string,
  body: UpdateTreatmentTypeBody,
): Promise<TreatmentType> => {
  const response = await axios.patch<TreatmentTypeResponse>(
    `${BASE}/treatment-types/${idPath(id)}`,
    body,
    options(),
  )
  return dataOrThrow(response.data, 'Failed to update treatment type.')
}

export const fetchTreatmentSessions = async (
  params?: PharmacologyListQuery,
): Promise<TreatmentSession[]> => {
  const response = await axios.get<TreatmentSessionsResponse>(`${BASE}/treatments`, {
    ...options(),
    params,
  })
  return response.data.data ?? []
}

export const createTreatmentSession = async (
  body: CreateTreatmentSessionBody,
): Promise<TreatmentSession> => {
  const response = await axios.post<TreatmentSessionResponse>(`${BASE}/treatments`, body, options())
  return dataOrThrow(response.data, 'Failed to create treatment session.')
}

export const updateTreatmentSession = async (
  id: string,
  body: UpdateTreatmentSessionBody,
): Promise<TreatmentSession> => {
  const response = await axios.patch<TreatmentSessionResponse>(
    `${BASE}/treatments/${idPath(id)}`,
    body,
    options(),
  )
  return dataOrThrow(response.data, 'Failed to update treatment session.')
}

export const archiveTreatmentSession = async (id: string): Promise<void> => {
  await axios.delete(`${BASE}/treatments/${idPath(id)}`, options())
}

export const fetchQuestionnaires = async (): Promise<QuestionnaireTemplate[]> => {
  const response = await axios.get<QuestionnairesResponse>(`${BASE}/questionnaires`, options())
  return response.data.data ?? []
}

export const createQuestionnaire = async (
  body: CreateQuestionnaireBody,
): Promise<QuestionnaireTemplate> => {
  const response = await axios.post<QuestionnaireResponse>(`${BASE}/questionnaires`, body, options())
  return dataOrThrow(response.data, 'Failed to create questionnaire.')
}

export const updateQuestionnaire = async (
  id: string,
  body: UpdateQuestionnaireBody,
): Promise<QuestionnaireTemplate> => {
  const response = await axios.patch<QuestionnaireResponse>(
    `${BASE}/questionnaires/${idPath(id)}`,
    body,
    options(),
  )
  return dataOrThrow(response.data, 'Failed to update questionnaire.')
}

export const fetchAssessments = async (params?: PharmacologyListQuery): Promise<Assessment[]> => {
  const response = await axios.get<AssessmentsResponse>(`${BASE}/assessments`, { ...options(), params })
  return response.data.data ?? []
}

export const submitAssessment = async (body: SubmitAssessmentBody): Promise<Assessment> => {
  const response = await axios.post<AssessmentResponse>(`${BASE}/assessments`, body, options())
  return dataOrThrow(response.data, 'Failed to save assessment.')
}

export const correctAssessment = async (
  id: string,
  body: CorrectAssessmentBody,
): Promise<Assessment> => {
  const response = await axios.patch<AssessmentResponse>(
    `${BASE}/assessments/${idPath(id)}`,
    body,
    options(),
  )
  return dataOrThrow(response.data, 'Failed to correct assessment.')
}

export const voidAssessment = async (id: string): Promise<void> => {
  await axios.delete(`${BASE}/assessments/${idPath(id)}`, options())
}

export const fetchContextTypes = async (): Promise<ContextEventType[]> => {
  const response = await axios.get<ContextEventTypesResponse>(`${BASE}/context-types`, options())
  return response.data.data ?? []
}

export const createContextType = async (
  body: CreateContextEventTypeBody,
): Promise<ContextEventType> => {
  const response = await axios.post<ContextEventTypeResponse>(`${BASE}/context-types`, body, options())
  return dataOrThrow(response.data, 'Failed to create context type.')
}

export const updateContextType = async (
  id: string,
  body: UpdateContextEventTypeBody,
): Promise<ContextEventType> => {
  const response = await axios.patch<ContextEventTypeResponse>(
    `${BASE}/context-types/${idPath(id)}`,
    body,
    options(),
  )
  return dataOrThrow(response.data, 'Failed to update context type.')
}

export const fetchContextEvents = async (params?: PharmacologyListQuery): Promise<ContextEvent[]> => {
  const response = await axios.get<ContextEventsResponse>(`${BASE}/context-events`, {
    ...options(),
    params,
  })
  return response.data.data ?? []
}

export const createContextEvent = async (body: CreateContextEventBody): Promise<ContextEvent> => {
  const response = await axios.post<ContextEventResponse>(`${BASE}/context-events`, body, options())
  return dataOrThrow(response.data, 'Failed to record context event.')
}

export const updateContextEvent = async (
  id: string,
  body: UpdateContextEventBody,
): Promise<ContextEvent> => {
  const response = await axios.patch<ContextEventResponse>(
    `${BASE}/context-events/${idPath(id)}`,
    body,
    options(),
  )
  return dataOrThrow(response.data, 'Failed to update context event.')
}

export const voidContextEvent = async (id: string): Promise<void> => {
  await axios.delete(`${BASE}/context-events/${idPath(id)}`, options())
}

export const fetchPharmacologyTimeline = async (
  params: PharmacologyTimelineQuery,
): Promise<PharmacologyTimelineResponse['data']> => {
  const response = await axios.get<PharmacologyTimelineResponse>(`${BASE}/timeline`, {
    ...options(),
    params,
  })
  return response.data.data
}

export const fetchPharmacologyInsights = async (
  params: InsightsQuery,
): Promise<InsightsResponse['data']> => {
  const response = await axios.get<InsightsResponse>(`${BASE}/insights`, { ...options(), params })
  return response.data.data
}

export interface PharmacologyDownload {
  blob: Blob
  filename: string
}

const download = async (path: '/export' | '/export.csv', fallbackFilename: string) => {
  const response = await axios.get<Blob>(`${BASE}${path}`, {
    ...options(),
    responseType: 'blob',
  })
  const disposition = response.headers['content-disposition'] as string | undefined
  const filename = disposition?.match(/filename="?([^";]+)"?/i)?.[1] ?? fallbackFilename
  return { blob: response.data, filename }
}

export const downloadPharmacologyJson = (): Promise<PharmacologyDownload> =>
  download('/export', `aurboda-treatments-${new Date().toISOString().slice(0, 10)}.json`)

export const downloadPharmacologyCsv = (): Promise<PharmacologyDownload> =>
  download('/export.csv', `aurboda-treatments-${new Date().toISOString().slice(0, 10)}.csv`)

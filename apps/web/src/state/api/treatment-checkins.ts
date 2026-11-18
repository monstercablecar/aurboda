import type {
  AddTreatmentReflection,
  TreatmentCheckin,
  TreatmentCheckinAction,
  TreatmentCheckinEntry,
  TreatmentCheckinResponse,
  TreatmentCheckinsResponse,
  TreatmentCheckinSettings,
} from '@aurboda/api-spec'

import axios from 'axios'

import { API_URL } from '../../config'
import { auth } from '../auth'

const base = `${API_URL}/treatment-checkins`
const options = () => ({ headers: { Authorization: `Bearer ${auth.value.token}` } })
const result = (body: TreatmentCheckinResponse): TreatmentCheckin => {
  if (!body.success || !body.data) throw new Error(body.error ?? 'Could not save the check-in.')
  return body.data
}
export const fetchTreatmentCheckins = async (id?: string) =>
  (await axios.get<TreatmentCheckinsResponse>(base, { ...options(), params: { treatment_session_id: id } }))
    .data
export const addTreatmentReflection = async (body: AddTreatmentReflection) =>
  result((await axios.post<TreatmentCheckinResponse>(base, body, options())).data)
export const saveTreatmentCheckin = async (id: string, body: TreatmentCheckinEntry, final: boolean) =>
  result(
    (
      await axios({
        url: `${base}/${encodeURIComponent(id)}/${final ? 'complete' : 'draft'}`,
        method: final ? 'POST' : 'PUT',
        data: body,
        ...options(),
      })
    ).data,
  )
export const actOnTreatmentCheckin = async (id: string, body: TreatmentCheckinAction) =>
  result(
    (await axios.post<TreatmentCheckinResponse>(`${base}/${encodeURIComponent(id)}/action`, body, options()))
      .data,
  )
export const changeTreatmentCheckinSettings = async (id: string, body: TreatmentCheckinSettings) => {
  await axios.patch(`${base}/plans/${encodeURIComponent(id)}`, body, options())
}

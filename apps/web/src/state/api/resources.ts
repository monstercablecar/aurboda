import type {
  ResourcesResponse,
  CreateResourceFolderBody,
  UpdateResourceFolderBody,
  CreateResourceLinkBody,
  UpdateResourceItemBody,
} from '@aurboda/api-spec'

import axios from 'axios'

import { API_URL } from '../../config'
import { apiErrorText } from '../../utils/profile'
import { auth } from '../auth'
const config = () => ({ headers: { Authorization: `Bearer ${auth.value.token}` } })
const base = `${API_URL}/resources`
export const fetchResources = async () => (await axios.get<ResourcesResponse>(base, config())).data
export const createResourceFolder = async (body: CreateResourceFolderBody) =>
  axios.post(`${base}/folders`, body, config())
export const updateResourceFolder = async (id: string, body: UpdateResourceFolderBody) =>
  axios.patch(`${base}/folders/${encodeURIComponent(id)}`, body, config())
export const createResourceLink = async (body: CreateResourceLinkBody) =>
  axios.post(`${base}/links`, body, config())
export const updateResource = async (id: string, body: UpdateResourceItemBody) =>
  axios.patch(`${base}/items/${encodeURIComponent(id)}`, body, config())
export const deleteResource = async (id: string, folder: boolean) =>
  axios.delete(
    `${base}/${folder ? 'folders' : 'items'}/${encodeURIComponent(id)}${folder ? '?recursive=true' : ''}`,
    config(),
  )
export const resourceContentUrl = (id: string, download = false) =>
  `${base}/items/${encodeURIComponent(id)}/content${download ? '?download=1' : ''}`
export const refreshResourceSession = async () =>
  axios.post(`${base}/session`, {}, { ...config(), withCredentials: true })
export const prepareResourceMedia = async (id: string) => {
  await refreshResourceSession()
  // HEAD catches missing storage and denied media cookies before mounting a native player.
  await axios.head(resourceContentUrl(id), { withCredentials: true })
}
export const uploadResource = async (
  file: File,
  parent_id: string | null,
  onProgress: (percent: number) => void,
) => {
  const body = new FormData()
  body.append('file', file)
  body.append('title', file.name)
  if (parent_id) body.append('parent_id', parent_id)
  await axios.post(`${base}/upload`, body, {
    ...config(),
    onUploadProgress: (event) => onProgress(event.total ? Math.round((event.loaded / event.total) * 100) : 0),
  })
}
export const resourceError = (error: unknown): string =>
  axios.isAxiosError(error)
    ? apiErrorText(error.response?.data?.error, error.message)
    : error instanceof Error
      ? error.message
      : 'Something went wrong. Please try again.'

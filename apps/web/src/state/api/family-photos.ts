import type {
  FamilyAccess,
  FamilyAccessResponse,
  FamilyEdit,
  FamilyFoldersResponse,
  FamilyFolderResponse,
  FamilyMove,
  FamilyItemsResponse,
  FamilyMembersResponse,
  FamilyQuery,
} from '@aurboda/api-spec'

import { useQuery } from '@tanstack/react-query'
import axios from 'axios'

import { API_URL } from '../../config'
import { auth } from '../auth'
import { familyIdentity, familySessionBarrier } from '../familyIdentity'
import { currentSessionGeneration } from '../sessionBoundary'

const base = `${API_URL}/family-photos`
const config = () => ({ headers: { Authorization: `Bearer ${auth.value.token}` }, withCredentials: true })
export const useFamilyAccess = () =>
  useQuery({
    queryKey: ['familyAccess'],
    enabled: !!auth.value.token,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchInterval: 15_000,
    queryFn: async (): Promise<FamilyAccess> => {
      try {
        return (await axios.get<FamilyAccessResponse>(`${base}/access`, config())).data.data
      } catch {
        return {
          enabled: false,
          allowed: false,
          is_admin: false,
          originals_enabled: false,
          max_upload_bytes: 0,
        }
      }
    },
  })
export const fetchFamily = async (query: FamilyQuery) =>
  (await axios.get<FamilyItemsResponse>(base, { ...config(), params: query })).data
export const refreshFamilySession = async () => {
  const generation = currentSessionGeneration()
  await familySessionBarrier()
  const binding = familyIdentity()
  await axios.post(
    `${base}/session`,
    {},
    { ...config(), headers: { ...config().headers, 'X-Family-Identity': binding } },
  )
  if (generation !== currentSessionGeneration() || binding !== familyIdentity()) {
    throw new Error('Session changed')
  }
}
export const familyMediaUrl = (id: string, variant: 'thumb' | 'preview' | 'download') =>
  `${base}/media/${encodeURIComponent(id)}/${variant}`
export const familyMembers = async () =>
  (await axios.get<FamilyMembersResponse>(`${base}/members`, config())).data.members
export const setFamilyMember = (user: string, family_member: boolean) =>
  axios.patch(`${base}/members/${encodeURIComponent(user)}`, { family_member }, config())
export const editFamily = (id: string, value: FamilyEdit) =>
  axios.patch(`${base}/items/${id}`, value, config())
export const trashFamily = (id: string) => axios.delete(`${base}/items/${id}`, config())
export const restoreFamily = (id: string) => axios.post(`${base}/items/${id}/restore`, {}, config())
export const retryFamily = (id: string) => axios.post(`${base}/items/${id}/retry`, {}, config())
export const downloadFamilyOriginal = async (id: string, filename: string) => {
  const response = await axios.get<Blob>(`${base}/media/${id}/original`, {
    ...config(),
    responseType: 'blob',
  })
  const url = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
export const uploadFamily = async (
  file: File,
  caption: string,
  progress: (percent: number) => void,
  folderId?: string,
) => {
  const body = new FormData()
  body.append('caption', caption)
  if (folderId) body.append('album_id', folderId)
  body.append('file', file)
  await axios.post(`${base}/upload`, body, {
    ...config(),
    onUploadProgress: (e) => progress(e.total ? Math.round((e.loaded / e.total) * 100) : 0),
  })
}
export const familyError = (error: unknown) =>
  axios.isAxiosError(error) && typeof error.response?.data?.error === 'string'
    ? (error.response.data.error as string)
    : 'Family Photos could not complete this request. Please retry.'

export const fetchFamilyFolders = async () =>
  (await axios.get<FamilyFoldersResponse>(`${base}/folders`, config())).data.folders
export const createFamilyFolder = async (name: string) =>
  (await axios.post<FamilyFolderResponse>(`${base}/folders`, { name }, config())).data.folder
export const renameFamilyFolder = (id: string, name: string) =>
  axios.patch(`${base}/folders/${id}`, { name }, config())
export const removeFamilyFolder = (id: string) => axios.delete(`${base}/folders/${id}`, config())
export const moveFamily = (move: FamilyMove) => axios.patch(`${base}/items/folder`, move, config())

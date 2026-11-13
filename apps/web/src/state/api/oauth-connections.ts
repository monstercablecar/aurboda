import type { BaseResponse, OAuthConnectionsResponse, RevokeOAuthConnectionBody } from '@aurboda/api-spec'

import axios from 'axios'

import { API_URL } from '../../config'
import { auth } from '../auth'

export const fetchOAuthConnections = async (signal?: AbortSignal): Promise<OAuthConnectionsResponse> => {
  const { token } = auth.value
  const response = await axios.get<OAuthConnectionsResponse>(`${API_URL}/oauth/connections`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })
  return response.data
}

export const revokeOAuthConnection = async (body: RevokeOAuthConnectionBody): Promise<BaseResponse> => {
  const { token } = auth.value
  const response = await axios.post<BaseResponse>(`${API_URL}/oauth/connections/revoke`, body, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return response.data
}

import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios'

import { CanceledError } from 'axios'

let generation = 0
export const currentSessionGeneration = () => generation
export const advanceSessionGeneration = () => ++generation

/** Fence awaited API continuations, including query functions that write persistent caches. */
export function installSessionResponseFence(client: AxiosInstance) {
  const requests = new WeakMap<InternalAxiosRequestConfig, number>()
  const requestId = client.interceptors.request.use(
    (config) => {
      requests.set(config, generation)
      return config
    },
    undefined,
    { synchronous: true },
  )
  const isStale = (config?: InternalAxiosRequestConfig) =>
    config && requests.has(config) && requests.get(config) !== generation
  const responseId = client.interceptors.response.use(
    (response) => {
      if (isStale(response.config)) throw new CanceledError('Session changed')
      return response
    },
    (error: unknown) => {
      const config = (error as { config?: InternalAxiosRequestConfig })?.config
      return Promise.reject(isStale(config) ? new CanceledError('Session changed') : error)
    },
  )
  return () => {
    client.interceptors.request.eject(requestId)
    client.interceptors.response.eject(responseId)
  }
}

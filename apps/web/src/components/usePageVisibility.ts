import { useQuery } from '@tanstack/react-query'

import { fetchUserSettings } from '../state/api'
import { auth } from '../state/auth'
import { isPageVisible } from './feature-control'

export function usePageVisibility() {
  const { data } = useQuery({
    queryKey: ['userSettings'],
    queryFn: fetchUserSettings,
    enabled: Boolean(auth.value.token),
  })
  return (path: string) => isPageVisible(path, data?.hidden_pages)
}

import { useQuery } from '@tanstack/react-query'

import { fetchUserSettings } from '../state/api'
import { useFamilyAccess } from '../state/api/family-photos'
import { auth } from '../state/auth'
import { isPageVisible } from './feature-control'

export function usePageVisibility() {
  const { data: family } = useFamilyAccess()
  const { data } = useQuery({
    queryKey: ['userSettings'],
    queryFn: fetchUserSettings,
    enabled: Boolean(auth.value.token),
  })
  return (path: string) =>
    (path.split(/[?#]/)[0] !== '/family-photos' || family?.allowed === true) &&
    isPageVisible(path, data?.hidden_pages)
}

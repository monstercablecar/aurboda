import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'preact/hooks'

import { familyError, familyMembers, setFamilyMember, useFamilyAccess } from '../state/api/family-photos'

export function FamilyMembership({ username }: { username: string }) {
  const { data: access } = useFamilyAccess()
  const query = useQuery({
    queryKey: ['familyMembers'],
    queryFn: familyMembers,
    enabled: access?.is_admin === true,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!access?.enabled || !access.is_admin) return null
  const member = query.data?.find((x) => x.username === username)
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <label>
        <input
          type="checkbox"
          checked={member?.family_member ?? false}
          disabled={!member || busy}
          onChange={async (e) => {
            setBusy(true)
            setError('')
            try {
              await setFamilyMember(username, e.currentTarget.checked)
              await queryClient.invalidateQueries({ queryKey: ['familyMembers'] })
              await queryClient.invalidateQueries({ queryKey: ['familyAccess'] })
            } catch (err) {
              setError(familyError(err))
            } finally {
              setBusy(false)
            }
          }}
        />{' '}
        Family Member
      </label>
      {(error || query.error) && <small role="alert">{error || 'Unable to load family membership'}</small>}
    </span>
  )
}

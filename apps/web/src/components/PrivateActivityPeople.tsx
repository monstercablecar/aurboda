import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useState } from 'preact/hooks'

import { PersonForm } from '../pages/People/PersonForm'
import { createPerson, fetchPeopleOptions } from '../state/api/people'
import { privateLinks } from '../state/api/private-links'

export function PrivateActivityPeople({
  activityId,
  activityIds = [],
}: {
  activityId: string
  activityIds?: string[]
}) {
  const client = useQueryClient(),
    [adding, setAdding] = useState(false)
  const linked = useQuery({
    queryKey: ['activity-private-people', activityId, [...activityIds].sort().join(',')],
    queryFn: () => privateLinks.people(activityId, activityIds),
  })
  const targets = useQuery({ queryKey: ['private-link-targets'], queryFn: () => privateLinks.targets() })
  const options = useQuery({ queryKey: ['people-options'], queryFn: fetchPeopleOptions, enabled: adding })
  const save = useMutation({
    mutationFn: (ids: string[]) => privateLinks.setPeople(activityId, ids, activityIds),
    onSuccess: () => client.invalidateQueries({ queryKey: ['activity-private-people', activityId] }),
  })
  const create = useMutation({
    mutationFn: createPerson,
    onSuccess: async (person) => {
      await save.mutateAsync([...(linked.data ?? []).map((p) => p.id), person.id])
      await client.invalidateQueries({ queryKey: ['private-link-targets'] })
      setAdding(false)
    },
  })
  return (
    <section class="detail-section">
      <h2>With</h2>
      <p>Only visible in your private views.</p>
      {linked.isError && (
        <p role="alert">
          Could not load the people linked to this activity.{' '}
          <button onClick={() => void linked.refetch()}>Retry</button>
        </p>
      )}
      {save.isError && <p role="alert">Could not save the people. Try again.</p>}
      {linked.data?.map((p) => (
        <span key={p.id}>
          <a href={`/people?person=${p.id}`}>{p.name}</a>{' '}
          <button
            disabled={save.isPending}
            onClick={() => save.mutate(linked.data!.filter((v) => v.id !== p.id).map((v) => v.id))}
          >
            Remove
          </button>{' '}
        </span>
      ))}
      <label>
        Add person{' '}
        <select
          disabled={save.isPending || !linked.data}
          value=""
          onChange={(e) => {
            if (e.currentTarget.value) save.mutate([...linked.data!.map((p) => p.id), e.currentTarget.value])
          }}
        >
          <option value="">Choose a person</option>
          {targets.data
            ?.filter((p) => p.kind === 'person' && !linked.data?.some((l) => l.id === p.id))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </label>
      <button onClick={() => setAdding(!adding)}>Create person here</button>
      {adding && options.data && (
        <PersonForm
          options={options.data}
          saving={create.isPending}
          error={create.error}
          onSave={(body) => create.mutate(body)}
          onCancel={() => setAdding(false)}
        />
      )}
      <p>
        <a href={`/journal?new=1&source_kind=activity&source_id=${activityId}`}>
          Write a Journal entry about this activity
        </a>{' '}
        · <a href={`/journal?related_kind=activity&related_id=${activityId}`}>Related Journal entries</a>
      </p>
    </section>
  )
}

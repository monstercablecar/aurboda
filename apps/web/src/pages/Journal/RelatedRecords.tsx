import type { CreateJournalEntryBody } from '@aurboda/api-spec'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'preact/hooks'

import { createPerson, fetchPeopleOptions } from '../../state/api/people'
import { privateLinks } from '../../state/api/private-links'
import { PersonForm } from '../People/PersonForm'
export function RelatedRecords({
  links,
  onChange,
}: {
  links: CreateJournalEntryBody['links']
  onChange: (links: CreateJournalEntryBody['links']) => void
}) {
  const [search, setSearch] = useState(''),
    [adding, setAdding] = useState(false),
    client = useQueryClient()
  const targets = useQuery({
    queryKey: ['private-link-targets', search],
    queryFn: () => privateLinks.targets(search),
  })
  const options = useQuery({ queryKey: ['people-options'], queryFn: fetchPeopleOptions, enabled: adding })
  const create = useMutation({
    mutationFn: createPerson,
    onSuccess: async (person) => {
      onChange([...links, { kind: 'person', record_id: person.id, label: '' }])
      setAdding(false)
      await client.invalidateQueries({ queryKey: ['private-link-targets'] })
    },
  })
  return (
    <details>
      <summary>Related people & activities</summary>
      <label>
        Find a record <input value={search} onInput={(e) => setSearch(e.currentTarget.value)} />
      </label>
      {targets.isError && (
        <p role="alert">
          Could not load your records. <button onClick={() => void targets.refetch()}>Retry</button>
        </p>
      )}
      <select
        aria-label="Link a person or activity"
        value=""
        onChange={(e) => {
          const target = targets.data?.find((t) => `${t.kind}:${t.id}` === e.currentTarget.value)
          if (target && !links.some((l) => l.kind === target.kind && l.record_id === target.id)) {
            onChange([...links, { kind: target.kind, record_id: target.id, label: '' }])
          }
        }}
      >
        <option value="">Choose a person or activity</option>
        {targets.data?.map((t) => (
          <option key={`${t.kind}:${t.id}`} value={`${t.kind}:${t.id}`}>
            {t.kind === 'person' ? 'Person' : 'Activity'}: {t.name}
          </option>
        ))}
      </select>
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
      <ul>
        {links.map((link, i) => (
          <li key={`${link.kind}:${link.record_id}`}>
            <a
              href={
                link.kind === 'person'
                  ? `/people?person=${encodeURIComponent(link.record_id)}`
                  : link.kind === 'activity'
                    ? `/detail/activity/${encodeURIComponent(link.record_id)}`
                    : link.kind === 'entry'
                      ? `/journal?entry=${encodeURIComponent(link.record_id)}`
                      : undefined
              }
            >
              {targets.data?.find((t) => t.kind === link.kind && t.id === link.record_id)?.name ||
                link.label ||
                `Related ${link.kind}`}
            </a>{' '}
            <button onClick={() => onChange(links.filter((_, j) => i !== j))}>Remove link</button>
          </li>
        ))}
      </ul>
    </details>
  )
}

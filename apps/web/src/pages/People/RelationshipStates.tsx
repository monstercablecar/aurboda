import type { PeopleOptions, Person } from '@aurboda/api-spec'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'preact/hooks'

import { updatePerson } from '../../state/api/people'
import { ErrorMessage } from './ui'

export function RelationshipStates({
  person,
  options,
  queryRoot,
}: {
  person: Person
  options: PeopleOptions
  queryRoot: readonly (string | undefined)[]
}) {
  const client = useQueryClient()
  const summary = useRef<HTMLElement>(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(person.statuses)
  const [version, setVersion] = useState(person.updated_at)
  const choices = options.statuses.filter(
    (option) => !option.relationship_types?.length || option.relationship_types.includes(person.relationship),
  )
  const unavailable = draft.filter((value) => !choices.some((option) => option.value === value))
  const label = (value: string) => options.statuses.find((option) => option.value === value)?.label ?? value
  const close = () => {
    setOpen(false)
    summary.current?.focus()
  }
  const save = useMutation({
    mutationFn: () => updatePerson(person.id, { statuses: draft, expected_updated_at: version }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryRoot })
      close()
    },
  })
  const reset = () => {
    setDraft([...person.statuses])
    setVersion(person.updated_at)
    save.reset()
  }

  return (
    <details class="people-panel people-relationship-states" open={open}>
      <summary
        ref={summary}
        aria-disabled={save.isPending}
        onClick={(event) => {
          event.preventDefault()
          if (save.isPending) return
          if (!open) reset()
          setOpen(!open)
        }}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span> Relationship states:{' '}
        {person.statuses.length ? person.statuses.map(label).join(', ') : 'None selected'}
      </summary>
      {open && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!save.isPending) save.mutate()
          }}
        >
          <p class="people-muted">
            Changes are recorded in History when applied. Existing state start dates remain unknown until
            tracked.
          </p>
          <fieldset class="people-choices" disabled={save.isPending}>
            <legend>Select relationship states</legend>
            <div class="people-relationship-state-options">
              {choices.map((option) => (
                <label key={option.value}>
                  <input
                    type="checkbox"
                    checked={draft.includes(option.value)}
                    onChange={(event) =>
                      setDraft(
                        event.currentTarget.checked
                          ? [...draft, option.value]
                          : draft.filter((value) => value !== option.value),
                      )
                    }
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
          {unavailable.length > 0 && (
            <p>Other saved states (kept unless you clear all): {unavailable.map(label).join(', ')}</p>
          )}
          <ErrorMessage error={save.error} />
          <div class="people-actions">
            <button type="button" disabled={save.isPending} onClick={() => setDraft([])}>
              Clear all
            </button>
            <button type="submit" class="people-primary" disabled={save.isPending}>
              {save.isPending ? 'Applying states…' : 'Apply states'}
            </button>
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => {
                reset()
                close()
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </details>
  )
}

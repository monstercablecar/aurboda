import type { CreatePersonBody, PeopleOptions, Person } from '@aurboda/api-spec'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'preact-iso'
import { useRef, useState } from 'preact/hooks'

import {
  createPerson,
  deletePerson,
  fetchPeople,
  fetchPeopleDashboard,
  fetchPeopleOptions,
  fetchPeopleSources,
  updatePerson,
} from '../../state/api/people'
import { auth } from '../../state/auth'
import { CareEthicsGuide } from './CareEthicsGuide'
import { PersonDashboard } from './Dashboard'
import { HelpTree } from './HelpTree'
import { PersonForm } from './PersonForm'
import { ErrorMessage, PeopleEmptyState } from './ui'
import './style.css'

function PersonCard({
  person,
  options,
  queryRoot,
  onSelect,
}: {
  person: Person
  options: PeopleOptions
  queryRoot: (string | undefined)[]
  onSelect: () => void
}) {
  const dashboard = useQuery({
    queryKey: [...queryRoot, person.id, 'dashboard'],
    queryFn: () => fetchPeopleDashboard(person.id),
  })
  return (
    <button class="people-person-card" onClick={onSelect}>
      {person.photo && <img class="people-photo" src={person.photo} alt="" />}
      <strong>{person.preferred_name || person.name}</strong>
      <span class="people-muted">
        {options.relationships.find((option) => option.value === person.relationship)?.label ??
          person.relationship}
        {dashboard.data && ` · ${dashboard.data.context.age_display}`}
      </span>
      {dashboard.data && <p>{dashboard.data.context.focus}</p>}
      {dashboard.isPending && <p>Loading focus…</p>}
      {dashboard.isError && <p>Open to retry loading this dashboard.</p>}
    </button>
  )
}

export function People() {
  return <PeopleForUser key={auth.value.user ?? auth.value.token ?? 'signed-out'} />
}

// eslint-disable-next-line complexity -- Page orchestration covers list, profile, editor, deletion, and request states.
function PeopleForUser() {
  const { query, route } = useLocation()
  const queryClient = useQueryClient()
  const queryRoot = ['people', auth.value.user ?? auth.value.token]
  const isLoggedIn = Boolean(auth.value.token)
  const [helpOpen, setHelpOpen] = useState(false)
  const helpButton = useRef<HTMLButtonElement>(null)
  const [ethicsOpen, setEthicsOpen] = useState(false)
  const ethicsButton = useRef<HTMLButtonElement>(null)
  const [editor, setEditor] = useState<'add' | 'edit' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const personId = query.person
  const selectPerson = (id?: string) => {
    const params = new URLSearchParams(query)
    if (id) params.set('person', id)
    else params.delete('person')
    route(`/people${params.size ? `?${params}` : ''}`)
    setEditor(null)
    setConfirmDelete(false)
  }
  const people = useQuery({ queryKey: [...queryRoot, 'list'], queryFn: fetchPeople, enabled: isLoggedIn })
  const options = useQuery({
    queryKey: [...queryRoot, 'options'],
    queryFn: fetchPeopleOptions,
    enabled: isLoggedIn,
    staleTime: 300_000,
  })
  const dashboard = useQuery({
    queryKey: [...queryRoot, personId, 'dashboard'],
    queryFn: () => fetchPeopleDashboard(personId),
    enabled: isLoggedIn && Boolean(personId),
  })
  const sources = useQuery({
    queryKey: [...queryRoot, 'sources'],
    queryFn: fetchPeopleSources,
    enabled: isLoggedIn && Boolean(personId),
    staleTime: 300_000,
  })
  const save = useMutation({
    mutationFn: (body: CreatePersonBody) =>
      editor === 'edit' && personId ? updatePerson(personId, body) : createPerson(body),
    onSuccess: async (person) => {
      await queryClient.invalidateQueries({ queryKey: queryRoot })
      await queryClient.invalidateQueries({ queryKey: ['people-calendar'] })
      selectPerson(person.id)
    },
  })
  const remove = useMutation({
    mutationFn: () => deletePerson(personId),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: [...queryRoot, personId] })
      selectPerson()
      await queryClient.invalidateQueries({ queryKey: [...queryRoot, 'list'] })
      await queryClient.invalidateQueries({ queryKey: ['people-calendar'] })
    },
  })
  const beginEditor = (mode: 'add' | 'edit') => {
    save.reset()
    remove.reset()
    setEditor(mode)
  }

  if (!isLoggedIn) {
    return (
      <div class="people-page">
        <h1>People</h1>
        <p>Please log in to manage your people.</p>
      </div>
    )
  }
  if (people.isPending || options.isPending) {
    return (
      <div class="people-page">
        <h1>People</h1>
        <p role="status">Loading people…</p>
      </div>
    )
  }
  if (people.isError || options.isError) {
    return (
      <div class="people-page">
        <h1>People</h1>
        <ErrorMessage error={people.error ?? options.error} />
        <button
          onClick={() => {
            void people.refetch()
            void options.refetch()
          }}
        >
          Try again
        </button>
      </div>
    )
  }
  return (
    <div class="people-page">
      {helpOpen && (
        <HelpTree
          personId={personId}
          options={options.data}
          queryRoot={queryRoot}
          onClose={() => {
            setHelpOpen(false)
            setTimeout(() => helpButton.current?.focus(), 0)
          }}
        />
      )}
      {ethicsOpen && (
        <CareEthicsGuide
          personId={personId}
          onClose={() => {
            setEthicsOpen(false)
            setTimeout(() => ethicsButton.current?.focus(), 0)
          }}
        />
      )}
      <div hidden={helpOpen || ethicsOpen}>
        {(personId || editor) && (
          <p>
            <button onClick={() => selectPerson()}>← All people</button>
          </p>
        )}
        {confirmDelete && dashboard.data ? (
          <section
            class="people-panel"
            role="alertdialog"
            aria-labelledby="people-delete-title"
            aria-describedby="people-delete-description"
          >
            <h2 id="people-delete-title">Delete {dashboard.data.person.name}?</h2>
            <p id="people-delete-description">
              This permanently deletes this person's profile, events, notes, preferences, guidance feedback,
              and person-specific metric records. Other people and unrelated metrics are not deleted. This
              cannot be undone.
            </p>
            <ErrorMessage error={remove.error} />
            <div class="people-actions">
              <button class="people-danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
                {remove.isPending ? 'Deleting…' : 'Permanently delete person'}
              </button>
              <button autoFocus disabled={remove.isPending} onClick={() => setConfirmDelete(false)}>
                Keep person
              </button>
            </div>
          </section>
        ) : editor && (editor === 'add' || dashboard.data) ? (
          <PersonForm
            key={editor === 'add' ? 'new' : personId}
            person={editor === 'edit' ? dashboard.data?.person : undefined}
            options={options.data}
            saving={save.isPending}
            error={save.error}
            onSave={(body) => save.mutate(body)}
            onCancel={() => setEditor(null)}
            onDelete={editor === 'edit' ? () => setConfirmDelete(true) : undefined}
          />
        ) : personId ? (
          <>
            <a href={`/journal?new=1&source_kind=person&source_id=${encodeURIComponent(personId)}`}>
              Continue reflecting in Journal
            </a>
            <ErrorMessage error={dashboard.error} />
            {dashboard.isPending && <p role="status">Loading dashboard…</p>}
            {dashboard.isError && <button onClick={() => void dashboard.refetch()}>Try again</button>}
            <ErrorMessage error={sources.error} />
            {dashboard.data && (
              <PersonDashboard
                key={personId}
                dashboard={dashboard.data}
                options={options.data}
                sources={sources.data ?? dashboard.data.sources}
                queryRoot={queryRoot}
                onEdit={() => beginEditor('edit')}
              />
            )}
          </>
        ) : people.data.length === 0 ? (
          <PeopleEmptyState onAdd={() => beginEditor('add')} />
        ) : (
          <>
            <header class="people-heading">
              <h1>People</h1>
              <button class="people-primary" onClick={() => beginEditor('add')}>
                Add Person
              </button>
            </header>
            <div class="people-grid">
              {people.data.map((person) => (
                <PersonCard
                  key={person.id}
                  person={person}
                  options={options.data}
                  queryRoot={queryRoot}
                  onSelect={() => selectPerson(person.id)}
                />
              ))}
            </div>
          </>
        )}
        {!editor && !confirmDelete && (
          <div class="people-actions">
            <button ref={helpButton} onClick={() => setHelpOpen(true)}>
              View Help Tree
            </button>
            <button ref={ethicsButton} onClick={() => setEthicsOpen(true)}>
              Care Ethics Guide
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

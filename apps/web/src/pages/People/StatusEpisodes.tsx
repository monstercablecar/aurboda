import type { Person, PeopleOptions, PeopleDashboard } from '@aurboda/api-spec'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'preact/hooks'

import { fetchPeopleDashboard, updatePerson } from '../../state/api/people'
import { StatusEpisodeForm } from './StatusEpisodeForm'
import { ErrorMessage, Panel } from './ui'

type Episode = NonNullable<Person['status_episodes']>[number]
export function StatusEpisodes({
  dashboard,
  options,
  queryRoot,
}: {
  dashboard: PeopleDashboard
  options: PeopleOptions
  queryRoot: readonly (string | undefined)[]
}) {
  const [editing, setEditing] = useState<Partial<Episode> | null>(null)
  const baseline = useRef<Episode | undefined>(undefined)
  const client = useQueryClient()
  const episodes = dashboard.person.status_episodes ?? []
  const save = useMutation({
    mutationFn: async (episode: Episode) => {
      const fresh = await fetchPeopleDashboard(dashboard.person.id)
      const latest = fresh.person.status_episodes ?? []
      client.setQueryData([...queryRoot, dashboard.person.id, 'dashboard'], fresh)
      const original =
        baseline.current?.id === episode.id
          ? baseline.current
          : episodes.find((item) => item.id === episode.id)
      if (
        original &&
        JSON.stringify(original) !== JSON.stringify(latest.find((item) => item.id === episode.id))
      ) {
        throw new Error(
          'This circumstance changed. Close this editor and review the latest details before trying again.',
        )
      }
      return updatePerson(dashboard.person.id, {
        expected_updated_at: fresh.person.updated_at,
        status_episodes: [...latest.filter((item) => item.id !== episode.id), episode],
      })
    },
    onSuccess: async () => {
      setEditing(null)
      await client.invalidateQueries({ queryKey: queryRoot })
    },
  })
  const begin = (episode: Partial<Episode>) => {
    save.reset()
    baseline.current = episodes.find((item) => item.id === episode.id)
    setEditing(episode)
  }
  // eslint-disable-next-line complexity -- Episode rows present optional server context and explicit lifecycle actions.
  const row = (episode: Episode) => {
    const context = dashboard.status_contexts?.find((item) => item.episode_id === episode.id)
    const label =
      options.status_definitions?.find((item) => item.kind === episode.kind)?.label ?? episode.kind
    return (
      <li key={episode.id}>
        <h3>{label}</h3>
        <p>
          {episode.lifecycle} · Started {episode.start_date}
        </p>
        {context?.phase && (
          <p>
            Phase:{' '}
            {options.status_definitions
              ?.find((item) => item.kind === episode.kind)
              ?.phases.find((phase) => phase.value === context.phase)?.label ?? context.phase}
          </p>
        )}
        {context?.gestational_weeks != null && (
          <p>Estimated gestational weeks: {context.gestational_weeks}</p>
        )}
        {episode.kind === 'pregnant' && context?.timing_basis && (
          <p class="people-muted">{context.timing_basis}</p>
        )}
        <details>
          <summary>Dates and circumstance history</summary>
          <p>Started: {episode.start_date}</p>
          {episode.estimated_end_date && <p>Estimated end: {episode.estimated_end_date}</p>}
          {episode.resolved_date && <p>Resolved: {episode.resolved_date}</p>}
          {episode.outcome && <p>Recorded outcome: {episode.outcome}</p>}
          <ul>
            {episode.transition_history?.map((entry, index) => (
              <li key={index}>
                {entry.date}: {entry.from} → {entry.to}
              </li>
            ))}
          </ul>
        </details>
        {episode.preferences && (
          <p class="people-preserve-lines">Support preferences: {episode.preferences}</p>
        )}
        <div class="people-actions">
          <button onClick={() => begin(episode)}>Edit circumstance</button>
          {episode.lifecycle === 'active' ? (
            <>
              <button onClick={() => begin({ ...episode, lifecycle: 'resolved' })}>Resolve</button>
              <button
                disabled={save.isPending}
                onClick={() => save.mutate({ ...episode, lifecycle: 'archived' })}
              >
                Archive
              </button>
            </>
          ) : (
            <button
              onClick={() =>
                begin({ ...episode, lifecycle: 'active', resolved_date: undefined, outcome: undefined })
              }
            >
              Reactivate
            </button>
          )}
          {episode.kind === 'pregnant' && episode.lifecycle !== 'active' && (
            <button onClick={() => begin({ kind: 'postpartum', previous_episode_id: episode.id })}>
              Add postpartum support
            </button>
          )}
        </div>
      </li>
    )
  }
  return (
    <Panel title="Current circumstances" id="people-circumstances">
      <p>
        Optional context for offering support. A selection is not a diagnosis. Record only what is appropriate
        to know.
      </p>
      <ErrorMessage error={save.error} />
      <ul class="people-history">{episodes.filter((item) => item.lifecycle === 'active').map(row)}</ul>
      <button onClick={() => begin({})}>Add circumstance</button>
      {episodes.some((item) => item.lifecycle !== 'active') && (
        <details>
          <summary>Past and archived circumstances</summary>
          <ul class="people-history">{episodes.filter((item) => item.lifecycle !== 'active').map(row)}</ul>
        </details>
      )}
      {editing && (
        <StatusEpisodeForm
          key={`${editing.id ?? 'new'}:${editing.lifecycle ?? 'active'}`}
          episode={editing}
          options={options}
          saving={save.isPending}
          onSave={(episode) => save.mutate(episode)}
          onCancel={() => setEditing(null)}
        />
      )}
    </Panel>
  )
}

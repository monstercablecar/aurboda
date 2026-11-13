import type { PeopleOptions, PeopleGuidance } from '@aurboda/api-spec'

import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'preact/hooks'

import { fetchPeopleHelpTree } from '../../state/api/people'
import { GuidanceCard } from './Guidance'
import { HelpTreeGraph, hasPositiveStatus } from './HelpTreeGraph'
import { ErrorMessage } from './ui'

export function RuleConditions({ guidance }: { guidance: PeopleGuidance }) {
  return (
    <details>
      <summary>Conditions and dependencies</summary>
      <p>
        Relationships: {guidance.relationship_types.join(', ')}. Age: {guidance.min_age}–{guidance.max_age}{' '}
        {guidance.age_unit}.
      </p>
      <p>
        Needs: {guidance.needs.join(', ') || 'No additional condition'}. Gender conditions:{' '}
        {guidance.genders?.join(', ') || 'None'}.
      </p>
      <p>
        Existing status conditions: {guidance.statuses.join(', ') || 'None'}. Interests:{' '}
        {guidance.interests.join(', ') || 'None'}. Personal goal context:{' '}
        {guidance.goals.join(', ') || 'None'}.
      </p>
      <p>
        Priority: {guidance.priority}. {guidance.recurring ? 'Recurring reference' : 'One-time suggestion'}.
        Review interval: {guidance.review_interval} days.{' '}
        {guidance.active ? 'Active catalog record' : 'Inactive catalog record'}.
      </p>
      {guidance.checklist_age_months != null && (
        <p>Developmental checklist context: {guidance.checklist_age_months} months.</p>
      )}
      {guidance.optional_metrics.length > 0 && (
        <p>
          Optional tracking references:{' '}
          {guidance.optional_metrics.map((id, index) => (
            <span key={id}>
              {index > 0 && ', '}
              <a
                href={`#help-metric-${encodeURIComponent(id)}`}
                onClick={() => document.getElementById('help-associated-metrics')?.setAttribute('open', '')}
              >
                {id.replaceAll('_', ' ')}
              </a>
            </span>
          ))}
        </p>
      )}
      {guidance.status_conditions && (
        <dl>
          {Object.entries(guidance.status_conditions).map(([key, value]) => (
            <div key={key}>
              <dt>
                {
                  (
                    {
                      all: 'All statuses required',
                      any: 'Any of these statuses',
                      exclude: 'Excluded statuses',
                      episode: 'Conditions on the same episode',
                    } as Record<string, string>
                  )[key]
                }
              </dt>
              <dd>
                {Array.isArray(value)
                  ? value.join(', ')
                  : Object.entries(value)
                      .map(
                        ([field, item]) =>
                          `${field.replaceAll('_', ' ')}: ${Array.isArray(item) ? item.join(', ') : item}`,
                      )
                      .join('; ')}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {guidance.log_condition && (
        <p>
          Shared support observation condition:{' '}
          {Object.entries(guidance.log_condition)
            .map(([key, value]) => `${key.replaceAll('_', ' ')}: ${value}`)
            .join('; ')}
        </p>
      )}
      {guidance.dedupe_key && <p>Related recommendation group: {guidance.dedupe_key}</p>}
    </details>
  )
}

// eslint-disable-next-line complexity -- Catalog panels and optional server evaluation states are independent presentation branches.
export function HelpTree({
  personId,
  options,
  queryRoot,
  onClose,
}: {
  personId?: string
  options: PeopleOptions
  queryRoot: readonly (string | undefined)[]
  onClose: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [])
  const tree = useQuery({
    queryKey: [...queryRoot, 'help-tree', personId],
    queryFn: () => fetchPeopleHelpTree(personId),
  })
  const [view, setView] = useState<'graph' | 'list'>('graph')
  const [search, setSearch] = useState('')
  const [relationship, setRelationship] = useState('')
  const [status, setStatus] = useState('')
  const [phase, setPhase] = useState('')
  const [topic, setTopic] = useState('')
  const [need, setNeed] = useState('')
  const [gender, setGender] = useState('')
  const [ageRange, setAgeRange] = useState('')
  const [applicable, setApplicable] = useState(false)
  const [limit, setLimit] = useState(20)
  const definition = tree.data?.status_definitions.find((item) => item.kind === status)
  const choices = (values: string[]) => [...new Set(values)].sort()
  const ageKey = (item: PeopleGuidance) => `${item.min_age}–${item.max_age} ${item.age_unit}`
  const records =
    // eslint-disable-next-line complexity -- Independent catalog browsing filters do not compute personal applicability.
    tree.data?.guidance.filter((item) => {
      const conditions = item.status_conditions
      const statuses = [
        ...item.statuses,
        ...(conditions?.all ?? []),
        ...(conditions?.any ?? []),
        ...(conditions?.episode ? [conditions.episode.kind] : []),
      ]
      return (
        (!search ||
          `${item.title} ${item.summary} ${item.practical_actions.join(' ')} ${item.domains.join(' ')} ${item.evidence_ids
            .map((id) => {
              const source = tree.data?.sources.find((entry) => entry.id === id)
              return source ? `${source.title} ${source.publisher}` : id
            })
            .join(' ')}`
            .toLowerCase()
            .includes(search.toLowerCase())) &&
        (!relationship || item.relationship_types.includes(relationship as never)) &&
        (!status || (status === '__none' ? !hasPositiveStatus(item) : statuses.includes(status))) &&
        (!phase || !conditions?.episode?.phases?.length || conditions.episode.phases.includes(phase)) &&
        (!topic || item.domains.includes(topic)) &&
        (!need || item.needs.includes(need)) &&
        (!gender || item.genders?.includes(gender as never)) &&
        (!ageRange || ageKey(item) === ageRange) &&
        (!applicable ||
          tree.data?.evaluations?.some(
            (evaluation) => evaluation.guidance_id === item.id && evaluation.applicable,
          ))
      )
    }) ?? []
  return (
    <section class="people-panel people-help-tree">
      <button onClick={onClose}>Back to {personId ? 'person' : 'people'}</button>
      <h1 tabIndex={-1} ref={heading}>
        Help Tree
      </h1>
      <p>
        Explore the actual guidance catalog and its conditions. Browsing a branch does not mean every
        recommendation applies to a person.
      </p>
      <ErrorMessage error={tree.error} />
      {tree.isPending && <p role="status">Loading help tree…</p>}
      {tree.isError && <button onClick={() => void tree.refetch()}>Try again</button>}
      {tree.data && (
        <>
          {tree.data.age_policy && (
            <details>
              <summary>How age and timing affect guidance</summary>
              <p>{tree.data.age_policy}</p>
            </details>
          )}
          <div class="people-actions" aria-label="Help Tree view">
            <button aria-pressed={view === 'graph'} onClick={() => setView('graph')}>
              Graph view
            </button>
            <button aria-pressed={view === 'list'} onClick={() => setView('list')}>
              List view
            </button>
            <button
              onClick={() => {
                setSearch('')
                setRelationship('')
                setStatus('')
                setPhase('')
                setTopic('')
                setNeed('')
                setGender('')
                setAgeRange('')
                setApplicable(false)
                setLimit(20)
              }}
            >
              Reset filters
            </button>
          </div>
          {status === '__none' && (
            <p>
              No temporary status means this record has no positive status requirement. Exclusions and other
              conditions still apply; this is a catalog filter, not a personal eligibility result.
            </p>
          )}
          <div class="people-filters">
            <label>
              Search guidance
              <input
                type="search"
                value={search}
                onInput={(e) => {
                  setSearch(e.currentTarget.value)
                  setLimit(20)
                }}
              />
            </label>
            <label>
              Relationship
              <select
                value={relationship}
                onChange={(e) => {
                  setRelationship(e.currentTarget.value)
                  setStatus('')
                  setPhase('')
                  setLimit(20)
                }}
              >
                <option value="">All relationships</option>
                {options.relationships.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Circumstance
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.currentTarget.value)
                  setPhase('')
                  setLimit(20)
                }}
              >
                <option value="">All circumstances</option>
                <option value="__none">No temporary status</option>
                <optgroup label="Relationship contexts">
                  {options.statuses
                    .filter(
                      (item) =>
                        !relationship ||
                        !item.relationship_types?.length ||
                        item.relationship_types.includes(relationship as never),
                    )
                    .map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                </optgroup>
                {tree.data.status_definitions.map((item) => (
                  <option key={item.kind} value={item.kind}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Phase
              <select value={phase} onChange={(e) => setPhase(e.currentTarget.value)}>
                <option value="">All phases</option>
                {definition?.phases.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <details>
            <summary>More filters</summary>
            <div class="people-filters">
              {[
                {
                  label: 'Topic',
                  value: topic,
                  set: setTopic,
                  values: choices(tree.data.guidance.flatMap((item) => item.domains)),
                },
                {
                  label: 'Need',
                  value: need,
                  set: setNeed,
                  values: choices(tree.data.guidance.flatMap((item) => item.needs)),
                },
                {
                  label: 'Gender condition',
                  value: gender,
                  set: setGender,
                  values: choices(tree.data.guidance.flatMap((item) => item.genders ?? [])),
                },
                {
                  label: 'Age range / developmental window',
                  value: ageRange,
                  set: setAgeRange,
                  values: choices(tree.data.guidance.map(ageKey)),
                },
              ].map((filter) => (
                <label key={filter.label}>
                  {filter.label}
                  <select
                    value={filter.value}
                    onChange={(e) => {
                      filter.set(e.currentTarget.value)
                      setLimit(20)
                    }}
                  >
                    <option value="">All</option>
                    {filter.values.map((value) => (
                      <option key={value} value={value}>
                        {value.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </details>
          {personId && (
            <label>
              <input
                type="checkbox"
                checked={applicable}
                onChange={(e) => setApplicable(e.currentTarget.checked)}
              />
              Only guidance the server currently matches to this person
            </label>
          )}
          <p>
            {options.relationships.find((item) => item.value === relationship)?.label ?? 'All relationships'}{' '}
            →{' '}
            {definition?.label ??
              options.statuses.find((item) => item.value === status)?.label ??
              (status === '__none' ? 'No temporary status' : 'All circumstances')}{' '}
            → {definition?.phases.find((item) => item.value === phase)?.label ?? 'All phases'}
          </p>
          {view === 'graph' && (
            <HelpTreeGraph
              key={[
                search,
                relationship,
                status,
                phase,
                topic,
                need,
                gender,
                ageRange,
                applicable,
                records.map((item) => item.id).join(','),
              ].join('|')}
              records={records}
              tree={tree.data}
              options={options}
              relationship={relationship}
              status={status}
              ageRange={ageRange}
              onRelationship={(value) => {
                setRelationship(value)
                setStatus('')
                setPhase('')
              }}
              onStatus={(value) => {
                setStatus(value)
                setPhase('')
              }}
              onAge={setAgeRange}
              renderGuidance={(item) => {
                const evaluation = tree.data?.evaluations?.find((entry) => entry.guidance_id === item.id)
                return (
                  <>
                    {evaluation && (
                      <>
                        <p>{evaluation.applicable ? 'Currently applicable' : 'Not currently applicable'}</p>
                        <ul>
                          {evaluation.reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    <RuleConditions guidance={item} />
                    <GuidanceCard guidance={item} sources={tree.data?.sources ?? []} />
                  </>
                )
              }}
            />
          )}
          {definition && (
            <details open>
              <summary>{definition.label}: phases and transitions</summary>
              <p>{definition.description}</p>
              <ul>
                {definition.phases.map((item) => (
                  <li key={item.value}>
                    <button onClick={() => setPhase(item.value)}>{item.label}</button>
                  </li>
                ))}
              </ul>
              <p>
                Possible explicitly chosen transitions:{' '}
                {definition.transition_kinds
                  .map(
                    (kind) => tree.data?.status_definitions.find((item) => item.kind === kind)?.label ?? kind,
                  )
                  .join(', ') || 'Resolve or archive when appropriate'}
                . No automatic transitions.
              </p>
            </details>
          )}
          <details id="help-associated-metrics">
            <summary>Associated metrics</summary>
            {choices(records.flatMap((item) => item.optional_metrics)).map((id) => (
              <section id={`help-metric-${encodeURIComponent(id)}`} key={id}>
                <h3>
                  {tree.data?.care_metric_definitions.find((item) => item.id === id)?.label ??
                    id.replaceAll('_', ' ')}
                </h3>
                <p>
                  Optional tracking referenced by this branch. Availability, units and current values are
                  determined on the person's dashboard.
                </p>
                <ul>
                  {records
                    .filter((item) => item.optional_metrics.includes(id))
                    .map((item) => (
                      <li key={item.id}>{item.title}</li>
                    ))}
                </ul>
              </section>
            ))}
            {tree.data.care_metric_definitions
              .filter((item) => !status || item.status_kinds.includes(status as never))
              .map((item) => (
                <section key={item.id}>
                  <h3>{item.label}</h3>
                  <p>{item.description}</p>
                  <p>
                    {item.value_kind} ·{' '}
                    {item.sensitive ? 'Requires agreement for sensitive tracking' : 'Optional tracking'} ·
                    Sources: {item.allowed_sources.join(', ')}
                  </p>
                </section>
              ))}
          </details>
          <details>
            <summary>Milestones and resources</summary>
            {tree.data.milestone_definitions
              .filter(
                (item) =>
                  (!status || item.status_kind === status) &&
                  (!phase || !item.phases?.length || item.phases.includes(phase)),
              )
              .map((item) => (
                <section key={item.id}>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <p>
                    {Object.entries(item)
                      .filter(([key]) => key.includes('days'))
                      .map(([key, value]) => `${key.replaceAll('_', ' ')}: ${value}`)
                      .join('; ')}
                  </p>
                  {item.evidence_ids.map((id) => {
                    const source = tree.data?.sources.find((entry) => entry.id === id)
                    return source ? (
                      <p key={id}>
                        <a href={source.url} target="_blank" rel="noopener noreferrer">
                          {source.publisher}: {source.title}
                        </a>
                      </p>
                    ) : (
                      <p key={id}>Source unavailable: {id}</p>
                    )
                  })}
                </section>
              ))}
          </details>
          <h2>{records.length} guidance records</h2>
          {records.length === 0 && <p>No matching guidance in this branch.</p>}
          {view === 'list' &&
            records.slice(0, limit).map((item) => {
              const evaluation = tree.data?.evaluations?.find((entry) => entry.guidance_id === item.id)
              return (
                <details key={item.id}>
                  <summary>{item.title}</summary>
                  {evaluation && (
                    <>
                      <p>{evaluation.applicable ? 'Currently applicable' : 'Not currently applicable'}</p>
                      <ul>
                        {evaluation.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  <RuleConditions guidance={item} />
                  <GuidanceCard guidance={item} sources={tree.data?.sources ?? []} />
                </details>
              )
            })}
          {view === 'list' && records.length > limit && (
            <button onClick={() => setLimit((value) => value + 20)}>Show more guidance</button>
          )}
        </>
      )}
    </section>
  )
}

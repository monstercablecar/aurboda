import type { PeopleGuidance, PeopleHelpTree, PeopleOptions } from '@aurboda/api-spec'
import type { ComponentChildren } from 'preact'

import { useRef, useState } from 'preact/hooks'

import './HelpTreeGraph.css'

type Node = {
  id: string
  label: string
  kind: string
  column: number
  row: number
  guide?: PeopleGuidance
  detail?: string
  url?: string
}
const width = 232
const stepX = 300
const stepY = 114
const x = (node: Node) => 30 + node.column * stepX
const y = (node: Node) => 54 + node.row * stepY
export const hasPositiveStatus = (item: PeopleGuidance) =>
  Boolean(
    item.status_conditions?.all?.length ||
    item.status_conditions?.any?.length ||
    item.status_conditions?.episode,
  )

// eslint-disable-next-line complexity -- Bounded graph construction follows independent optional catalog references and view states.
export function HelpTreeGraph({
  records,
  tree,
  options,
  relationship,
  status,
  ageRange,
  onRelationship,
  onStatus,
  onAge,
  renderGuidance,
}: {
  records: PeopleGuidance[]
  tree: PeopleHelpTree
  options: PeopleOptions
  relationship: string
  status: string
  ageRange: string
  onRelationship: (value: string) => void
  onStatus: (value: string) => void
  onAge: (value: string) => void
  renderGuidance: (item: PeopleGuidance) => ComponentChildren
}) {
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const [detail, setDetail] = useState<Node | null>(null)
  const inspector = useRef<HTMLHeadingElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const chosen = records.find((item) => item.id === selected) ?? records[0]
  const safePage = Math.min(page, Math.max(0, Math.ceil(records.length / 6) - 1))
  const visible = records.slice(safePage * 6, safePage * 6 + 6)
  const nodes: Node[] = []
  const edges: { from: string; to: string }[] = []
  const add = (node: Node) => {
    if (!nodes.some((item) => item.id === node.id)) nodes.push(node)
  }
  const sourceNode = (id: string, column: number, row: number) => {
    const source = tree.sources.find((item) => item.id === id)
    return {
      id: `source:${id}`,
      kind: 'source',
      column,
      row,
      label: source?.title ?? `Source ${id}`,
      detail: source
        ? `${source.publisher} · ${source.evidence_category.replaceAll('_', ' ')}. Source checked: ${source.last_verified}. ${source.limitations.join(' ')} Verification: ${source.verification_method === 'official_indexed_excerpt' ? 'Official indexed excerpt; full page not verified.' : source.verification_method === 'full_page' ? 'Full source page.' : 'Method not specified.'}`
        : 'Source metadata unavailable.',
      url: source?.url,
    }
  }
  if (focused && chosen) {
    add({ id: `guide:${chosen.id}`, label: chosen.title, kind: 'guidance', column: 1, row: 2, guide: chosen })
    const conditions = [
      ['Relationships', chosen.relationship_types.join(', ')],
      ['Authored age range', `${chosen.min_age} inclusive to ${chosen.max_age} exclusive ${chosen.age_unit}`],
      [
        'Circumstances',
        [
          ...chosen.statuses,
          ...(chosen.status_conditions?.all ?? []),
          ...(chosen.status_conditions?.any ?? []),
          ...(chosen.status_conditions?.episode ? [chosen.status_conditions.episode.kind] : []),
        ].join(', ') || 'No positive temporary-status requirement',
      ],
      [
        'Other conditions',
        `Needs: ${chosen.needs.join(', ') || 'none'}. Gender: ${chosen.genders?.join(', ') || 'none'}. Exclusions: ${chosen.status_conditions?.exclude?.join(', ') || 'none'}. See the full rule inspector for all/any and timing conditions.`,
      ],
    ]
    conditions.forEach(([label, text], row) => {
      const id = `condition:${row}`
      add({ id, label, detail: text, kind: 'condition', column: 0, row })
      edges.push({ from: id, to: `guide:${chosen.id}` })
    })
    const linked: Node[] = chosen.evidence_ids.map((id, row) => sourceNode(id, 2, row))
    chosen.optional_metrics.forEach((id) => {
      const metric = tree.care_metric_definitions.find((item) => item.id === id)
      linked.push({
        id: `metric:${id}`,
        label: metric?.label ?? id.replaceAll('_', ' '),
        detail:
          metric?.description ??
          'Optional tracking reference. Availability and units are determined on the person’s dashboard.',
        kind: 'metric',
        column: 2,
        row: linked.length,
      })
    })
    tree.milestone_definitions
      .filter((item) => item.evidence_ids.some((id) => chosen.evidence_ids.includes(id)))
      .slice(0, 2)
      .forEach((item) =>
        linked.push({
          id: `milestone:${item.id}`,
          label: item.title,
          detail: `Shares supporting evidence with this guidance; not a prerequisite. ${item.description}`,
          kind: 'milestone',
          column: 2,
          row: linked.length,
        }),
      )
    linked.slice(0, 8).forEach((node) => {
      add(node)
      edges.push({ from: `guide:${chosen.id}`, to: node.id })
    })
  } else {
    const topics = [...new Set(visible.flatMap((item) => item.domains))].slice(0, 4)
    topics.forEach((topic, row) =>
      add({
        id: `topic:${topic}`,
        label: topic.replaceAll('_', ' '),
        kind: 'topic',
        detail: 'Authored catalog topic. Lines connect records carrying this topic.',
        column: 0,
        row,
      }),
    )
    visible.forEach((guide, row) => {
      const id = `guide:${guide.id}`
      add({ id, label: guide.title, kind: 'guidance', column: 1, row, guide })
      topics
        .filter((topic) => guide.domains.includes(topic))
        .forEach((topic) => edges.push({ from: `topic:${topic}`, to: id }))
    })
    const sources = [...new Set(visible.flatMap((item) => item.evidence_ids))].slice(0, 6)
    sources.forEach((id, row) => add(sourceNode(id, 2, row)))
    visible.forEach((guide) =>
      guide.evidence_ids
        .filter((id) => sources.includes(id))
        .forEach((id) => edges.push({ from: `guide:${guide.id}`, to: `source:${id}` })),
    )
  }
  const height = Math.max(500, (Math.max(0, ...nodes.map((node) => node.row)) + 1) * stepY + 75)
  const unitOrder = { days: 0, months: 1, years: 2 }
  const ages = [
    ...new Set(
      [...tree.guidance]
        .sort(
          (a, b) =>
            unitOrder[a.age_unit] - unitOrder[b.age_unit] || a.min_age - b.min_age || a.max_age - b.max_age,
        )
        .map((item) => `${item.min_age}–${item.max_age} ${item.age_unit}`),
    ),
  ]
  const pick = (node: Node) => {
    if (node.guide) {
      setSelected(node.guide.id)
      setFocused(true)
      setDetail(null)
    } else setDetail(node)
    setTimeout(() => inspector.current?.focus({ preventScroll: true }), 0)
  }
  return (
    <div class="help-atlas">
      <div class="help-atlas-top">
        <span class="help-atlas-eyebrow">CARE ATLAS · LIVE CATALOG</span>
        <h2>Explore the connections</h2>
        <p>
          Topics → guidance → evidence. Arrows show metadata relationships, never required steps or
          achievements.
        </p>
      </div>
      <nav class="help-age-rail" aria-label="Authored age ranges">
        <button aria-pressed={!ageRange} onClick={() => onAge('')}>
          All ages
        </button>
        {ages.map((age) => (
          <button key={age} aria-pressed={ageRange === age} onClick={() => onAge(age)}>
            {age}
          </button>
        ))}
      </nav>
      <p class="help-atlas-note">
        Age ranges use inclusive minimums and exclusive maximums. These browse authored ranges; they do not
        calculate eligibility.
      </p>
      <div class="help-atlas-layout">
        <aside class="help-atlas-rails">
          <nav aria-label="Relationship branches">
            <h3>Relationships</h3>
            <button aria-pressed={!relationship} onClick={() => onRelationship('')}>
              All relationships
            </button>
            {options.relationships.map((item) => (
              <button
                key={item.value}
                aria-pressed={relationship === item.value}
                onClick={() => onRelationship(item.value)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <nav aria-label="Circumstance branches">
            <h3>Circumstances</h3>
            <button aria-pressed={!status} onClick={() => onStatus('')}>
              All circumstances
            </button>
            <button aria-pressed={status === '__none'} onClick={() => onStatus('__none')}>
              No temporary status
            </button>
            {options.statuses
              .filter(
                (item) =>
                  !relationship ||
                  !item.relationship_types?.length ||
                  item.relationship_types.includes(relationship as never),
              )
              .map((item) => (
                <button
                  type="button"
                  key={item.value}
                  aria-pressed={status === item.value}
                  onClick={() => onStatus(item.value)}
                >
                  {item.label}
                </button>
              ))}
            {tree.status_definitions.map((item) => (
              <button key={item.kind} aria-pressed={status === item.kind} onClick={() => onStatus(item.kind)}>
                {item.label}
              </button>
            ))}
          </nav>
        </aside>
        <div class="help-atlas-main">
          <div class="help-atlas-toolbar">
            <span>
              {focused
                ? 'Focused connections'
                : `${safePage * 6 + (records.length ? 1 : 0)}–${Math.min(records.length, safePage * 6 + 6)} of ${records.length} records`}
            </span>
            {focused && (
              <button
                onClick={() => {
                  setFocused(false)
                  setDetail(null)
                }}
              >
                Back to overview
              </button>
            )}
            <button onClick={() => viewport.current?.scrollTo({ left: 0, top: 0, behavior: 'auto' })}>
              Reset canvas position
            </button>
          </div>
          <div
            class="help-graph-scroll"
            ref={viewport}
            tabIndex={0}
            role="region"
            aria-label="Help Tree graph. Scroll horizontally to explore columns; Tab moves between nodes."
          >
            <div class="help-graph-surface" style={{ width: '900px', height: `${height}px` }}>
              <div class="help-column-label" style={{ left: '30px' }}>
                {focused ? 'CONDITIONS' : 'TOPICS'}
              </div>
              <div class="help-column-label" style={{ left: '330px' }}>
                GUIDANCE
              </div>
              <div class="help-column-label" style={{ left: '630px' }}>
                {focused ? 'CONNECTED REFERENCES' : 'EVIDENCE'}
              </div>
              <svg width="900" height={height} aria-hidden="true" class="help-graph-lines">
                <defs>
                  <marker
                    id="help-arrow"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#67e8f9" />
                  </marker>
                </defs>
                {edges.map((edge) => {
                  const from = nodes.find((item) => item.id === edge.from)
                  const to = nodes.find((item) => item.id === edge.to)
                  if (!from || !to) return null
                  const sx = x(from) + width
                  const sy = y(from) + 43
                  const tx = x(to) - 5
                  const ty = y(to) + 43
                  return (
                    <path
                      key={`${edge.from}:${edge.to}`}
                      d={`M ${sx} ${sy} C ${sx + 34} ${sy}, ${tx - 34} ${ty}, ${tx} ${ty}`}
                      fill="none"
                      stroke="#67e8f9"
                      strokeWidth="2"
                      markerEnd="url(#help-arrow)"
                    />
                  )
                })}
              </svg>
              {nodes.map((node) => (
                <button
                  key={node.id}
                  class={`help-graph-node help-node-${node.kind}`}
                  aria-label={`${node.kind}: ${node.label}`}
                  aria-pressed={node.guide ? chosen?.id === node.guide.id : detail?.id === node.id}
                  style={{ left: `${x(node)}px`, top: `${y(node)}px`, width: `${width}px` }}
                  onClick={() => pick(node)}
                >
                  <span>{node.kind}</span>
                  <strong>{node.label}</strong>
                </button>
              ))}
              {!nodes.length && (
                <p class="help-graph-empty">
                  No matching nodes. Change your filters or return to all branches.
                </p>
              )}
            </div>
          </div>
          {!focused && records.length > 6 && (
            <div class="help-atlas-toolbar">
              <button disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                Previous nodes
              </button>
              <button disabled={(safePage + 1) * 6 >= records.length} onClick={() => setPage(safePage + 1)}>
                Next nodes
              </button>
            </div>
          )}
          <p class="help-atlas-note">
            Showing a bounded set of connections. The inspector and List view retain the full record, source
            and rule details. On small screens, scroll the graph or use List view.
          </p>
        </div>
      </div>
      <section class="help-graph-inspector" aria-label="Selected node inspector">
        <h2 tabIndex={-1} ref={inspector}>
          {detail ? detail.label : (chosen?.title ?? 'Select a node')}
        </h2>
        {detail ? (
          <>
            <p>{detail.detail}</p>
            {detail.url && (
              <a href={detail.url} target="_blank" rel="noopener noreferrer">
                Open source
              </a>
            )}
            <button onClick={() => setDetail(null)}>Inspect selected guidance</button>
          </>
        ) : (
          chosen && renderGuidance(chosen)
        )}
      </section>
    </div>
  )
}

import type { TodayResponse } from '@aurboda/api-spec'

import { dueStateLabels, scheduleSummary } from './model'

type DueRegimen = TodayResponse['data']['due_regimens'][number]

export function RegimenCard({ due, onConfirm }: { due: DueRegimen; onConfirm: () => void }) {
  const { regimen, state } = due
  const availableItems = regimen.items.filter((item) => !item.paused)
  const times = [...new Set(availableItems.map((item) => item.scheduled_local_time).filter(Boolean))]
  return (
    <article class={`treatments-card regimen-card due-${state}`}>
      <div class="treatments-card-heading">
        <div>
          <div class="treatments-kicker">
            <span class={`due-badge due-${state}`}>{dueStateLabels[state]}</span>
            {times.length > 0 && <span>{times.join(' · ')}</span>}
          </div>
          <h3>{regimen.name}</h3>
          <p>{scheduleSummary(regimen.schedule)}</p>
        </div>
        <button
          class="btn-primary compact-button"
          type="button"
          onClick={onConfirm}
          disabled={state === 'confirmed' || availableItems.length === 0}
        >
          {state === 'confirmed' ? 'Confirmed' : state === 'partial' ? 'Finish' : 'Review'}
        </button>
      </div>
      <ul class="item-list">
        {availableItems.map((item) => (
          <li key={item.id}>
            <span>{item.substance.display_name}</span>
            <strong>
              {item.dose} {item.dose_unit}
            </strong>
          </li>
        ))}
      </ul>
      {due.incomplete_item_ids.length > 0 && state !== 'confirmed' && (
        <p class="card-note">{due.incomplete_item_ids.length} item(s) still need reconciliation.</p>
      )}
    </article>
  )
}

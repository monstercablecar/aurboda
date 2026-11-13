import type { PeopleOptions, Person } from '@aurboda/api-spec'

export const compactMet = (value: Person['met']): Person['met'] =>
  value && (value.place?.trim() || value.date || value.story?.trim()) ? value : null

type ImportantDate = NonNullable<Person['important_dates']>[number]

export function IdentityFields({
  value,
  options,
  onChange,
}: {
  value: Person['gender']
  options: PeopleOptions
  onChange: (value: Person['gender']) => void
}) {
  return (
    <details>
      <summary>Identity (optional)</summary>
      <div class="people-form">
        <p class="people-muted">
          Recording gender can surface relevant sourced resources. It does not imply anatomy, health needs,
          personality, or interests.
        </p>
        <label>
          Gender
          <select
            value={value?.identity ?? ''}
            onChange={(event) => {
              const identity = event.currentTarget.value as NonNullable<Person['gender']>['identity'] | ''
              onChange(identity ? { ...value, identity } : null)
            }}
          >
            <option value="">Not recorded / clear identity details</option>
            {(options.genders ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {value && (
          <>
            <label>
              Self-description
              <input
                maxLength={200}
                value={value.description ?? ''}
                onInput={(event) => onChange({ ...value, description: event.currentTarget.value })}
              />
            </label>
            <label>
              Pronouns
              <input
                maxLength={100}
                value={value.pronouns ?? ''}
                onInput={(event) => onChange({ ...value, pronouns: event.currentTarget.value })}
              />
            </label>
          </>
        )}
      </div>
    </details>
  )
}

export function MetFields({
  value,
  onChange,
}: {
  value: Person['met']
  onChange: (value: Person['met']) => void
}) {
  return (
    <details>
      <summary>How we met (optional)</summary>
      <div class="people-form">
        <label>
          Where we met
          <input
            maxLength={300}
            value={value?.place ?? ''}
            onInput={(event) => onChange({ ...value, place: event.currentTarget.value })}
          />
        </label>
        <label>
          When we met
          <input
            type="date"
            value={value?.date ?? ''}
            onInput={(event) => onChange({ ...value, date: event.currentTarget.value || undefined })}
          />
        </label>
        <label>
          Our story
          <textarea
            maxLength={10000}
            value={value?.story ?? ''}
            onInput={(event) => onChange({ ...value, story: event.currentTarget.value })}
          />
        </label>
        {value && (
          <button type="button" onClick={() => onChange(null)}>
            Clear how we met
          </button>
        )}
      </div>
    </details>
  )
}

export function ImportantDatesFields({
  dates,
  onChange,
  options,
}: {
  options: PeopleOptions
  dates: ImportantDate[]
  onChange: (dates: ImportantDate[]) => void
}) {
  const update = (id: string, fields: Partial<ImportantDate>) =>
    onChange(dates.map((date) => (date.id === id ? { ...date, ...fields } : date)))
  return (
    <details>
      <summary>Important dates (optional)</summary>
      <p class="people-muted">
        A recorded date of birth automatically supplies the birthday. If the birth year is unknown, add a
        yearly birthday here and leave the year blank. Dates do not create notifications automatically.
      </p>
      <div class="people-form">
        {dates.map((date, index) => (
          <fieldset class="people-date-row" key={date.id}>
            <legend>Important date {index + 1}</legend>
            <div class="people-form">
              <label>
                Label
                <input
                  required
                  maxLength={200}
                  value={date.label}
                  onInput={(event) => update(date.id, { label: event.currentTarget.value })}
                />
              </label>
              <label>
                Date kind (optional)
                <select
                  value={date.kind ?? ''}
                  onChange={(event) =>
                    update(date.id, {
                      kind: (event.currentTarget.value || undefined) as ImportantDate['kind'],
                    })
                  }
                >
                  <option value="">Not specified</option>
                  {(options.date_kinds ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div class="people-grid">
                <label>
                  Month
                  <input
                    required
                    type="number"
                    min="1"
                    max="12"
                    step="1"
                    value={date.month || ''}
                    onInput={(event) => update(date.id, { month: Number(event.currentTarget.value) })}
                  />
                </label>
                <label>
                  Day
                  <input
                    required
                    type="number"
                    min="1"
                    max="31"
                    step="1"
                    value={date.day || ''}
                    onInput={(event) => update(date.id, { day: Number(event.currentTarget.value) })}
                  />
                </label>
                <label>
                  {date.recurs_annually ? 'Year (optional)' : 'Year'}
                  <input
                    required={!date.recurs_annually}
                    type="number"
                    min="1"
                    max="9999"
                    step="1"
                    value={date.year ?? ''}
                    onInput={(event) =>
                      update(date.id, {
                        year: event.currentTarget.value ? Number(event.currentTarget.value) : undefined,
                      })
                    }
                  />
                </label>
              </div>
              <label class="people-inline-check">
                <input
                  type="checkbox"
                  checked={date.recurs_annually}
                  onChange={(event) => update(date.id, { recurs_annually: event.currentTarget.checked })}
                />
                Repeats every year
              </label>
              <label>
                Date notes
                <textarea
                  maxLength={2000}
                  value={date.notes ?? ''}
                  onInput={(event) => update(date.id, { notes: event.currentTarget.value })}
                />
              </label>
              <button type="button" onClick={() => onChange(dates.filter((item) => item.id !== date.id))}>
                Remove date
              </button>
            </div>
          </fieldset>
        ))}
        <button
          type="button"
          disabled={dates.length >= 50}
          onClick={() =>
            onChange([
              ...dates,
              { id: crypto.randomUUID(), label: '', month: 0, day: 0, recurs_annually: true },
            ])
          }
        >
          Add important date
        </button>
      </div>
    </details>
  )
}

import type { CreatePersonBody, PeopleOptions, Person } from '@aurboda/api-spec'

import { useState } from 'preact/hooks'

import { PhotoField } from './PhotoField'
import { compactMet, IdentityFields, ImportantDatesFields, MetFields } from './ProfileDetailsForm'
import { Choices, ErrorMessage, splitLines } from './ui'

const today = () => new Date().toLocaleDateString('en-CA')

// eslint-disable-next-line complexity -- Editable optional profile fields and age input modes create independent presentation branches.
export function PersonForm({
  person,
  options,
  saving,
  error,
  onSave,
  onCancel,
  onDelete,
}: {
  person?: Person
  options: PeopleOptions
  saving: boolean
  error: unknown
  onSave: (body: CreatePersonBody) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const [expectedUpdatedAt] = useState(person?.updated_at)
  const [photo, setPhoto] = useState(person?.photo ?? null)
  const [name, setName] = useState(person?.name ?? '')
  const [preferredName, setPreferredName] = useState(person?.preferred_name ?? '')
  const [relationship, setRelationship] = useState<Person['relationship'] | ''>(person?.relationship ?? '')
  const [ageMode, setAgeMode] = useState(person?.date_of_birth ? 'birthdate' : 'approximate')
  const [birthdate, setBirthdate] = useState(person?.date_of_birth ?? '')
  const [age, setAge] = useState(person?.approximate_age?.value.toString() ?? '')
  const [unit, setUnit] = useState<NonNullable<Person['approximate_age']>['unit']>(
    person?.approximate_age?.unit ?? 'years',
  )
  const [asOf, setAsOf] = useState(person?.approximate_age?.as_of ?? today())
  const [needs, setNeeds] = useState(person?.needs ?? [])
  const [statuses, setStatuses] = useState(person?.statuses ?? [])
  const [goals, setGoals] = useState(person?.goals.join('\n') ?? '')
  const [interests, setInterests] = useState(person?.interests.join('\n') ?? '')
  const [notes, setNotes] = useState(person?.notes ?? '')
  const [correctedWeeks, setCorrectedWeeks] = useState(person?.corrected_age_weeks ?? 0)
  const [gender, setGender] = useState<Person['gender']>(person?.gender ?? null)
  const [met, setMet] = useState<Person['met']>(person?.met ?? null)
  const [importantDates, setImportantDates] = useState(person?.important_dates ?? [])
  return (
    <section class="people-panel">
      <h1>{person ? 'Edit person' : 'Add Person'}</h1>
      <form
        class="people-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (!relationship || needs.length === 0) return
          onSave({
            name: name.trim(),
            photo,
            ...(expectedUpdatedAt ? { expected_updated_at: expectedUpdatedAt } : {}),
            preferred_name: preferredName.trim() || null,
            relationship,
            date_of_birth: ageMode === 'birthdate' ? birthdate : null,
            approximate_age: ageMode === 'approximate' ? { value: Number(age), unit, as_of: asOf } : null,
            corrected_age_weeks: correctedWeeks,
            gender,
            met: compactMet(met),
            important_dates: importantDates,
            needs,
            statuses: statuses.filter((value) => {
              const context = options.statuses.find((item) => item.value === value)
              return !context?.relationship_types?.length || context.relationship_types.includes(relationship)
            }),
            goals: splitLines(goals),
            interests: splitLines(interests),
            notes,
            enabled_metrics: person?.enabled_metrics ?? [],
            hidden_modules: person?.hidden_modules ?? [],
          })
        }}
      >
        <label>
          Name
          <input
            autoFocus
            required
            maxLength={200}
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
          />
        </label>
        <label>
          Relationship
          <select
            required
            value={relationship}
            onChange={(e) => {
              setRelationship(e.currentTarget.value as Person['relationship'])
              setNeeds([])
            }}
          >
            <option value="">Choose relationship</option>
            {options.relationships.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Age information
          <select value={ageMode} onChange={(e) => setAgeMode(e.currentTarget.value)}>
            <option value="approximate">Approximate age</option>
            <option value="birthdate">Date of birth</option>
          </select>
        </label>
        {ageMode === 'birthdate' ? (
          <label>
            Date of birth
            <input
              required
              type="date"
              value={birthdate}
              onInput={(e) => setBirthdate(e.currentTarget.value)}
            />
          </label>
        ) : (
          <div class="people-grid">
            <label>
              Age
              <input
                required
                min="0"
                step="1"
                type="number"
                value={age}
                onInput={(e) => setAge(e.currentTarget.value)}
              />
            </label>
            <label>
              Age unit
              <select value={unit} onChange={(e) => setUnit(e.currentTarget.value as typeof unit)}>
                {options.age_units.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Age as of
              <input required type="date" value={asOf} onInput={(e) => setAsOf(e.currentTarget.value)} />
            </label>
          </div>
        )}
        {relationship && (
          <Choices
            label="Needs / support context"
            required
            options={options.needs[relationship] ?? []}
            values={needs}
            onChange={setNeeds}
          />
        )}
        <details>
          <summary>Optional details</summary>
          <div class="people-form">
            <PhotoField value={photo} onChange={setPhoto} />
            <label>
              Preferred name
              <input
                maxLength={200}
                value={preferredName}
                onInput={(e) => setPreferredName(e.currentTarget.value)}
              />
            </label>
            <Choices
              label="Relationship status / circumstances"
              options={options.statuses.filter(
                (item) =>
                  !item.relationship_types?.length ||
                  item.relationship_types.some((value) => value === relationship),
              )}
              values={statuses}
              onChange={setStatuses}
            />
            <p class="people-hint">
              These optional contexts describe what you choose to share, not another person’s feelings. Leave
              them unchecked for no selected context. If there is fear or coercion, prioritize individual
              safety support.
            </p>
            <label>
              Personal goals (one per line)
              <textarea value={goals} onInput={(e) => setGoals(e.currentTarget.value)} />
            </label>
            <label>
              Interests (one per line)
              <textarea value={interests} onInput={(e) => setInterests(e.currentTarget.value)} />
            </label>
            <label>
              Notes
              <textarea maxLength={10000} value={notes} onInput={(e) => setNotes(e.currentTarget.value)} />
            </label>
            <label>
              Prematurity correction in weeks, if applicable
              <input
                type="number"
                min="0"
                max="20"
                step="1"
                value={correctedWeeks}
                onInput={(e) => setCorrectedWeeks(Number(e.currentTarget.value))}
              />
            </label>
          </div>
        </details>
        <IdentityFields value={gender} options={options} onChange={setGender} />
        <MetFields value={met} onChange={setMet} />
        <ImportantDatesFields options={options} dates={importantDates} onChange={setImportantDates} />
        <ErrorMessage error={error} />
        <div class="people-actions">
          <button class="people-primary" disabled={saving || needs.length === 0} type="submit">
            {saving ? 'Saving…' : 'Save person'}
          </button>
          <button disabled={saving} type="button" onClick={onCancel}>
            Cancel
          </button>
          {onDelete && (
            <button disabled={saving} class="people-danger" type="button" onClick={onDelete}>
              Delete Person
            </button>
          )}
        </div>
      </form>
    </section>
  )
}

import type { ComponentChildren } from 'preact'

import axios from 'axios'

import { apiErrorText } from '../../utils/profile'

export function PeopleEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <section class="people-empty">
      <h1>People</h1>
      <p>
        Add someone to begin tracking what matters, exploring age-appropriate guidance, and maintaining
        meaningful relationships.
      </p>
      <button class="people-primary" onClick={onAdd}>
        Add Person
      </button>
    </section>
  )
}

export function Panel({ title, children, id }: { title: string; children: ComponentChildren; id?: string }) {
  return (
    <section class="people-panel" id={id}>
      <h2>{title}</h2>
      {children}
    </section>
  )
}

export function ErrorMessage({ error }: { error: unknown }) {
  if (!error) return null
  const fallback = error instanceof Error ? error.message : 'Something went wrong. Please try again.'
  const message = axios.isAxiosError(error) ? apiErrorText(error.response?.data?.error, fallback) : fallback
  return (
    <p class="people-error" role="alert">
      {message}
    </p>
  )
}

export function Choices({
  label,
  options,
  values,
  onChange,
  required,
}: {
  label: string
  options: { value: string; label: string }[]
  values: string[]
  onChange: (values: string[]) => void
  required?: boolean
}) {
  return (
    <fieldset class="people-choices">
      <legend>
        {label}
        {required ? ' (select at least one)' : ''}
      </legend>
      {options.map((option) => (
        <label key={option.value}>
          <input
            type="checkbox"
            checked={values.includes(option.value)}
            onChange={(event) =>
              onChange(
                event.currentTarget.checked
                  ? [...values, option.value]
                  : values.filter((value) => value !== option.value),
              )
            }
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  )
}

export const localDateTime = (value: string) => {
  const date = new Date(value)
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return shifted.toISOString().slice(0, 16)
}

export const splitLines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

export const dateTimeInputToIso = (value: string, original?: string | null): string | null => {
  if (!value) return null
  if (original && value === localDateTime(original)) return original
  const instant = new Date(value).toISOString()
  if (localDateTime(instant) !== value) {
    throw new Error('This local time does not exist because the clocks change. Choose another time.')
  }
  return instant
}

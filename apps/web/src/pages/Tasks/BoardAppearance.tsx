import type { ComponentChildren } from 'preact'

import { useState } from 'preact/hooks'

import './BoardAppearance.css'

const accents = { default: '', teal: '#389d91', violet: '#9575cd', amber: '#d3912a' }
type Appearance = {
  density: 'comfortable' | 'compact'
  accent: keyof typeof accents
  showDescriptions: boolean
}
const defaults: Appearance = { density: 'comfortable', accent: 'default', showDescriptions: true }
const storageKey = (user: string) => `task-board-appearance:${JSON.stringify(user)}`

function readAppearance(user?: string): Appearance {
  try {
    if (!user) return defaults
    const value: unknown = JSON.parse(localStorage.getItem(storageKey(user)) ?? 'null')
    if (
      !value ||
      typeof value !== 'object' ||
      !('density' in value) ||
      (value.density !== 'comfortable' && value.density !== 'compact') ||
      !('accent' in value) ||
      typeof value.accent !== 'string' ||
      !Object.hasOwn(accents, value.accent) ||
      !('showDescriptions' in value) ||
      typeof value.showDescriptions !== 'boolean'
    )
      {return defaults}
    return {
      density: value.density,
      accent: value.accent as Appearance['accent'],
      showDescriptions: value.showDescriptions,
    }
  } catch {
    return defaults
  }
}

export function BoardAppearance({
  user,
  busy,
  children,
}: {
  user?: string
  busy: boolean
  children: ComponentChildren
}) {
  const [appearance, setAppearance] = useState(() => readAppearance(user))
  const [saveFailed, setSaveFailed] = useState(false)
  const change = (next: Appearance) => {
    setAppearance(next)
    try {
      if (user) localStorage.setItem(storageKey(user), JSON.stringify(next))
      setSaveFailed(false)
    } catch {
      setSaveFailed(true)
    }
  }
  return (
    <div
      class="task-board-wrap board-appearance"
      aria-busy={busy}
      data-density={appearance.density}
      data-accent={appearance.accent}
      data-descriptions={appearance.showDescriptions ? 'show' : 'hide'}
      style={{ '--board-appearance-accent': accents[appearance.accent] }}
    >
      <details class="board-appearance-controls">
        <summary>Appearance</summary>
        <div class="board-appearance-options">
          <label>
            Density
            <select
              value={appearance.density}
              onChange={(event) =>
                change({
                  ...appearance,
                  density: event.currentTarget.value === 'compact' ? 'compact' : 'comfortable',
                })
              }
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </label>
          <label>
            Accent
            <select
              value={appearance.accent}
              onChange={(event) => {
                const accent = event.currentTarget.value
                if (Object.hasOwn(accents, accent))
                  {change({ ...appearance, accent: accent as Appearance['accent'] })}
              }}
            >
              <option value="default">Default</option>
              <option value="teal">Teal</option>
              <option value="violet">Violet</option>
              <option value="amber">Amber</option>
            </select>
          </label>
          <label class="board-appearance-checkbox">
            <input
              type="checkbox"
              checked={appearance.showDescriptions}
              onChange={(event) => change({ ...appearance, showDescriptions: event.currentTarget.checked })}
            />
            Show descriptions
          </label>
          <button type="button" onClick={() => change(defaults)}>
            Reset defaults
          </button>
        </div>
        <p class="planning-muted" role="status">
          {saveFailed
            ? 'Could not save in this browser; changes apply until you leave this board.'
            : user
              ? 'Saved for this account in this browser'
              : 'Sign in to remember these choices in this browser.'}
        </p>
      </details>
      {children}
    </div>
  )
}

import { useEffect, useRef } from 'preact/hooks'

import type { CelebrationFamily } from './celebration-catalog'

import './Celebration.css'

const confetti = [
  { color: '#f59e0b', delay: 0, drift: 5, duration: 2100, left: 8, rotation: 18 },
  { color: '#ec4899', delay: 120, drift: -4, duration: 2350, left: 14, rotation: 72 },
  { color: '#14b8a6', delay: 40, drift: 7, duration: 2200, left: 21, rotation: 42 },
  { color: '#8b5cf6', delay: 210, drift: -6, duration: 2450, left: 29, rotation: 105 },
  { color: '#f97316', delay: 80, drift: 4, duration: 2250, left: 37, rotation: 28 },
  { color: '#22c55e', delay: 260, drift: -5, duration: 2500, left: 44, rotation: 88 },
  { color: '#eab308', delay: 20, drift: 6, duration: 2300, left: 51, rotation: 55 },
  { color: '#3b82f6', delay: 180, drift: -7, duration: 2400, left: 58, rotation: 115 },
  { color: '#ef4444', delay: 70, drift: 5, duration: 2150, left: 65, rotation: 34 },
  { color: '#a855f7', delay: 240, drift: -4, duration: 2550, left: 72, rotation: 92 },
  { color: '#06b6d4', delay: 110, drift: 7, duration: 2280, left: 79, rotation: 64 },
  { color: '#f59e0b', delay: 290, drift: -6, duration: 2480, left: 86, rotation: 122 },
  { color: '#ec4899', delay: 50, drift: 4, duration: 2180, left: 92, rotation: 47 },
] as const

export function Celebration({
  duration = 3600,
  icon,
  id,
  kind,
  message,
  onDone,
  title,
}: {
  icon: string
  id: number
  duration?: number
  kind: 'treatment' | 'work' | CelebrationFamily
  message: string
  onDone: () => void
  title: string
}) {
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    const timeout = window.setTimeout(() => done.current(), duration)
    return () => window.clearTimeout(timeout)
  }, [id, duration])

  return (
    <div
      class={`celebration-overlay celebration-${kind}`}
      style={`--celebration-duration:${duration - 200}ms`}
      role="status"
      aria-live="polite"
    >
      <div class="celebration-glow" aria-hidden="true" />
      <div class="celebration-card" key={id}>
        <span class="celebration-icon" aria-hidden="true">
          {icon}
        </span>
        <div>
          <strong>{title}</strong>
          <span>{message}</span>
        </div>
        <button class="celebration-dismiss" type="button" aria-label="Dismiss celebration" onClick={onDone}>
          ×
        </button>
      </div>
      <div class="celebration-confetti" aria-hidden="true">
        {confetti.map((piece, index) => (
          <i
            key={`${id}-${index}`}
            style={`--confetti-x:${piece.left}%;--confetti-delay:${piece.delay}ms;--confetti-drift:${piece.drift}vw;--confetti-duration:${piece.duration}ms;--confetti-color:${piece.color};--confetti-rotation:${piece.rotation}deg`}
          />
        ))}
      </div>
    </div>
  )
}

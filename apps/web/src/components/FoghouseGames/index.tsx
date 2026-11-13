import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'preact/hooks'

import type { Game, GameResult, InputMode } from './protocol'

import { pharmacologyErrorMessage } from '../../state/api/pharmacology'
import { currentSessionGeneration } from '../../state/sessionBoundary'
import { memoryInstrument, reactionInstrument } from './instruments'
import { saveGameResult } from './save'
import './style.css'

// eslint-disable-next-line complexity -- explicit run, completed, saving and saved states share the opt-in card.
export function FoghouseGames() {
  const client = useQueryClient()
  const [game, setGame] = useState<Game>('memory')
  const [mode, setMode] = useState<InputMode>(() =>
    window.matchMedia?.('(pointer: coarse)')?.matches ? 'pointer' : 'keyboard',
  )
  const [run, setRun] = useState<string | null>(null)
  const [result, setResult] = useState<GameResult | null>(null)
  const [conditions, setConditions] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)
  const active = useRef(true)
  const lock = useRef(false)
  const generation = useRef(currentSessionGeneration())
  const instrument = game === 'memory' ? memoryInstrument : reactionInstrument
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  useEffect(() => {
    if (!run) return
    let settled = false
    const cancel = () => {
      if (settled) return
      settled = true
      setRun(null)
      setResult(null)
      setMessage('Run canceled. No result was saved.')
    }
    const onMessage = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.origin !== location.origin ||
        event.data?.token !== run
      ) {
        return
      }
      if (settled) return
      if (event.data.type === 'complete') {
        settled = true
        setResult(event.data.result)
        setRun(null)
        setMessage('Complete. Review your result, then choose Save result.')
      } else if (event.data.type === 'error') {
        settled = true
        setRun(null)
        setResult(null)
        setMessage('The game could not finish. No result was saved. Please start a new run.')
      } else if (event.data.type === 'canceled') cancel()
    }
    const hidden = () => {
      if (document.hidden) cancel()
    }
    // Focusing the iframe also blurs its parent window; only cancel external focus loss here.
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel()
    }
    const blur = () => {
      if (document.activeElement !== frame.current) cancel()
    }
    window.addEventListener('keydown', escape)
    window.addEventListener('message', onMessage)
    document.addEventListener('visibilitychange', hidden)
    window.addEventListener('blur', blur)
    return () => {
      settled = true
      window.removeEventListener('keydown', escape)
      window.removeEventListener('message', onMessage)
      document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('blur', blur)
    }
  }, [run])
  const reset = () => {
    setRun(null)
    setResult(null)
    setSaved(false)
    setMessage('')
    setConditions('')
  }
  const start = () => {
    reset()
    generation.current = currentSessionGeneration()
    setRun(crypto.randomUUID())
  }
  const save = async () => {
    if (!result || lock.current || saved) return
    lock.current = true
    setBusy(true)
    setMessage('Saving…')
    try {
      await saveGameResult(result, conditions, generation.current, () => active.current)
      if (!active.current) return
      setSaved(true)
      setMessage('Result saved. View it in Mental Assessments.')
      void client.invalidateQueries({ queryKey: ['pharmacology'] })
    } catch (error) {
      if (active.current) {
        setMessage(`${pharmacologyErrorMessage(error)} Your completed result is still here; you can retry.`)
      }
    } finally {
      lock.current = false
      if (active.current) setBusy(false)
    }
  }
  return (
    <section
      class={`foghouse-games${run ? ' foghouse-games-running' : ''}`}
      aria-labelledby="foghouse-games-title"
    >
      <header class="foghouse-arcade-header">
        <h2 id="foghouse-games-title">
          <span aria-hidden="true">◈</span> Foghouse arcade
        </h2>
        {!run && <span class="foghouse-arcade-tag">PLAY · NOTICE · REPEAT</span>}
      </header>
      {run ? (
        <div class="foghouse-play-window">
          <button
            class="foghouse-exit"
            aria-label="Cancel run"
            title="Exit game (Escape)"
            onClick={() => {
              setRun(null)
              setMessage('Run canceled. No result saved.')
            }}
          >
            ×
          </button>
          <iframe
            ref={frame}
            class="foghouse-game-frame"
            title={instrument.title}
            src={`/foghouse-games.html#${new URLSearchParams({ game, mode: game === 'memory' ? 'pointer' : mode, token: run })}`}
          />
        </div>
      ) : (
        <>
          <div class="foghouse-game-tabs" aria-label="Choose a game">
            <button
              disabled={busy}
              aria-pressed={game === 'memory'}
              onClick={() => {
                reset()
                setGame('memory')
              }}
            >
              <span aria-hidden="true">▦</span> Memory
            </button>
            <button
              disabled={busy}
              aria-pressed={game === 'reaction'}
              onClick={() => {
                reset()
                setGame('reaction')
              }}
            >
              <span aria-hidden="true">◎</span> Reaction
            </button>
          </div>
          {!result && (
            <>
              <button
                class={`foghouse-launch foghouse-launch-${game}`}
                disabled={busy}
                aria-label="Start test"
                onClick={start}
              >
                {game === 'memory' ? (
                  <span class="foghouse-memory-mark" aria-hidden="true">
                    {Array.from({ length: 9 }, (_, i) => (
                      <span key={i} />
                    ))}
                  </span>
                ) : (
                  <span class="foghouse-reaction-mark" aria-hidden="true">
                    <span />
                  </span>
                )}
                <span class="foghouse-launch-label">
                  Tap to play <span aria-hidden="true">↗</span>
                </span>
                <span class="foghouse-launch-sub">
                  {game === 'memory'
                    ? 'Follow the light'
                    : mode === 'keyboard'
                      ? 'Space key · 3 min'
                      : 'Tap the ring · 3 min'}
                </span>
              </button>
              <details class="foghouse-instructions">
                <summary>How to play</summary>
                <p>
                  {game === 'memory'
                    ? 'Watch the blocks light up, then tap or click them in the same order. One practice round comes first. Two attempts per length; keep going if either is correct. The run ends after two misses at a length or after length nine.'
                    : 'Wait for GO, then respond once as quickly as you can. Early responses count as anticipations. Each response window lasts up to two seconds. Keep this window focused for all three minutes.'}
                </p>
                {game === 'reaction' ? (
                  <label>
                    Input{' '}
                    <select
                      value={mode}
                      onChange={(event) => setMode(event.currentTarget.value as InputMode)}
                    >
                      <option value="keyboard">Space key</option>
                      <option value="pointer">Tap / click the ring</option>
                    </select>
                  </label>
                ) : (
                  <p>
                    Memory uses pointer input only; this spatial task has no keyboard recall mode. Correctness
                    feedback ends at the first mistake. Rounds advance automatically.
                  </p>
                )}
                <p>
                  Research-informed personal tracking, not a diagnostic test. Practice, sleep, device and
                  input method affect results. Use the same device and input mode for comparisons.
                </p>
                <p>{instrument.description}</p>
                <p>
                  Escape or × exits. Leaving the game or switching windows cancels the whole run. Nothing
                  saves automatically.
                </p>
              </details>
            </>
          )}
        </>
      )}
      {result && (
        <div class="foghouse-game-result">
          <p class="foghouse-result-eyebrow">
            RUN COMPLETE <span>◇</span>
          </p>
          <div class="foghouse-primary-score">
            <strong>{game === 'memory' ? result.metrics.span : (result.metrics.median ?? '—')}</strong>
            <span>{game === 'memory' ? 'block span' : 'ms median'}</span>
          </div>
          <dl>
            {instrument.fields
              .filter(
                (field) =>
                  result.metrics[field.key] !== undefined &&
                  field.key !== (game === 'memory' ? 'span' : 'median'),
              )
              .map((field) => (
                <div key={field.key}>
                  <dt>{field.label}</dt>
                  <dd>
                    {result.metrics[field.key]} <small>{field.unit}</small>
                  </dd>
                </div>
              ))}
          </dl>
          {game === 'reaction' && result.metrics.valid === 0 && (
            <p>No valid responses; median and variability are unavailable.</p>
          )}
          <div class="foghouse-result-actions">
            <button class="foghouse-save" disabled={busy || saved} onClick={() => void save()}>
              {saved ? 'Saved ✓' : busy ? 'Saving…' : 'Save result'}
            </button>
            <button disabled={busy} onClick={start}>
              Play again ↗
            </button>
          </div>
          <details class="foghouse-result-details">
            <summary>Details & conditions</summary>
            <p>
              {instrument.title} · {new Date(result.completed_at).toLocaleString()} · {result.input_mode}
            </p>
            <label>
              Conditions note (optional)
              <textarea
                maxLength={2000}
                disabled={busy || saved}
                value={conditions}
                onInput={(event) => setConditions(event.currentTarget.value)}
              />
            </label>
            <pre>{JSON.stringify(result, null, 2)}</pre>
            <a href="/assessments">View history ↗</a>
          </details>
        </div>
      )}
      {message && (
        <p class="foghouse-game-status" role="status">
          {message}
        </p>
      )}
    </section>
  )
}

import type { OnboardingStepId } from '@aurboda/api-spec'
import type { ComponentChildren } from 'preact'

import {
  chapters,
  FOGHOUSE_URL,
  onboardingCounts,
  type OnboardingStep,
  type StepStatus,
} from './onboarding-model'
import './OnboardingFlow.css'

export interface OnboardingFlowProps {
  steps: OnboardingStep[]
  chapter: number
  selectedId: OnboardingStepId
  busy?: boolean
  error?: string
  copied?: boolean
  computerSetup?: ComponentChildren
  featureControl?: ComponentChildren
  onChapter: (chapter: number) => void
  onSelect: (id: OnboardingStepId) => void
  onStatus: (id: OnboardingStepId, status: StepStatus) => void
  onHide: () => void
  onCopyUrl: () => void
  onRetry?: () => void
  onNavigate?: (href: string) => void
}
export function OnboardingFlow(props: OnboardingFlowProps) {
  const { steps, chapter, selectedId, busy, onChapter, onSelect, onStatus } = props
  const counts = onboardingCounts(steps)
  return (
    <section class="onboarding-flow" aria-labelledby="onboarding-title">
      <header class="onboarding-heading">
        <div>
          <span class="onboarding-eyebrow">THE FOGHOUSE · YOUR OWN PACE</span>
          <h2 id="onboarding-title">A little setup. A clearer picture.</h2>
          <p>Start with what helps you. Everything else can wait.</p>
        </div>
        <button type="button" disabled={busy} onClick={props.onHide}>
          Hide guide
        </button>
      </header>
      <div class="onboarding-progress" aria-live="polite">
        {counts.completed} complete · {counts.skipped} skipped · {counts.remaining} remaining
      </div>
      <progress max={steps.length} value={counts.completed + counts.skipped} aria-label="Setup progress" />
      <nav class="onboarding-chapters" aria-label="Setup chapters">
        {chapters.map((label, i) => (
          <button
            type="button"
            key={label}
            aria-current={i === chapter ? 'step' : undefined}
            disabled={busy}
            onClick={() => onChapter(i)}
          >
            <span>{i + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      {props.error && (
        <p role="alert" class="onboarding-error">
          {props.error}{' '}
          {props.onRetry && (
            <button type="button" disabled={busy} onClick={props.onRetry}>
              Retry
            </button>
          )}
        </p>
      )}
      {counts.remaining === 0 && (
        <div class="onboarding-summary">
          <h3>Your workspace, your way.</h3>
          <p>You have reviewed every step. Skipped ideas stay here whenever you want to revisit them.</p>
          <button type="button" disabled={busy} onClick={props.onHide}>
            Done — close guide
          </button>
        </div>
      )}
      <ol class="onboarding-list">
        {steps
          .filter((s) => s.chapter === chapter)
          .map((step) => (
            <li
              key={step.id}
              class={`onboarding-step ${step.status} ${selectedId === step.id ? 'expanded' : ''}`}
            >
              <button
                type="button"
                class="onboarding-step-heading"
                disabled={busy}
                onClick={() => onSelect(step.id)}
                aria-expanded={selectedId === step.id}
              >
                <span class="onboarding-step-icon">
                  {step.status === 'completed' ? '✓' : step.status === 'skipped' ? '−' : '○'}
                </span>
                <strong>{step.title}</strong>
                <span class="onboarding-step-state">{stepLabel(step)}</span>
              </button>
              {selectedId === step.id && (
                <div class="onboarding-step-body">
                  <StepDescription step={step} onNavigate={props.onNavigate} />
                  {(step.id === 'browser_basics' || step.id === 'android_app') && (
                    <div class="onboarding-address">
                      <code>{FOGHOUSE_URL}</code>
                      <button type="button" onClick={props.onCopyUrl}>
                        {props.copied ? 'Copied' : 'Copy URL'}
                      </button>
                    </div>
                  )}
                  {step.signal && step.status === 'pending' && (
                    <p class="onboarding-signal" role="status">
                      {step.signal}
                    </p>
                  )}
                  {step.id === 'feature_control' && props.featureControl}
                  {step.id === 'computer_time' && step.status === 'pending' && props.computerSetup}
                  <StepActions step={step} busy={busy} onStatus={onStatus} onNavigate={props.onNavigate} />
                  {step.manualLabel === "I've explored this" && (
                    <small>This marks the tour as reviewed, without saving personal data.</small>
                  )}
                </div>
              )}
            </li>
          ))}
      </ol>
      <footer class="onboarding-footer">
        <button type="button" disabled={busy || chapter === 0} onClick={() => onChapter(chapter - 1)}>
          ← Back
        </button>
        <span>Chapter {chapter + 1} of 3</span>
        <button type="button" disabled={busy || chapter === 2} onClick={() => onChapter(chapter + 1)}>
          Next chapter →
        </button>
      </footer>
    </section>
  )
}

function StepDescription({
  step,
  onNavigate,
}: {
  step: OnboardingStep
  onNavigate?: OnboardingFlowProps['onNavigate']
}) {
  const props = { onNavigate }
  return (
    <>
      {' '}
      {step.id === 'android_app' ? (
        <>
          <p>Use Aurboda Android for Health Connect, background syncing and quick checks.</p>
          <ol class="onboarding-android-steps">
            <li>
              Download and install the{' '}
              <a
                href="https://github.com/fiddur/aurboda/releases/latest/download/aurboda.apk"
                onClick={
                  props.onNavigate
                    ? (e) => {
                        e.preventDefault()
                        props.onNavigate?.(
                          'https://github.com/fiddur/aurboda/releases/latest/download/aurboda.apk',
                        )
                      }
                    : undefined
                }
              >
                official Android APK
              </a>
              .
            </li>
            <li>
              Set <strong>Server URL</strong> to <strong>{FOGHOUSE_URL}</strong>. The public APK may still
              default to the upstream server; enter this address yourself.
            </li>
            <li>Sign in with your existing Foghouse account.</li>
            <li>
              Open <strong>Sync</strong> and grant Health Connect read permissions.
            </li>
            <li>Allow background access and battery exemption so syncing can continue.</li>
            <li>
              Tap <strong>Sync Now</strong> and check for your first data.
            </li>
          </ol>
          <p>Optional: use Live for Bluetooth heart rate or enable ActivityWatch mobile syncing.</p>
        </>
      ) : (
        <p>{step.description}</p>
      )}
    </>
  )
}

function StepActions({
  step,
  busy,
  onStatus,
  onNavigate,
}: {
  step: OnboardingStep
  busy?: boolean
  onStatus: OnboardingFlowProps['onStatus']
  onNavigate?: OnboardingFlowProps['onNavigate']
}) {
  const props = { onNavigate }
  return (
    <div class="onboarding-actions">
      {step.action && (
        <a
          href={step.action.href}
          onClick={
            props.onNavigate
              ? (e) => {
                  e.preventDefault()
                  props.onNavigate?.(step.action?.href ?? '/')
                }
              : undefined
          }
        >
          {step.action.label} ↗
        </a>
      )}
      {step.status === 'pending' && step.manualLabel && (
        <button
          class="onboarding-primary"
          type="button"
          disabled={busy}
          onClick={() => onStatus(step.id, 'completed')}
        >
          {busy ? 'Saving…' : step.manualLabel}
        </button>
      )}
      {step.status === 'pending' && step.id !== 'browser_basics' && (
        <button type="button" disabled={busy} onClick={() => onStatus(step.id, 'skipped')}>
          Skip for now
        </button>
      )}
      {step.status === 'skipped' && (
        <button type="button" disabled={busy} onClick={() => onStatus(step.id, 'pending')}>
          Try this
        </button>
      )}
    </div>
  )
}

function stepLabel(step: OnboardingStep) {
  if (step.status === 'completed') return 'Complete'
  if (step.status === 'skipped') return 'Skipped'
  return step.id === 'browser_basics' ? 'Start here' : 'Optional'
}

import type { OnboardingProgress, OnboardingStepId } from '@aurboda/api-spec'

import { render } from 'preact'
import { useState } from 'preact/hooks'

import { Celebration } from './components/Celebration'
import { nextCelebration, type CelebrationEvent } from './components/celebration-catalog'
import {
  onboardingSteps,
  onboardingCounts,
  FOGHOUSE_URL,
  type StepStatus,
} from './components/onboarding-model'
import { OnboardingFlow } from './components/OnboardingFlow'
import './onboarding-preview.css'

function Preview() {
  const [progress, setProgress] = useState<OnboardingProgress>({})
  const [chapter, setChapter] = useState(0)
  const [selected, setSelected] = useState<OnboardingStepId>('browser_basics')
  const [hidden, setHidden] = useState(false)
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState(false)
  const [event, setEvent] = useState<CelebrationEvent | null>(null)
  const steps = onboardingSteps(progress, [], {
    android_app: 'Waiting for first Health Connect data',
    wearable: 'Connected — waiting for first data',
    computer_time: 'Waiting for first desktop data',
    social: 'No follow or challenge found yet.',
  })
  const status = (id: OnboardingStepId, value: StepStatus) => {
    const next = { ...progress, [id]: value }
    setProgress(next)
    if (value === 'completed') {
      setEvent(
        nextCelebration(
          onboardingCounts(onboardingSteps(next)).remaining === 0 ? 'onboarding-finish' : 'onboarding-step',
        ),
      )
    }
    const following = steps.find((s) => s.chapter === chapter && s.id !== id && s.status === 'pending')
    if (following && value !== 'pending') setSelected(following.id)
  }
  return (
    <main>
      <div class="preview-controls">
        <strong>Interactive preview</strong>
        <span>Simulated setup · no account or live data</span>
        <button
          onClick={() => {
            status('wearable', 'completed')
            setChapter(1)
            setSelected('wearable')
          }}
          disabled={progress.wearable === 'completed'}
        >
          Simulate first sync
        </button>
        <button
          onClick={() => {
            setProgress({})
            setChapter(0)
            setSelected('browser_basics')
            setHidden(false)
            setEvent(null)
            setNotice('')
            setCopied(false)
          }}
        >
          Restart demo
        </button>
      </div>
      {notice && (
        <p class="preview-notice" role="status">
          {notice}
        </p>
      )}
      {hidden ? (
        <div class="preview-closed">
          <h2>Guide tucked away.</h2>
          <p>Your progress is kept. In the app, reopen it from Settings.</p>
          <button onClick={() => setHidden(false)}>Open setup guide</button>
        </div>
      ) : (
        <OnboardingFlow
          steps={steps}
          chapter={chapter}
          selectedId={selected}
          onChapter={(value) => {
            setChapter(value)
            setSelected(
              (
                steps.find((s) => s.chapter === value && s.status === 'pending') ??
                steps.find((s) => s.chapter === value) ??
                steps[0]
              ).id,
            )
          }}
          onSelect={setSelected}
          onStatus={status}
          onHide={() => setHidden(true)}
          onCopyUrl={() => {
            setCopied(true)
            setNotice(`Demo: website address is ${FOGHOUSE_URL}`)
          }}
          copied={copied}
          onNavigate={(href) => setNotice(`In the app, this opens ${href}. This preview stays here.`)}
          computerSetup={
            <div class="preview-installer">
              <strong>ActivityWatch setup</strong>
              <p>
                In your signed-in app, this panel generates a secure API token and a copyable installation
                command. This preview does not generate credentials.
              </p>
              <button onClick={() => setNotice('Demo: secure setup is available in your signed-in app.')}>
                Preview secure setup
              </button>
            </div>
          }
        />
      )}
      {event && <Celebration {...event} onDone={() => setEvent(null)} />}
    </main>
  )
}
const previewRoot = document.getElementById('foghouse-onboarding-preview')
if (previewRoot) render(<Preview />, previewRoot)

import { signal } from '@preact/signals'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { advanceSessionGeneration } from '../state/sessionBoundary'
import { GetStartedGuide } from './GetStartedGuide'
import { onboardingSteps } from './onboarding-model'
import { OnboardingFlow } from './OnboardingFlow'
import { OnboardingSettings } from './OnboardingSettings'

const api = vi.hoisted(() => ({
  fetchUserSettings: vi.fn(),
  updateUserSettings: vi.fn(),
  fetchRawRecordCount: vi.fn(),
  fetchActivityWatchStatus: vi.fn(),
  fetchProductivity: vi.fn(),
  fetchFollowing: vi.fn(),
  listMyChallengeParticipations: vi.fn(),
}))
const route = vi.hoisted(() => vi.fn())
vi.mock('../state/api', () => api)
vi.mock('../state/auth', () => ({ auth: signal({ token: 'test', user: 'test', is_admin: false }) }))
vi.mock('preact-iso', () => ({ useLocation: () => ({ url: '/', route }) }))
vi.mock('./ActivityWatchInstall', () => ({ ActivityWatchInstall: () => <div>Secure installer</div> }))
let root: HTMLDivElement
let client: QueryClient
let settings: Record<string, unknown>
const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25))
  })
}
const click = async (text: string) => {
  const button = [...root.querySelectorAll('button')].find((b) => b.textContent?.includes(text))
  expect(button, text).toBeTruthy()
  await act(async () => button?.click())
  await flush()
}
const mount = async (view = <GetStartedGuide />) => {
  await act(async () => render(<QueryClientProvider client={client}>{view}</QueryClientProvider>, root))
  await flush()
  await flush()
}
beforeEach(() => {
  vi.clearAllMocks()
  root = document.createElement('div')
  document.body.append(root)
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  settings = {
    onboarding_progress: { feature_control: 'skipped' },
    hidden_pages: [],
    success: true,
    onboarding_manual_done: [],
    onboarding_dismissed_at: null,
    garmin_connected: false,
    oura_connected: false,
    strava_connected: false,
  }
  api.fetchUserSettings.mockImplementation(async () => settings)
  api.updateUserSettings.mockImplementation(async (update) => {
    settings = {
      ...settings,
      ...update,
      onboarding_progress: { ...(settings.onboarding_progress as object), ...update.onboarding_progress },
    }
    return settings
  })
  api.fetchRawRecordCount.mockResolvedValue(0)
  api.fetchActivityWatchStatus.mockResolvedValue([])
  api.fetchFollowing.mockResolvedValue([])
  api.listMyChallengeParticipations.mockResolvedValue([])
})
afterEach(() => {
  act(() => render(null, root))
  root.remove()
  client.clear()
})
it('waits for confirmed save, preserves state on failure, and celebrates a successful completion', async () => {
  api.updateUserSettings.mockRejectedValueOnce(new Error('offline'))
  await mount()
  await click('Got it')
  expect(root.textContent).toContain('0 complete')
  expect(root.textContent).toContain('could not be saved')
  expect(root.querySelector('.celebration-overlay')).toBeNull()
  await click('Got it')
  expect(root.textContent).toContain('1 complete')
  expect(root.querySelector('.celebration-onboarding-step')).not.toBeNull()
})
it('does not hide after dismissal fails', async () => {
  api.updateUserSettings.mockRejectedValueOnce(new Error('offline'))
  await mount()
  await click('Hide guide')
  expect(root.querySelector('.onboarding-flow')).not.toBeNull()
  expect(root.textContent).toContain('could not be saved')
})
it('backfills historical records silently and celebrates newly arriving data only once', async () => {
  settings.garmin_connected = true
  api.fetchRawRecordCount.mockImplementation(async ({ source }) => (source === 'health_connect' ? 3 : 0))
  await mount()
  await flush()
  expect(root.textContent).toContain('1 complete')
  expect(root.querySelector('.celebration-overlay')).toBeNull()
  await click('Connect your data')
  expect(root.textContent).toContain('Connected — waiting for first data')
  api.fetchRawRecordCount.mockResolvedValue(5)
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['getStarted', 'wearable'] })
  })
  await flush()
  await flush()
  expect(root.textContent).toContain('2 complete')
  expect(root.querySelector('.celebration-onboarding-step')).not.toBeNull()
  const calls = api.updateUserSettings.mock.calls.length
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['getStarted', 'wearable'] })
  })
  await flush()
  expect(api.updateUserSettings).toHaveBeenCalledTimes(calls)
})
it('retries a failed automatic progress save even when the detected data stays the same', async () => {
  api.fetchRawRecordCount.mockResolvedValue(1)
  api.updateUserSettings.mockRejectedValueOnce(new Error('offline'))
  await mount()
  expect(root.textContent).toContain('could not be saved')
  await click('Retry')
  await flush()
  expect(root.textContent).toContain('1 complete')
})
it('reopens without clearing any progress and does not navigate on failure', async () => {
  settings.onboarding_progress = {
    feature_control: 'skipped',
    android_app: 'skipped',
    browser_basics: 'completed',
  }
  api.updateUserSettings.mockRejectedValueOnce(new Error('offline'))
  await mount(<OnboardingSettings />)
  await click('Open setup guide')
  expect(route).not.toHaveBeenCalled()
  await click('Open setup guide')
  expect(api.updateUserSettings).toHaveBeenLastCalledWith({ onboarding_dismissed_at: null })
  expect(route).toHaveBeenCalledWith('/?onboarding=review')
  expect(settings.onboarding_progress).toEqual({
    feature_control: 'skipped',
    android_app: 'skipped',
    browser_basics: 'completed',
  })
})
it('ignores an old-account save after session changes', async () => {
  let resolve!: (value: unknown) => void
  api.updateUserSettings.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r
      }),
  )
  await mount()
  await click('Got it')
  advanceSessionGeneration()
  await act(async () => resolve({ ...settings, onboarding_progress: { browser_basics: 'completed' } }))
  await flush()
  expect(root.querySelector('.celebration-overlay')).toBeNull()
  expect(client.getQueryData(['userSettings'])).toEqual(settings)
})
it('keeps the completion summary until explicitly closed and supports review without resetting', async () => {
  const ids = [
    'feature_control',
    'android_app',
    'wearable',
    'computer_time',
    'ask_ai',
    'treatments',
    'cpap',
    'mental_assessments',
    'simple_food',
    'work',
    'people',
    'social',
  ]
  settings.onboarding_progress = Object.fromEntries(ids.map((id) => [id, 'skipped']))
  await mount()
  await click('Got it')
  expect(root.textContent).toContain('1 complete · 12 skipped · 0 remaining')
  expect(root.querySelector('.celebration-onboarding-finish')).not.toBeNull()
  expect(root.textContent).toContain('Your workspace, your way.')
  expect(root.querySelectorAll('[aria-label="Optional next steps"]')).toHaveLength(1)
  act(() => render(null, root))
  await mount(<GetStartedGuide forceReview />)
  expect(root.textContent).toContain('1 complete · 12 skipped · 0 remaining')
  expect(root.querySelector('.celebration-overlay')).toBeNull()
})
it('hides an already finished guide by default without fetching setup signals', async () => {
  settings.onboarding_progress = Object.fromEntries(
    [
      'feature_control',
      'browser_basics',
      'android_app',
      'wearable',
      'computer_time',
      'ask_ai',
      'treatments',
      'cpap',
      'mental_assessments',
      'simple_food',
      'work',
      'people',
      'social',
    ].map((id) => [id, 'completed']),
  )
  await mount()
  expect(root.querySelector('.onboarding-flow')).toBeNull()
  expect(api.fetchRawRecordCount).not.toHaveBeenCalled()
})
it('keeps chapter and step selection stable while saving', async () => {
  let resolve!: (value: unknown) => void
  api.updateUserSettings.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r
      }),
  )
  await mount()
  await click('Got it')
  expect(
    [
      ...root.querySelectorAll<HTMLButtonElement>(
        '.onboarding-chapters button, .onboarding-step-heading, .onboarding-footer button',
      ),
    ].every((button) => button.disabled),
  ).toBe(true)
  await act(async () => resolve({ ...settings, onboarding_progress: { browser_basics: 'completed' } }))
  await flush()
  expect(root.querySelector<HTMLButtonElement>('.onboarding-chapters button')?.disabled).toBe(false)
})
it('automatically shows a fresh account the first step without writing settings or celebrating', async () => {
  settings.onboarding_progress = {}
  await mount()
  expect(root.querySelector('.onboarding-flow')).not.toBeNull()
  expect(root.textContent).toContain('0 complete · 0 skipped · 13 remaining')
  expect(root.querySelector('[aria-current="step"]')?.textContent).toContain('Start here')
  expect(root.querySelector('.onboarding-step-heading[aria-expanded="true"]')?.textContent).toContain(
    'What would you like to track?',
  )
  expect(api.updateUserSettings).not.toHaveBeenCalled()
  expect(root.querySelector('.celebration-overlay')).toBeNull()
})
it('retains halfway progress and resumes at the first unfinished step after a fresh client return', async () => {
  await mount()
  await click('Got it')
  await click('Skip for now')
  await click('Connect your data')
  await click('Skip for now')
  await click('Ask your data a question')
  await click("I've tried this")
  await click('Explore your workspace')
  await click("I've explored this")
  const stored = {
    feature_control: 'skipped',
    browser_basics: 'completed',
    android_app: 'skipped',
    wearable: 'skipped',
    ask_ai: 'completed',
    treatments: 'completed',
  }
  expect(settings.onboarding_progress).toEqual(stored)
  expect(root.textContent).toContain('3 complete · 3 skipped · 7 remaining')
  expect(root.querySelector('[aria-current="step"]')?.textContent).toContain('Explore your workspace')
  expect(root.querySelector('.onboarding-step-heading[aria-expanded="true"]')?.textContent).toContain(
    'Give CPAP history a home',
  )
  const writes = api.updateUserSettings.mock.calls.length
  const reads = api.fetchUserSettings.mock.calls.length
  act(() => render(null, root))
  client.clear()
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  await mount()
  expect(api.fetchUserSettings.mock.calls.length).toBeGreaterThan(reads)
  expect(settings.onboarding_progress).toEqual(stored)
  expect(root.querySelector('.onboarding-flow')).not.toBeNull()
  expect(root.textContent).toContain('3 complete · 3 skipped · 7 remaining')
  expect(root.querySelector('[aria-current="step"]')?.textContent).toContain('Connect your data')
  expect(root.querySelector('.onboarding-step-heading[aria-expanded="true"]')?.textContent).toContain(
    'See where computer time goes',
  )
  expect(root.querySelector('.celebration-overlay')).toBeNull()
  expect(api.updateUserSettings).toHaveBeenCalledTimes(writes)
  await click('Connect your data')
  expect(root.querySelector('.onboarding-step-heading[aria-expanded="true"]')?.textContent).toContain(
    'See where computer time goes',
  )
})
it('persists an explicit hide across a fresh client return without changing progress', async () => {
  await mount()
  await click('Got it')
  await click('Hide guide')
  expect(settings.onboarding_dismissed_at).toEqual(expect.any(String))
  expect(settings.onboarding_progress).toEqual({ feature_control: 'skipped', browser_basics: 'completed' })
  expect(root.querySelector('.onboarding-flow')).toBeNull()
  const writes = api.updateUserSettings.mock.calls.length
  act(() => render(null, root))
  client.clear()
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  await mount()
  expect(root.querySelector('.onboarding-flow')).toBeNull()
  expect(root.querySelector('.celebration-overlay')).toBeNull()
  expect(settings.onboarding_progress).toEqual({ feature_control: 'skipped', browser_basics: 'completed' })
  expect(api.updateUserSettings).toHaveBeenCalledTimes(writes)
})
it('initializes the first unfinished step when settings arrive after the initial render', async () => {
  let resolveSettings!: (value: unknown) => void
  api.fetchUserSettings.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveSettings = resolve
      }),
  )
  settings.onboarding_progress = {
    feature_control: 'skipped',
    browser_basics: 'completed',
    android_app: 'skipped',
    wearable: 'skipped',
  }
  settings.onboarding_manual_done = ['computer_time', 'ask_ai']
  await mount()
  expect(root.querySelector('.onboarding-flow')).toBeNull()
  await act(async () => resolveSettings(settings))
  await flush()
  await flush()
  expect(root.querySelector('[aria-current="step"]')?.textContent).toContain('Explore your workspace')
  expect(root.querySelector('.onboarding-step-heading[aria-expanded="true"]')?.textContent).toContain(
    'Keep treatments in view',
  )
  expect(api.updateUserSettings).not.toHaveBeenCalled()
  expect(root.querySelector('.celebration-overlay')).toBeNull()
})
it('does not reset manual chapter selection when settings are saved or refreshed later', async () => {
  settings.onboarding_progress = {
    feature_control: 'skipped',
    browser_basics: 'completed',
    android_app: 'skipped',
  }
  await mount()
  expect(root.querySelector('[aria-current="step"]')?.textContent).toContain('Connect your data')
  await click('Explore your workspace')
  await click("I've explored this")
  expect(root.querySelector('.onboarding-step-heading[aria-expanded="true"]')?.textContent).toContain(
    'Give CPAP history a home',
  )
  settings = {
    ...settings,
    onboarding_progress: { ...(settings.onboarding_progress as object), wearable: 'completed' },
  }
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['userSettings'] })
  })
  await flush()
  expect(root.querySelector('[aria-current="step"]')?.textContent).toContain('Explore your workspace')
  expect(root.querySelector('.onboarding-step-heading[aria-expanded="true"]')?.textContent).toContain(
    'Give CPAP history a home',
  )
})

it('lets a new user choose pages inline and confirms the step explicitly', async () => {
  settings.onboarding_progress = {}
  await mount()
  const work = root.querySelector<HTMLInputElement>('input[aria-label="Show Work"]')
  expect(work).not.toBeNull()
  await act(async () => work?.click())
  await flush()
  expect(api.updateUserSettings).toHaveBeenLastCalledWith({ hidden_pages: ['/work'] })
  expect(settings.onboarding_progress).toEqual({})
  await click('Continue with these pages')
  expect(settings.onboarding_progress).toEqual({ feature_control: 'completed' })
  expect(settings.hidden_pages).toEqual(['/work'])
  expect(root.querySelector('.onboarding-step-heading[aria-expanded="true"]')?.textContent).toContain(
    'Make yourself at home',
  )
})
it('skips feature selection without altering menu preferences', async () => {
  settings.onboarding_progress = {}
  settings.hidden_pages = ['/cpap']
  await mount()
  await click('Skip for now')
  expect(api.updateUserSettings).toHaveBeenLastCalledWith({
    onboarding_progress: { feature_control: 'skipped' },
  })
  expect(settings.hidden_pages).toEqual(['/cpap'])
})

it.each([
  { hiddenPages: [], destination: '/goals?view=board', hidden: false },
  { hiddenPages: ['/goals'], destination: '/settings', hidden: true },
  { hiddenPages: ['/goals/?view=board', '/future-page'], destination: '/settings', hidden: true },
  { hiddenPages: ['/future-page'], destination: '/goals?view=board', hidden: false },
])(
  'offers optional Tasks guidance using current visibility: $hiddenPages',
  async ({ hiddenPages, destination, hidden }) => {
    settings.hidden_pages = hiddenPages
    const before = structuredClone(settings)
    await mount()
    expect(root.querySelector('[aria-label="Optional next steps"]')).toBeNull()
    await click('Explore your workspace')
    const handoff = root.querySelector('[aria-label="Optional next steps"]')!
    expect(handoff.textContent).toContain('optional onboarding cards')
    expect(handoff.textContent).toContain('delete anything you don’t need')
    expect(handoff.querySelector('a')?.getAttribute('href')).toBe(destination)
    expect(handoff.textContent?.includes('enable Tasks')).toBe(hidden)
    expect(api.updateUserSettings).not.toHaveBeenCalled()
    expect(settings).toEqual(before)
  },
)

it('does not offer a Tasks link until settings confirm visibility', async () => {
  let resolveSettings!: (value: unknown) => void
  settings.hidden_pages = ['/goals']
  api.fetchUserSettings.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveSettings = resolve
      }),
  )
  await mount()
  expect(root.querySelector('[aria-label="Optional next steps"]')).toBeNull()
  await act(async () => resolveSettings(settings))
  await flush()
  await click('Explore your workspace')
  expect(root.querySelector('[aria-label="Optional next steps"] a')?.getAttribute('href')).toBe('/settings')
  expect(api.updateUserSettings).not.toHaveBeenCalled()
})

it('does not replay a dismissed guide to announce optional Tasks cards', async () => {
  settings.onboarding_dismissed_at = '2026-11-01T00:00:00Z'
  settings.hidden_pages = ['/goals', '/unknown-page']
  await mount()
  expect(root.querySelector('.onboarding-flow')).toBeNull()
  expect(api.updateUserSettings).not.toHaveBeenCalled()
  expect(settings.hidden_pages).toEqual(['/goals', '/unknown-page'])
})

it.each([false, true])('supports optional handoff navigation in previews (hidden=%s)', async (hidden) => {
  const navigate = vi.fn()
  await mount(
    <OnboardingFlow
      steps={onboardingSteps()}
      chapter={2}
      selectedId="treatments"
      hiddenPages={hidden ? ['/goals'] : []}
      onChapter={vi.fn()}
      onSelect={vi.fn()}
      onStatus={vi.fn()}
      onHide={vi.fn()}
      onCopyUrl={vi.fn()}
      onNavigate={navigate}
    />,
  )
  const link = root.querySelector<HTMLAnchorElement>('[aria-label="Optional next steps"] a')!
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  await act(async () => {
    link.dispatchEvent(event)
  })
  expect(event.defaultPrevented).toBe(true)
  expect(navigate).toHaveBeenCalledWith(hidden ? '/settings' : '/goals?view=board')
})

import type { OnboardingStepId, OnboardingProgress, OnboardingStepStatus } from '@aurboda/api-spec'

export const FOGHOUSE_URL = 'https://stats.foghouse.org'
export const chapters = ['Start here', 'Connect your data', 'Explore your workspace']
export type StepStatus = OnboardingStepStatus
export interface OnboardingStep {
  id: OnboardingStepId
  chapter: number
  title: string
  description: string
  action?: { href: string; label: string }
  manualLabel?: string
  status: StepStatus
  signal?: string
}
const definitions: Omit<OnboardingStep, 'status'>[] = [
  {
    id: 'feature_control',
    chapter: 0,
    title: 'What would you like to track?',
    description:
      'Choose what belongs in your menus. These choices can be changed anytime in Settings → Feature Control.',
    manualLabel: 'Continue with these pages',
  },
  {
    id: 'browser_basics',
    chapter: 0,
    title: 'Make yourself at home',
    description:
      'Use the browser for full dashboards, detailed history, longer questionnaires, Work, People and bigger forms. Android is your companion for device integrations, background syncing and quick checks. These features also remain available inside Android where supported.',
    action: { href: FOGHOUSE_URL, label: 'Open Aurboda' },
    manualLabel: 'Got it',
  },
  {
    id: 'android_app',
    chapter: 0,
    title: 'Bring your Android along',
    description:
      'Download Aurboda Android. Set Server URL to https://stats.foghouse.org and sign in with your existing account. In Sync, grant Health Connect read permissions, allow background access and battery exemption, then tap Sync Now. The public APK may still default to the upstream server: enter this address yourself. Optional: use Live for Bluetooth heart rate or enable ActivityWatch mobile syncing.',
    action: { href: '/data-sources/android-app', label: 'Download & setup' },
  },
  {
    id: 'wearable',
    chapter: 1,
    title: 'Connect your watch or ring',
    description:
      'Choose Garmin, Oura or Strava in Data Sources, connect your account, and run a sync. This step completes when records from a connected provider arrive.',
    action: { href: '/data-sources', label: 'Connect a wearable' },
  },
  {
    id: 'computer_time',
    chapter: 1,
    title: 'See where computer time goes',
    description:
      'Install ActivityWatch on your computer, then use the secure setup below to send app usage here every five minutes. Your first desktop records confirm setup.',
  },
  {
    id: 'ask_ai',
    chapter: 1,
    title: 'Ask your data a question',
    description:
      'Connect an AI assistant and try a question such as “Did I sleep better on days I ran?” When you have tried it, mark this step yourself.',
    action: { href: '/data-sources/aurboda#ai-assistant', label: 'Set up an assistant' },
    manualLabel: "I've tried this",
  },
  {
    id: 'treatments',
    chapter: 2,
    title: 'Keep treatments in view',
    description:
      'Explore Treatments to organize medicines, supplements and routines, then see what is planned for today. Start by opening the treatment list. This tour does not require adding medical details.',
    action: { href: '/treatments', label: 'Explore Treatments' },
    manualLabel: "I've explored this",
  },
  {
    id: 'cpap',
    chapter: 2,
    title: 'Give CPAP history a home',
    description:
      'If you use CPAP, open the import screen to see how therapy history fits together. If you do not use CPAP, skip this step.',
    action: { href: '/cpap', label: 'Explore CPAP' },
    manualLabel: "I've explored this",
  },
  {
    id: 'mental_assessments',
    chapter: 2,
    title: 'Make room for reflection',
    description:
      'Browse Assessments for brief check-ins, personality questionnaires and reasoning activities. Time and effort vary: read a description and choose what suits you. Reviewing this tour does not save an assessment.',
    action: { href: '/assessments', label: 'Browse Assessments' },
    manualLabel: "I've explored this",
  },
  {
    id: 'simple_food',
    chapter: 2,
    title: 'Notice food patterns gently',
    description:
      'Open Simple Food to see quick daily nutrition check-ins and longer reflections. Explore the choices before deciding what you want to record.',
    action: { href: '/simple-food', label: 'Explore Simple Food' },
    manualLabel: "I've explored this",
  },
  {
    id: 'work',
    chapter: 2,
    title: 'See the shape of a workday',
    description:
      'Open Work to explore daily totals, categories and notes. Choose a profile that fits your work when you are ready; this tour does not require a saved day.',
    action: { href: '/work', label: 'Explore Work' },
    manualLabel: "I've explored this",
  },
  {
    id: 'people',
    chapter: 2,
    title: 'Care for your connections',
    description:
      'Explore People for important dates, relationship context and care reminders. You can review the workspace without entering anyone else’s sensitive details.',
    action: { href: '/people', label: 'Explore People' },
    manualLabel: "I've explored this",
  },
  {
    id: 'social',
    chapter: 2,
    title: 'Find a little company',
    description:
      'If sharing appeals to you, open the feed and follow someone or join a challenge. Keeping your workspace personal is fine too: this is optional.',
    action: { href: '/feed', label: 'Explore the feed' },
  },
]
export function onboardingSteps(
  progress: OnboardingProgress = {},
  legacy: readonly OnboardingStepId[] = [],
  signals: Partial<Record<OnboardingStepId, string>> = {},
): OnboardingStep[] {
  return definitions.map((step) => ({
    ...step,
    status: progress[step.id] ?? (legacy.includes(step.id) ? 'completed' : 'pending'),
    signal: signals[step.id],
  }))
}
export function onboardingCounts(steps: OnboardingStep[]) {
  return {
    completed: steps.filter((s) => s.status === 'completed').length,
    skipped: steps.filter((s) => s.status === 'skipped').length,
    remaining: steps.filter((s) => s.status === 'pending').length,
  }
}

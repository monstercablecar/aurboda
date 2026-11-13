export type CelebrationFamily =
  | 'cpap'
  | 'big-five'
  | 'reasoning'
  | 'quick'
  | 'check-in'
  | 'nutrition-daily'
  | 'nutrition-assessment'
  | 'workday'
  | 'goal-complete'
  | 'import'
  | 'onboarding-step'
  | 'onboarding-finish'

export const celebrationFamilies = {
  'onboarding-step': {
    duration: 2800,
    icon: '✓',
    size: 'small',
    copy: [
      ['A little more at home.', 'One setup step, taken care of.'],
      ['That’s one piece in place.', 'Your setup progress is saved.'],
      ['At your own pace.', 'Another step is ready to revisit.'],
      ['A useful little beginning.', 'Your setup progress is kept.'],
    ],
  },
  'onboarding-finish': {
    duration: 4800,
    icon: '✦',
    size: 'large',
    copy: [
      ['Welcome to Aurboda.', 'Your workspace is ready to grow with you.'],
      ['A place for your bigger picture.', 'You have made the workspace your own.'],
      ['Your beginning, beautifully made.', 'Come back to any step whenever it helps.'],
      ['Settled in, at your own pace.', 'Your setup choices are saved.'],
    ],
  },
  cpap: {
    duration: 4800,
    icon: '☾',
    size: 'large',
    copy: [
      ['Nice job, you’re a trooper!', 'Your CPAP history is tucked in.'],
      ['A little care, recorded.', 'Your CPAP records are saved and ready to revisit.'],
      ['You brought the history together.', 'Your CPAP import is safely recorded.'],
      ['One more thing taken care of.', 'Your CPAP history has a place here.'],
    ],
  },
  'big-five': {
    duration: 5200,
    icon: '✦',
    size: 'large',
    copy: [
      ['That took some real reflection.', 'A little more of the bigger picture, saved.'],
      ['Room for the whole you.', 'Your Big Five result is recorded.'],
      ['Reflection worth keeping.', 'Your personality snapshot is saved.'],
      ['You gave this some thought.', 'Your Big Five record is here to revisit.'],
    ],
  },
  reasoning: {
    duration: 4000,
    icon: '◇',
    size: 'medium',
    copy: [
      ['Brainwork, banked.', 'You put in the thought. Your result is saved.'],
      ['A thoughtful effort.', 'Your reasoning result is recorded.'],
      ['Another piece of the picture.', 'Your thinking-work snapshot is saved.'],
      ['You showed up for the challenge.', 'Your result has a place in your history.'],
    ],
  },
  quick: {
    duration: 2800,
    icon: '✓',
    size: 'small',
    copy: [
      ['Quick check. Nicely done.', 'Your benchmark result is saved.'],
      ['A small moment, recorded.', 'Your benchmark is in your history.'],
      ['Checked and tucked away.', 'Your result is ready to revisit.'],
      ['One little check complete.', 'Your benchmark snapshot is recorded.'],
    ],
  },
  'check-in': {
    duration: 3600,
    icon: '✧',
    size: 'medium',
    copy: [
      ['You made room for yourself.', 'Your check-in is saved.'],
      ['A moment of attention.', 'Your check-in is recorded.'],
      ['Thanks for checking in.', 'Your entry is here to revisit.'],
      ['A little care, kept.', 'Your check-in has a place in your history.'],
    ],
  },
  'nutrition-daily': {
    duration: 2800,
    icon: '✓',
    size: 'small',
    copy: [
      ['A little nourishment, noted.', 'Your daily nutrition check is saved.'],
      ['A small check-in, kept.', 'Your nutrition note has a place here.'],
      ['You made a moment for this.', 'Your daily food check is recorded.'],
      ['One little check, complete.', 'Your nutrition check is ready to revisit.'],
    ],
  },
  'nutrition-assessment': {
    duration: 4800,
    icon: '✦',
    size: 'large',
    copy: [
      ['That took some thought.', 'Your nutrition assessment is complete and saved.'],
      ['Room for the bigger picture.', 'Your nutrition reflections are recorded.'],
      ['A thoughtful check-in, kept.', 'Your completed nutrition assessment is here to revisit.'],
      ['You gave this your attention.', 'Your nutrition assessment has a place in your history.'],
    ],
  },
  workday: {
    duration: 2800,
    icon: '✓',
    size: 'small',
    copy: [
      ['Day wrapped up.', 'Your workday is saved.'],
      ['Your effort, recorded.', 'This workday has a place in your history.'],
      ['One day, tucked away.', 'Your workday record is ready to revisit.'],
      ['A moment to mark the work.', 'Your day’s entry is saved.'],
    ],
  },
  'goal-complete': {
    duration: 4000,
    icon: '✧',
    size: 'medium',
    copy: [
      ['One goal, brought home.', 'Your completed goal is recorded.'],
      ['You followed it through.', 'Your goal is marked complete.'],
      ['A finish worth noting.', 'Your completed goal has a place in your history.'],
      ['A step you can look back on.', 'Your goal completion is saved.'],
    ],
  },
  import: {
    duration: 4000,
    icon: '↓',
    size: 'medium',
    copy: [
      ['Your history has landed.', 'Your import is complete.'],
      ['Brought together, ready to revisit.', 'Your imported records are saved.'],
      ['A little less scattered.', 'Your import has finished successfully.'],
      ['One more piece, in place.', 'Your imported data is ready.'],
    ],
  },
} as const

export function assessmentCelebrationFamily(key: string): CelebrationFamily {
  if (key.startsWith('mental_ipip')) return 'big-five'
  if (key.startsWith('mental_hb')) return 'quick'
  if (key.startsWith('mental_mensa') || key.startsWith('mental_testmybrain')) return 'reasoning'
  return 'check-in'
}

export function createCelebrationPicker() {
  const next = new Map<CelebrationFamily, number>()
  let id = 0
  return (family: CelebrationFamily) => {
    const definition = celebrationFamilies[family]
    const index = next.get(family) ?? 0
    next.set(family, (index + 1) % definition.copy.length)
    const [title, message] = definition.copy[index]
    return { id: ++id, kind: family, title, message, icon: definition.icon, duration: definition.duration }
  }
}

export const nextCelebration = createCelebrationPicker()
export type CelebrationEvent = ReturnType<typeof nextCelebration>

export interface NavigationLink {
  href: string
  label: string
  icon?: string
  description?: string
}

// Primary nav (top of the sidebar), the Sharing group, then the secondary nav.
// The three sharing surfaces (feed, dashboards, challenges) are grouped
// under one collapsible "Sharing" section (see Sidebar/Header) instead of being
// three flat siblings, so "Share" stops being an ambiguous top-level label.

export const NAV_LINKS_PRIMARY: NavigationLink[] = [
  { href: '/', label: 'Home', icon: '🏠', description: 'Your overview, dashboards and setup guide.' },
  { href: '/goals', label: 'Tasks', icon: '🎯', description: 'Organize tasks, goals and Kanban boards.' },
  { href: '/cpap', label: 'CPAP', icon: '😴', description: 'Import and review CPAP therapy history.' },
  { href: '/work', label: 'Work', icon: '💼', description: 'Track workdays, activity and performance.' },
  {
    href: '/resources',
    label: 'Resources',
    icon: '📚',
    description: 'Browse shared files, links and learning resources.',
  },
  {
    href: '/people',
    label: 'PEOPLE',
    icon: '👥',
    description: 'Track relationships, important dates and care reminders.',
  },
  {
    href: '/simple-food',
    label: 'Simple food',
    icon: '🥗',
    description: 'Quick nutrition check-ins and food reflections.',
  },
  {
    href: '/assessments',
    label: 'Mental assessments',
    icon: '🧠',
    description: 'Record questionnaires, personality scores and mental check-ins.',
  },
  {
    href: '/treatments',
    label: 'Treatments',
    icon: '💊',
    description: 'Manage treatments, supplements, routines and intake history.',
  },
  { href: '/timeline', label: 'Timeline', icon: '📅', description: 'Explore activity and events over time.' },
  { href: '/data', label: 'Data', icon: '📊', description: 'Browse your recorded metrics and activity.' },
  {
    href: '/meals',
    label: 'Meals',
    icon: '🍽',
    description: 'Log meals, ingredients and food sensitivities.',
  },
  { href: '/reports', label: 'Reports', icon: '📝', description: 'Record and review personal reports.' },
  { href: '/add', label: '+ Add', icon: '➕', description: 'Add measurements, tags and activities.' },
  { href: '/chart', label: 'Chart', icon: '📈', description: 'Plot measurements and compare trends.' },
]

export const SHARING_LINKS: NavigationLink[] = [
  { href: '/feed', label: 'Feed', icon: '📣', description: 'Read and share updates with people you follow.' },
  {
    href: '/dashboards',
    label: 'Dashboards',
    icon: '🔆',
    description: 'Create and share custom dashboards.',
  },
  { href: '/challenges', label: 'Challenges', icon: '🏆', description: 'Join and manage shared challenges.' },
]

export const SHARING_PATHS = SHARING_LINKS.map((l) => l.href)

export const isSharingActive = (url: string): boolean =>
  SHARING_PATHS.some((p) => url === p || url.startsWith(`${p}/`))

export const NAV_LINKS_SECONDARY: NavigationLink[] = [
  {
    href: '/correlations',
    label: 'Analyze',
    icon: '🔬',
    description: 'Explore relationships between your measurements.',
  },
  {
    href: '/places',
    label: 'Places',
    icon: '📍',
    description: 'Manage meaningful locations and location history.',
  },
  { href: '/routes', label: 'Routes', icon: '🗺', description: 'Explore recorded journeys and routes.' },
  {
    href: '/activity-types',
    label: 'Types',
    icon: '🏷',
    description: 'Organize activity and exercise categories.',
  },
  {
    href: '/deduction-rules',
    label: 'Rules',
    icon: '🔗',
    description: 'Configure rules that derive activities from recorded data.',
  },
]

export const DATA_SOURCE_LINKS: (Omit<NavigationLink, 'href'> & { path: string })[] = [
  {
    label: 'Overview',
    path: '/data-sources',
    icon: '📡',
    description: 'Connect devices, services and data sources.',
  },
  {
    label: 'Aurboda (Web / API)',
    path: '/data-sources/aurboda',
    description: 'Configure API access and optional AI assistant connections.',
  },
  {
    label: 'Aurboda Android',
    path: '/data-sources/android-app',
    description: 'Set up the Android companion and phone integrations.',
  },
  { label: 'Oura Ring', path: '/data-sources/oura', description: 'Connect and sync Oura Ring data.' },
  {
    label: 'Garmin Connect',
    path: '/data-sources/garmin',
    description: 'Connect and sync Garmin activity and health data.',
  },
  { label: 'Strava', path: '/data-sources/strava', description: 'Connect and sync Strava workouts.' },
  {
    label: 'ActivityWatch (Desktop)',
    path: '/data-sources/activitywatch-desktop',
    description: 'Set up computer usage tracking with ActivityWatch.',
  },
  {
    label: 'ActivityWatch (Android)',
    path: '/data-sources/activitywatch-android',
    description: 'Set up Android app usage tracking.',
  },
  {
    label: 'RescueTime',
    path: '/data-sources/rescue-time',
    description: 'Connect RescueTime productivity tracking.',
  },
  { label: 'Last.fm', path: '/data-sources/lastfm', description: 'Connect Last.fm listening history.' },
  { label: 'OwnTracks', path: '/data-sources/owntracks', description: 'Set up OwnTracks location tracking.' },
  {
    label: 'Calendars',
    path: '/data-sources/calendars',
    description: 'Connect calendar events through ICS feeds.',
  },
]

export const HELP_LINK: NavigationLink = {
  href: '/help',
  label: 'Help & support',
  icon: '❓',
  description: 'Find help, documentation and support options.',
}
export const ADMIN_LINK: NavigationLink = {
  href: '/admin',
  label: 'Admin',
  icon: '⚙️',
  description: 'Manage server administration and user accounts.',
}
export const SETTINGS_LINK: NavigationLink = {
  href: '/settings',
  label: 'Settings',
  icon: '⚙',
  description: 'Always available so you can restore hidden pages.',
}

const OTHER_PAGE_TITLES = [
  { href: '/shared-dashboards', label: 'Dashboards' },
  { href: '/data-sources', label: 'Data Sources' },
  { href: '/settings', label: 'Settings' },
  HELP_LINK,
  { href: '/admin', label: 'Admin' },
  { href: '/login', label: 'Login' },
  { href: '/signup', label: 'Sign up' },
]

const PAGE_TITLES: { href: string; title: string }[] = [
  ...NAV_LINKS_PRIMARY,
  ...SHARING_LINKS,
  ...NAV_LINKS_SECONDARY,
  ...DATA_SOURCE_LINKS.filter((l) => l.path !== '/data-sources').map((l) => ({
    href: l.path,
    label: l.label,
  })),
  ...OTHER_PAGE_TITLES,
].map((l) => ({ href: l.href, title: l.label.replace(/^\+\s*/, '') }))

/** The current page's name for the narrow top bar: the nav label of the route or its parent section. */
export const pageTitleForPath = (url: string): string => {
  const path = url.split(/[?#]/)[0].replace(/(.)\/+$/, '$1') || '/'
  const exact = PAGE_TITLES.find((p) => p.href === path)
  if (exact) return exact.title
  const section = PAGE_TITLES.filter((p) => p.href !== '/' && path.startsWith(`${p.href}/`)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0]
  return section?.title ?? 'Aurboda'
}

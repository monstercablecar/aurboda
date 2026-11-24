import {
  ADMIN_LINK,
  DATA_SOURCE_LINKS,
  HELP_LINK,
  NAV_LINKS_PRIMARY,
  NAV_LINKS_SECONDARY,
  type NavigationLink,
  SETTINGS_LINK,
  SHARING_LINKS,
} from './nav-links'

export interface SidebarEntry extends NavigationLink {
  key: string
  children?: NavigationLink[]
}

export function sidebarEntries(isAdmin: boolean): SidebarEntry[] {
  return [
    ...NAV_LINKS_PRIMARY.map((link) => ({ ...link, key: link.href })),
    { key: 'group:sharing', href: '', label: 'Sharing', icon: '🌐', children: SHARING_LINKS },
    ...NAV_LINKS_SECONDARY.map((link) => ({ ...link, key: link.href })),
    {
      key: 'group:data-sources',
      href: '',
      label: 'Data Sources',
      icon: '📡',
      children: DATA_SOURCE_LINKS.map(({ path, ...link }) => ({ ...link, href: path })),
    },
    ...(isAdmin ? [{ ...ADMIN_LINK, key: ADMIN_LINK.href }] : []),
    { ...HELP_LINK, key: HELP_LINK.href },
    { ...SETTINGS_LINK, key: SETTINGS_LINK.href },
  ]
}

export function orderSidebarEntries(entries: SidebarEntry[], saved: readonly string[] = []) {
  const byKey = new Map(entries.map((entry) => [entry.key, entry]))
  const keys = [...new Set([...saved, ...byKey.keys()])]
  return keys.flatMap((key) => (byKey.has(key) ? [byKey.get(key)!] : []))
}

export function moveSidebarEntry(keys: readonly string[], from: string, to: string) {
  if (from === to || !keys.includes(from) || !keys.includes(to)) return [...keys]
  const result = keys.filter((key) => key !== from)
  result.splice(keys.indexOf(to), 0, from)
  return result
}

export function savedSidebarOrder(previous: readonly string[], entries: readonly string[]) {
  return [...entries, ...previous.filter((key) => !entries.includes(key))]
}

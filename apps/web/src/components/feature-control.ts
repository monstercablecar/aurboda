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

export const pageKey = (path: string) => path.split(/[?#]/)[0].replace(/\/+$/, '') || '/'

export const isPageVisible = (path: string, hiddenPages: readonly string[] = []) =>
  pageKey(path) === '/settings' || !hiddenPages.some((hidden) => pageKey(hidden) === pageKey(path))

export const setPageVisibility = (hiddenPages: readonly string[], path: string, visible: boolean) => {
  const remaining = hiddenPages.filter((hidden) => pageKey(hidden) !== pageKey(path))
  return visible || pageKey(path) === '/settings' ? remaining : [...remaining, pageKey(path)]
}

export function featurePages(isAdmin: boolean): NavigationLink[] {
  const links = [
    ...NAV_LINKS_PRIMARY,
    ...SHARING_LINKS,
    ...NAV_LINKS_SECONDARY,
    ...DATA_SOURCE_LINKS.map(({ path, ...link }) => ({
      ...link,
      href: path,
      label: path === '/data-sources' ? 'Data Sources' : link.label,
    })),
    HELP_LINK,
    ...(isAdmin ? [ADMIN_LINK] : []),
    SETTINGS_LINK,
  ]
  return [...new Map(links.map((link) => [pageKey(link.href), link])).values()]
}

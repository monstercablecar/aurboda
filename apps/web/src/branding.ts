import { useEffect } from 'preact/hooks'

const PUBLIC_PATHS = ['/login', '/signup', '/privacy', '/terms', '/blog', '/challenges/join']

const normalizedPath = (url: string) => url.split(/[?#]/)[0].replace(/\/+$/, '') || '/'

export function brandForRoute(url: string, isLoggedIn: boolean) {
  const path = normalizedPath(url)
  const isPrivate = isLoggedIn && !PUBLIC_PATHS.includes(path) && path !== '/u' && !path.startsWith('/u/')
  return isPrivate
    ? { name: 'The Foghouse', mark: '/foghouse-mark.png', isPrivate }
    : { name: 'Aurboda', mark: '/logo.svg', isPrivate }
}

export function appContentClass(url: string) {
  return normalizedPath(url) === '/login' ? 'app-content login-theme' : 'app-content'
}

export function useBrandTitle(url: string, isLoggedIn: boolean) {
  const { name } = brandForRoute(url, isLoggedIn)
  useEffect(() => {
    document.title = name
  }, [name])
}

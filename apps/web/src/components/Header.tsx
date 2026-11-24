import { useLocation } from 'preact-iso'
import { useCallback, useEffect, useState } from 'preact/hooks'

import { auth, ensureStatusLoaded, logout, signupMode } from '../state/auth'
import { HELP_LINK, pageTitleForPath } from './nav-links'
import { NotificationBellLink } from './NotificationBell'
import { SidebarNavigation } from './SidebarNavigation'

// eslint-disable-next-line complexity -- navigation component with many branches
export function Header() {
  const { url } = useLocation()
  const isLoggedIn = auth.value.token
  const canSignup = signupMode.value === 'open'

  const [drawerOpen, setDrawerOpen] = useState(false)
  const handleLogout = (e: Event) => {
    e.preventDefault()
    logout()
  }

  const toggleDrawer = useCallback(() => setDrawerOpen((v) => !v), [])
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  useEffect(() => {
    if (!drawerOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [drawerOpen])

  useEffect(() => {
    setDrawerOpen(false)
  }, [url])

  useEffect(() => {
    if (!isLoggedIn) ensureStatusLoaded()
  }, [isLoggedIn])

  return (
    <header class="app-header">
      <nav class="nav-mobile">
        <button
          class="hamburger-btn"
          onClick={toggleDrawer}
          aria-label="Open navigation menu"
          aria-expanded={drawerOpen}
          type="button"
        >
          ☰
        </button>
        <a href="/" class="nav-mobile-brand" aria-label="Aurboda home">
          <img src="/logo.svg" alt="" width={28} height={28} />
        </a>
        <span class="nav-mobile-title">{pageTitleForPath(url)}</span>
        <span class="spacer" />
        {isLoggedIn && <NotificationBellLink />}
        {!isLoggedIn && canSignup && (
          <a href="/signup" class={`nav-mobile-home${url === '/signup' ? ' active' : ''}`}>
            Sign up
          </a>
        )}
      </nav>

      {drawerOpen && <div class="drawer-backdrop" onClick={closeDrawer} />}

      <nav class={`nav-drawer${drawerOpen ? ' open' : ''}`} aria-hidden={!drawerOpen}>
        <div class="drawer-header">
          <span class="drawer-title">Menu</span>
          <button class="drawer-close-btn" onClick={closeDrawer} aria-label="Close menu" type="button">
            ✕
          </button>
        </div>
        {isLoggedIn ? (
          <>
            <SidebarNavigation
              url={url}
              drawer
              onNavigate={closeDrawer}
              beforeReorganize={
                <a href="/settings" class="user-link" onClick={closeDrawer}>
                  {auth.value.user}
                </a>
              }
            />
            <a href="#" onClick={handleLogout} class="logout-link">
              Logout
            </a>
          </>
        ) : (
          <>
            <a href="/login" class={url === '/login' ? 'active' : undefined} onClick={closeDrawer}>
              Login
            </a>
            {canSignup && (
              <a href="/signup" class={url === '/signup' ? 'active' : undefined} onClick={closeDrawer}>
                Sign up
              </a>
            )}
            <a
              href={HELP_LINK.href}
              class={url === HELP_LINK.href ? 'active' : undefined}
              onClick={closeDrawer}
            >
              {HELP_LINK.label}
            </a>
          </>
        )}
      </nav>
    </header>
  )
}

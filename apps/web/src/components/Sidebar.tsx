import { useLocation } from 'preact-iso'
import { useEffect, useState } from 'preact/hooks'

import { auth, ensureStatusLoaded, logout, signupMode } from '../state/auth'
import { NotificationBellDropdown } from './NotificationBell'
import { SidebarNavigation } from './SidebarNavigation'
import './Sidebar.css'

const COLLAPSED_KEY = 'sidebar-collapsed'

// eslint-disable-next-line complexity -- navigation component with many conditional branches
export function Sidebar() {
  const { url } = useLocation()
  const isLoggedIn = auth.value.token
  const canSignup = signupMode.value === 'open'

  useEffect(() => {
    if (!isLoggedIn) ensureStatusLoaded()
  }, [isLoggedIn])

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === '1')
  const [editing, setEditing] = useState(false)

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
    // Notify charts/maps that layout changed
    setTimeout(() => window.dispatchEvent(new Event('resize')), 220)
  }

  const handleLogout = (e: Event) => {
    e.preventDefault()
    logout()
  }

  return (
    <aside class={`sidebar${collapsed && !editing ? ' collapsed' : ''}`}>
      <div class="sidebar-header">
        <a href="/" class="sidebar-brand" aria-label="Aurboda home">
          Aurboda
        </a>
        {isLoggedIn && <NotificationBellDropdown />}
        <button
          class="sidebar-toggle"
          onClick={toggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          type="button"
        >
          {collapsed ? '▶' : '◀'}
        </button>
      </div>

      <nav class="sidebar-nav">
        {isLoggedIn ? (
          <>
            <SidebarNavigation
              url={url}
              collapsed={collapsed}
              onEditingChange={setEditing}
              beforeReorganize={
                <a href="/settings" class="sidebar-link sidebar-account" title={auth.value.user}>
                  <span class="sidebar-icon">👤</span>
                  <span class="sidebar-label">{auth.value.user}</span>
                </a>
              }
            />
            <a href="#" class="sidebar-link" onClick={handleLogout}>
              <span class="sidebar-icon">🚪</span>
              <span class="sidebar-label">Logout</span>
            </a>
          </>
        ) : (
          <>
            <a
              href="/login"
              class={`sidebar-link${url === '/login' ? ' active' : ''}`}
              title={collapsed ? 'Login' : undefined}
            >
              <span class="sidebar-icon">🔑</span>
              <span class="sidebar-label">Login</span>
            </a>
            {canSignup && (
              <a
                href="/signup"
                class={`sidebar-link${url === '/signup' ? ' active' : ''}`}
                title={collapsed ? 'Sign up' : undefined}
              >
                <span class="sidebar-icon">✨</span>
                <span class="sidebar-label">Sign up</span>
              </a>
            )}
          </>
        )}
      </nav>
    </aside>
  )
}

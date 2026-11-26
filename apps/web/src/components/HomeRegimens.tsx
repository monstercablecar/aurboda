import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'preact/hooks'

import { localDateKey, treatmentUrl } from '../pages/Treatments/model'
import { fetchPharmacologyToday, fetchUserSettings } from '../state/api'
import { auth } from '../state/auth'
import { usePageVisibility } from './usePageVisibility'
import './HomeRegimens.css'

const localDay = () => ({
  date: localDateKey(),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
})

export function HomeRegimens() {
  const isPageVisible = usePageVisibility()
  const loggedIn = Boolean(auth.value.token)
  const settings = useQuery({
    enabled: loggedIn,
    queryFn: fetchUserSettings,
    queryKey: ['userSettings'],
  })
  const visible = settings.data !== undefined && isPageVisible('/treatments')
  const [{ date, timezone }, setDay] = useState(localDay)
  useEffect(() => {
    const refreshDay = () => {
      const next = localDay()
      setDay((previous) =>
        previous.date === next.date && previous.timezone === next.timezone ? previous : next,
      )
    }
    const timer = window.setInterval(refreshDay, 60_000)
    window.addEventListener('focus', refreshDay)
    document.addEventListener('visibilitychange', refreshDay)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshDay)
      document.removeEventListener('visibilitychange', refreshDay)
    }
  }, [])

  const plan = useQuery({
    enabled: loggedIn && visible,
    queryFn: () => fetchPharmacologyToday({ date, timezone }),
    queryKey: ['pharmacology', 'today', date, timezone],
    refetchInterval: 60_000,
    refetchOnWindowFocus: 'always',
  })
  if (!loggedIn || !visible) return null

  return (
    <section class="home-regimens" aria-labelledby="home-regimens-title">
      <h2 id="home-regimens-title">Regimens</h2>
      {plan.isLoading ? (
        <p role="status">Loading regimens…</p>
      ) : plan.isError ? (
        <div class="home-regimens-error" role="alert">
          <p>Regimens could not load.</p>
          <button class="btn-secondary" type="button" onClick={() => void plan.refetch()}>
            Try again
          </button>
        </div>
      ) : !plan.data?.due_regimens.length ? (
        <p>No regimens scheduled today.</p>
      ) : (
        <ul>
          {plan.data.due_regimens.map(({ regimen, state, confirmed_item_ids }) => {
            const active = regimen.items.filter((item) => !item.paused)
            const recorded =
              state === 'confirmed' || active.every((item) => confirmed_item_ids.includes(item.id))
            return (
              <li key={regimen.id}>
                <strong>{regimen.name}</strong>
                {active.length === 0 ? (
                  <span class="home-regimens-state">Paused</span>
                ) : recorded ? (
                  <span class="home-regimens-state">Recorded</span>
                ) : (
                  <a
                    class="btn-primary"
                    aria-label={`Review ${regimen.name}`}
                    href={treatmentUrl({}, { view: 'today', action: 'confirm', regimen: regimen.id, date })}
                  >
                    Review
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

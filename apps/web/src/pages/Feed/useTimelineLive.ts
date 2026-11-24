import { useEffect, useRef } from 'preact/hooks'

import { subscribeLiveEvents } from '../../state/live-events'
export const useTimelineLive = (onPing: () => void): void => {
  const current = useRef(onPing)
  current.current = onPing
  useEffect(() => subscribeLiveEvents(() => current.current()), [])
}

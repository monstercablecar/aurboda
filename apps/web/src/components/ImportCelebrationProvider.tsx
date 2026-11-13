import type { ComponentChildren } from 'preact'

import { createContext } from 'preact'
import { useContext, useState } from 'preact/hooks'

import { Celebration } from './Celebration'
import { nextCelebration, type CelebrationEvent } from './celebration-catalog'
const ImportCelebrationContext = createContext<() => void>(() => {})
export const useImportCelebration = () => useContext(ImportCelebrationContext)
export function ImportCelebrationProvider({ children }: { children: ComponentChildren }) {
  const [event, setEvent] = useState<CelebrationEvent | null>(null)
  return (
    <ImportCelebrationContext.Provider value={() => setEvent(nextCelebration('import'))}>
      {children}
      {event && <Celebration key={event.id} {...event} onDone={() => setEvent(null)} />}
    </ImportCelebrationContext.Provider>
  )
}

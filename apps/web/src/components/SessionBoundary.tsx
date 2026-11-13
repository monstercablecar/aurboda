import type { ComponentChildren } from 'preact'

import { QueryClientProvider } from '@tanstack/react-query'

import { querySession } from '../state/queryClient'
import { ImportCelebrationProvider } from './ImportCelebrationProvider'

export function SessionBoundary({ children }: { children: ComponentChildren }) {
  const session = querySession.value
  return (
    <QueryClientProvider key={session.generation} client={session.client}>
      <ImportCelebrationProvider>{children}</ImportCelebrationProvider>
    </QueryClientProvider>
  )
}

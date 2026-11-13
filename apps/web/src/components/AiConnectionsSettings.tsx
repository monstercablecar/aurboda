import type { OAuthConnectionsResponse } from '@aurboda/api-spec'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'preact/hooks'

import { apiErrorMessage } from '../state/api/feed'
import { fetchOAuthConnections, revokeOAuthConnection } from '../state/api/oauth-connections'
import { auth } from '../state/auth'
import { SettingsSection } from './SettingsSection'

const permissionLabel = (scope: string | null): string => {
  if (scope === 'read') return 'Read-only analysis'
  if (scope === 'read write') return 'Read and write'
  if (scope === null) return 'Legacy full access — reconnect for read-only'
  return 'Unrecognized permissions — reconnect to review access'
}

const combineConnections = (connections: OAuthConnectionsResponse['connections']) => {
  const clients = new Map<string, OAuthConnectionsResponse['connections'][number]>()
  for (const connection of connections) {
    const existing = clients.get(connection.client_id)
    if (
      !existing ||
      (existing.scope !== null && (connection.scope === null || connection.scope === 'read write'))
    ) {
      clients.set(connection.client_id, connection)
    }
  }
  return [...clients.values()]
}

export function AiConnectionsSettings() {
  const queryClient = useQueryClient()
  const pending = useRef(false)
  const connections = useQuery({
    enabled: !!auth.value.token,
    queryFn: ({ signal }) => fetchOAuthConnections(signal),
    queryKey: ['oauthConnections'],
    retry: false,
  })
  const revoke = useMutation({
    mutationFn: (client_id: string) => revokeOAuthConnection({ client_id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['oauthConnections'] }),
  })
  const revokeAccess = (clientId: string) => {
    if (pending.current) return
    pending.current = true
    revoke.mutate(clientId, {
      onSettled: () => {
        pending.current = false
      },
    })
  }

  return (
    <SettingsSection
      title="AI and MCP connections"
      description="Optional access for your own AI client or integration."
    >
      <p class="field-description">
        Add this server's /mcp address in your AI client's connection settings. New authorizations default to
        read-only analysis; allowing edits requires an explicit read-and-write choice. No AI provider
        connection is required to use Aurboda.
      </p>
      <p class="field-description">
        Revoking a connection stops later requests and token refreshes. It cannot recall information already
        retrieved by the client or provider, and does not revoke separate browser or API tokens.
      </p>
      {connections.isLoading && (
        <p class="loading" role="status">
          Loading connections…
        </p>
      )}
      {connections.isError && (
        <div role="alert">
          <p>{apiErrorMessage(connections.error, 'Could not load connections. Try again.')}</p>
          <button type="button" disabled={connections.isFetching} onClick={() => connections.refetch()}>
            Retry
          </button>
        </div>
      )}
      {connections.data &&
        !connections.isError &&
        (connections.data.connections.length === 0 ? (
          <p class="no-data">No active AI or MCP connections.</p>
        ) : (
          <ul>
            {combineConnections(connections.data.connections).map((connection) => (
              <li key={connection.client_id}>
                <strong>{connection.client_name}</strong> — {permissionLabel(connection.scope)}{' '}
                <button
                  type="button"
                  disabled={revoke.isPending}
                  onClick={() => revokeAccess(connection.client_id)}
                >
                  {revoke.isPending && revoke.variables === connection.client_id
                    ? 'Revoking…'
                    : 'Revoke access'}
                </button>
              </li>
            ))}
          </ul>
        ))}
      {revoke.isError && (
        <p role="alert">{apiErrorMessage(revoke.error, 'Could not revoke access. Try again.')}</p>
      )}
    </SettingsSection>
  )
}

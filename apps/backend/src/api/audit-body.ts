/** Only fixed structural metadata is retained; never inspect nested values or emit caller-owned keys. */
export const summarizeAuditBody = (body: unknown): Record<string, unknown> | undefined => {
  if (body === undefined) return undefined
  if (body === null) return { body_type: 'null' }
  if (Array.isArray(body)) return { body_type: 'array', item_count: body.length }
  if (typeof body === 'object') return { body_type: 'object', field_count: Object.keys(body).length }
  return { body_type: typeof body }
}

export const auditOperation = (method: string, routePath: unknown): string =>
  `${method} ${typeof routePath === 'string' ? routePath : 'unmatched route'}`

/** Error messages, names, SQL diagnostics and custom properties may contain user input. */
export const summarizeAuditError = (error: unknown): Record<string, unknown> => ({
  error_type: error instanceof Error ? 'error' : 'unknown',
})

export const MAX_MCP_BATCH_MESSAGES = 20
// A full 10,000-point metric import uses about 50,000 elements.
export const MAX_MCP_INPUT_ELEMENTS = 100_000
export const MAX_MCP_INPUT_DEPTH = 64

/** Bounds work before argument trimming, schema validation and tool dispatch. */
export const mcpRequestLimitError = (body: unknown): string | undefined => {
  if (Array.isArray(body) && body.length > MAX_MCP_BATCH_MESSAGES) {
    return `Request exceeds ${MAX_MCP_BATCH_MESSAGES} messages`
  }
  const pending = [{ value: body, depth: 0 }]
  let elements = 1
  while (pending.length) {
    const { value, depth } = pending.pop()!
    if (value === null || typeof value !== 'object') continue
    if (depth >= MAX_MCP_INPUT_DEPTH) return 'Request nesting is too deep'
    for (const child of Object.values(value)) {
      if (++elements > MAX_MCP_INPUT_ELEMENTS) return 'Request has too many elements'
      pending.push({ value: child, depth: depth + 1 })
    }
  }
  return undefined
}

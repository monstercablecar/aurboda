/** Legacy health-goal links must keep their meaning, including history-close URLs. */
export const showHealthGoals = (query: Record<string, string | undefined>) =>
  query.tab === 'health' || !!query.history || !!query.new || !!query.range || query.embed === '1'

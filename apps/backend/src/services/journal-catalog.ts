import { type JournalWorkbookDefinition, journalWorkbookDefinitionSchema } from '@aurboda/api-spec'
import { readFileSync } from 'node:fs'

// Prose is separately licensed; see journal-content/licenses.json and docs/journal-content.md.
// Load only the checked-in asset. Catalog use makes no network or model requests.
const definitions: unknown = JSON.parse(
  readFileSync(new URL('./journal-content/catalog.json', import.meta.url), 'utf8'),
)

export const JOURNAL_CATALOG: JournalWorkbookDefinition[] = journalWorkbookDefinitionSchema
  .array()
  .parse(definitions)

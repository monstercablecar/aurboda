import { type JournalWorkbookDefinition, journalWorkbookDefinitionSchema } from '@aurboda/api-spec'
import { readFileSync } from 'node:fs'
import { z } from 'zod'

// Prose is separately licensed; see journal-content/licenses.json and docs/journal-content.md.
// Load only the checked-in assets. Catalog use makes no network or model requests.
const definitions = journalWorkbookDefinitionSchema
  .array()
  .parse(JSON.parse(readFileSync(new URL('./journal-content/catalog.json', import.meta.url), 'utf8')))
const manifest = z
  .object({
    content_author: z.string().min(1),
    entries: z.array(
      z.object({
        id: z.string().min(1),
        content_license: z.string().min(1),
        content_license_url: z.url(),
        source_url: z.url(),
      }),
    ),
  })
  .parse(JSON.parse(readFileSync(new URL('./journal-content/licenses.json', import.meta.url), 'utf8')))
const licenses = new Map(manifest.entries.map((entry) => [entry.id, entry]))
const definitionIds = new Set(definitions.map((definition) => definition.id))
if (
  licenses.size !== manifest.entries.length ||
  definitionIds.size !== definitions.length ||
  licenses.size !== definitions.length ||
  [...licenses.keys()].some((id) => !definitionIds.has(id))
) {
  throw new Error('Journal content license manifest must match catalog IDs exactly')
}

export const JOURNAL_CATALOG: JournalWorkbookDefinition[] = definitions.map((definition) => {
  const license = licenses.get(definition.id)
  if (!license || license.source_url !== definition.source.url) {
    throw new Error(`Journal content license attribution mismatch: ${definition.id}`)
  }
  return journalWorkbookDefinitionSchema.parse({
    ...definition,
    source: {
      ...definition.source,
      content_author: manifest.content_author,
      content_license: license.content_license,
      content_license_url: license.content_license_url,
    },
  })
})

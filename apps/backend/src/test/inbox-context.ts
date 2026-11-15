/**
 * A Fedify inbox context for tests, plus the stub fediverse it reads from.
 *
 * Inbox listeners run only after Fedify has verified the HTTP signature, so
 * forging a signed request in a test would exercise Fedify rather than us: the
 * tests call the exported `handleInbound*` entry points directly, with a real
 * context (so `parseUri` still resolves our own object URLs) wearing the
 * `recipient` a personal-inbox delivery carries.
 *
 * The document loader is stubbed so that every dereference — the actor documents
 * the ingest paths fetch by id, a bare-URI `object` — is served from a fixture
 * instead of the network. That is the point of most of these tests: an id that
 * serves nothing must behave differently from one that serves a real document.
 */
import type { Federation, InboxContext } from '@fedify/fedify'

/** The fediverse a test makes available, keyed by document URL. */
export type StubDocuments = Record<string, unknown>

/** A document loader serving exactly `docs`; every other URL throws (nothing lives there). */
export const stubDocumentLoader =
  (docs: StubDocuments) =>
  async (url: string): Promise<{ contextUrl: null; document: unknown; documentUrl: string }> => {
    const document = docs[url]
    if (document == null) throw new Error(`stub loader has no document for ${url}`)
    return { contextUrl: null, document, documentUrl: url }
  }

/** An actor document as its own server would serve it. */
export const actorDocument = (id: string, username: string, name: string): Record<string, unknown> => ({
  '@context': 'https://www.w3.org/ns/activitystreams',
  id,
  inbox: `${id}/inbox`,
  name,
  preferredUsername: username,
  type: 'Person',
})

export const inboxContext = (
  federation: Federation<void>,
  origin: string,
  user: string,
  docs: StubDocuments = {},
): InboxContext<void> => {
  const base = federation.createContext(new URL(origin), undefined)
  const loader = stubDocumentLoader(docs)
  // Keep the real instance as `this`: Fedify's routing methods use private fields.
  // Override only document loading; its bundled context loader stays intact.
  return Object.assign(base, {
    recipient: user,
    documentLoader: loader,
    getDocumentLoader: async () => loader,
  }) as unknown as InboxContext<void>
}

import type {
  CreateJournalEntryBody,
  JournalEntry,
  JournalArea,
  JournalTemplate,
  JournalWorkbookDefinition,
  JournalAttachment,
  JournalRevision,
  JournalEntriesQuery,
} from '@aurboda/api-spec'

import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { useLocation } from 'preact-iso'
import { useEffect, useRef, useState } from 'preact/hooks'

import { journalApi } from '../../state/api/journal'
import { auth } from '../../state/auth'
import { AudioRecorder, AttachmentView } from './Audio'
import { JournalDraft, blankEntry, entryFields } from './drafts'
import './journal.css'

const download = (name: string, data: string, type: string) => {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const markdown = (entry: CreateJournalEntryBody) => {
  const heading = `# ${entry.title || 'Untitled entry'}\n\n${entry.occurred_at}\n\n${entry.content}`
  if (!entry.workbook) return heading
  const { definition, answers } = entry.workbook
  const source = definition.source
  const sections = definition.sections
    .map(
      (section) =>
        `## ${section.title}\n\n${section.introduction}\n\n${section.prompts.map((prompt) => `### ${prompt.label}\n\n${answers[prompt.id] ?? ''}`).join('\n\n')}`,
    )
    .join('\n\n')
  const credit = [
    `Source / recommended reading: ${source.title} — ${source.author}`,
    source.url,
    `Source license: ${source.license} — ${source.license_url}`,
    source.adaptation,
    source.exclusions,
    source.content_author ? `Companion text: ${source.content_author}` : '',
    source.content_license
      ? `Companion license: ${source.content_license} — ${source.content_license_url}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n')
  return `${heading}\n\n${sections}\n\n${credit}`
}
const localDate = (iso: string) => {
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

const currentSection = (workbook: NonNullable<JournalEntry['workbook']>) =>
  workbook.definition.sections.find((s) => s.id === workbook.current_section) ??
  workbook.definition.sections[0]
function Editor({
  initial,
  areas,
  record,
  onSaved,
  onClose,
}: {
  initial: JournalEntry | CreateJournalEntryBody
  areas: JournalArea[]
  record: boolean
  onSaved: () => void
  onClose: () => void
}) {
  const [, render] = useState(0)
  const [draft] = useState(
    () =>
      new JournalDraft(initial, () => render((x) => x + 1), 'updated_at' in initial ? initial : undefined),
  )
  const [preview, setPreview] = useState(false)
  const [attachments, setAttachments] = useState<JournalAttachment[]>([])
  const [revisions, setRevisions] = useState<JournalRevision[]>([])
  const [error, setError] = useState('')
  const pendingMedia = useRef(new Set<string>())
  const mediaPending = (key: string, pending: boolean) => {
    if (pending) pendingMedia.current.add(key)
    else pendingMedia.current.delete(key)
  }
  const textarea = useRef<HTMLTextAreaElement>(null)
  const value = draft.value
  const edit = (patch: Partial<CreateJournalEntryBody>) => draft.edit({ ...draft.value, ...patch })
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (draft.dirty || pendingMedia.current.size) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    const online = () => {
      if (draft.dirty) void draft.flush()
    }
    const navigate = (event: MouseEvent) => {
      const target = event.target
      if (
        !(target instanceof Element) ||
        !target.closest('a[href]') ||
        (!draft.dirty && !pendingMedia.current.size)
      ) {
        return
      }
      if (
        !confirm(
          pendingMedia.current.size
            ? 'Unsaved media will be lost. Download it before leaving, or leave anyway?'
            : 'Leave this entry? Unsaved text remains as a local draft.',
        )
      ) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    document.addEventListener('click', navigate, true)
    window.addEventListener('beforeunload', warn)
    window.addEventListener('online', online)
    if (draft.server) {
      void journalApi
        .attachments(draft.server.id)
        .then(setAttachments)
        .catch(() => setError('Could not load attachments.'))
    }
    return () => {
      document.removeEventListener('click', navigate, true)
      draft.dispose()
      window.removeEventListener('beforeunload', warn)
      window.removeEventListener('online', online)
    }
  }, [draft])
  const action = async (fn: () => Promise<unknown>) => {
    setError('')
    try {
      await fn()
    } catch {
      setError('That change could not be saved. Please retry.')
    }
  }
  const upload = async (file: File, promptId?: string) => {
    const saved = await draft.flush()
    if (!saved) throw new Error('Save the entry before attaching a file.')
    const attachment = await journalApi.upload(saved.id, file, promptId)
    setAttachments((a) => [...a, attachment])
    onSaved()
  }
  const wrap = (before: string, after = '') => {
    const el = textarea.current
    const start = el?.selectionStart ?? value.content.length
    const end = el?.selectionEnd ?? start
    edit({
      content:
        value.content.slice(0, start) +
        before +
        value.content.slice(start, end) +
        after +
        value.content.slice(end),
    })
    el?.focus()
  }
  const workbook = value.workbook
  const section = workbook ? currentSection(workbook) : undefined
  return (
    <section class="journal-editor">
      <div
        class="journal-print"
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(marked.parse(markdown(value), { async: false })),
        }}
      />
      <div class="journal-row">
        <span class="journal-eyebrow">
          {workbook ? 'Guided reflection' : 'A little room for your thoughts'}
        </span>
        <button
          onClick={() => {
            if (
              (!draft.dirty && !pendingMedia.current.size) ||
              confirm(
                pendingMedia.current.size
                  ? 'Unsaved audio or images will be lost. Download them first, or leave anyway?'
                  : 'Leave this entry? Unsaved text remains as a local draft on this browser.',
              )
            ) {
              onClose()
            }
          }}
        >
          Close
        </button>
      </div>
      <input
        class="journal-title"
        aria-label="Entry title"
        maxLength={200}
        placeholder="A title, if you like"
        value={value.title}
        onInput={(e) => edit({ title: e.currentTarget.value })}
      />
      <div class="journal-row">
        <label>
          Date{' '}
          <input
            type="datetime-local"
            value={localDate(value.occurred_at)}
            onChange={(e) => {
              if (e.currentTarget.value) edit({ occurred_at: new Date(e.currentTarget.value).toISOString() })
            }}
          />
        </label>
        <label>
          Area{' '}
          <select
            value={value.area_id ?? ''}
            onChange={(e) => edit({ area_id: e.currentTarget.value || null })}
          >
            <option value="">General</option>
            {areas
              .filter((a) => !a.archived || a.id === value.area_id)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
        <span role="status">{draft.status}</span>
        <button
          onClick={() =>
            void action(async () => {
              await draft.flush()
              onSaved()
            })
          }
        >
          Save now
        </button>
      </div>
      {draft.recovered && (
        <p class="journal-notice">Recovered text from this browser. Review it, then save when ready.</p>
      )}
      {draft.status === 'Conflict' && (
        <div role="alert" class="journal-notice">
          This entry changed elsewhere. Your text is safe here.
          <button
            onClick={() => {
              if (confirm('Replace your local draft with the saved version?')) {
                void action(() => draft.reload())
              }
            }}
          >
            Reload saved version
          </button>
          <button onClick={() => void action(() => draft.saveCopy())}>
            Save my text as a separate entry
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {workbook && section && (
        <div class="journal-workbook">
          <h2>{workbook.definition.title}</h2>
          <nav class="journal-row" aria-label="Workbook sections">
            {workbook.definition.sections.map((s) => (
              <button
                class={s.id === section.id ? 'selected' : ''}
                onClick={() => {
                  if (
                    pendingMedia.current.size &&
                    !confirm(
                      'Changing sections will discard unsaved recordings in this section. Download or save them first, or continue anyway?',
                    )
                  ) {
                    return
                  }
                  edit({ workbook: { ...workbook, current_section: s.id } })
                }}
              >
                {workbook.completed_sections.includes(s.id) ? '✓ ' : ''}
                {s.title}
              </button>
            ))}
          </nav>
          <h3>{section.title}</h3>
          <p>{section.introduction}</p>
          {section.prompts.map((p) => (
            <div class="journal-prompt" key={p.id}>
              <label>
                {p.label}
                {p.optional && <small> Optional</small>}
                <textarea
                  value={workbook.answers[p.id] ?? ''}
                  onInput={(e) =>
                    edit({
                      workbook: {
                        ...workbook,
                        answers: { ...workbook.answers, [p.id]: e.currentTarget.value },
                      },
                    })
                  }
                />
              </label>
              {p.help && <p>{p.help}</p>}
              <details>
                <summary>Record an answer</summary>
                <AudioRecorder
                  onSave={upload}
                  promptId={p.id}
                  onPendingChange={(pending) => mediaPending(p.id, pending)}
                />
              </details>
            </div>
          ))}
          <label>
            <input
              type="checkbox"
              checked={workbook.completed_sections.includes(section.id)}
              onChange={(e) =>
                edit({
                  workbook: {
                    ...workbook,
                    completed_sections: e.currentTarget.checked
                      ? [...new Set([...workbook.completed_sections, section.id])]
                      : workbook.completed_sections.filter((id) => id !== section.id),
                  },
                })
              }
            />{' '}
            Section complete
          </label>
          <label>
            Progress{' '}
            <select
              value={workbook.status}
              onChange={(e) =>
                edit({
                  workbook: {
                    ...workbook,
                    status: e.currentTarget.value as 'in_progress' | 'completed' | 'archived',
                  },
                })
              }
            >
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <Source definition={workbook.definition} />
        </div>
      )}
      <div class="journal-toolbar" aria-label="Formatting">
        {[
          ['Heading', '## ', ''],
          ['Bold', '**', '**'],
          ['Italic', '*', '*'],
          ['List', '\n- ', ''],
          ['Quote', '\n> ', ''],
          ['Link', '[', '](https://)'],
        ].map(([label, before, after]) => (
          <button onClick={() => wrap(before, after)}>{label}</button>
        ))}
        <button onClick={() => setPreview(!preview)}>{preview ? 'Edit' : 'Preview'}</button>
      </div>
      {preview ? (
        <div
          class="journal-preview"
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(marked.parse(value.content, { async: false })),
          }}
        />
      ) : (
        <textarea
          ref={textarea}
          class="journal-writing"
          aria-label="Journal text"
          placeholder="Start wherever you are…"
          value={value.content}
          maxLength={200000}
          onInput={(e) => edit({ content: e.currentTarget.value })}
        />
      )}
      <label>
        Tags, separated by commas{' '}
        <input
          value={value.tags.join(', ')}
          onChange={(e) =>
            edit({
              tags: [
                ...new Set(
                  e.currentTarget.value
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean),
                ),
              ].slice(0, 30),
            })
          }
        />
      </label>
      <div class="journal-row">
        {(['favorite', 'pinned', 'resurface'] as const).map((field) => (
          <label>
            <input
              type="checkbox"
              checked={value[field]}
              onChange={(e) => edit({ [field]: e.currentTarget.checked })}
            />
            {field === 'resurface' ? 'Allow memories' : field === 'pinned' ? 'Pin' : 'Favorite'}
          </label>
        ))}
      </div>
      <details open={record}>
        <summary>Audio & images</summary>
        <p>
          Record a thought or attach an image. Audio stays on this device until you save it. No transcription
          is performed.
        </p>
        <AudioRecorder onSave={upload} onPendingChange={(pending) => mediaPending('entry', pending)} />
        {attachments.map((a) => (
          <AttachmentView
            key={a.id}
            attachment={a}
            onDelete={async () => {
              await journalApi.deleteAttachment(a.id)
              setAttachments((items) => items.filter((x) => x.id !== a.id))
            }}
          />
        ))}
      </details>
      <details>
        <summary>Related records</summary>
        <p>Link records from your account by their ID.</p>
        {value.links.map((link, i) => (
          <div class="journal-row">
            <select
              value={link.kind}
              onChange={(e) =>
                edit({
                  links: value.links.map((l, j) =>
                    j === i ? { ...l, kind: e.currentTarget.value as typeof link.kind } : l,
                  ),
                })
              }
            >
              {['person', 'questionnaire', 'event', 'entry'].map((k) => (
                <option>{k}</option>
              ))}
            </select>
            <input
              aria-label="Record ID"
              value={link.record_id}
              onChange={(e) =>
                edit({
                  links: value.links.map((l, j) =>
                    j === i ? { ...l, record_id: e.currentTarget.value } : l,
                  ),
                })
              }
            />
            <input
              aria-label="Link label"
              value={link.label}
              onInput={(e) =>
                edit({
                  links: value.links.map((l, j) => (j === i ? { ...l, label: e.currentTarget.value } : l)),
                })
              }
            />
            <button onClick={() => edit({ links: value.links.filter((_, j) => j !== i) })}>Remove</button>
          </div>
        ))}
        <button
          onClick={() => {
            const id = prompt('Record ID')
            if (id?.trim()) {
              edit({ links: [...value.links, { kind: 'entry', record_id: id.trim(), label: '' }] })
            }
          }}
        >
          Add link
        </button>
      </details>
      <div class="journal-row">
        <button
          onClick={() =>
            void action(async () => {
              const title = prompt('Template name', value.title)
              if (title?.trim()) await journalApi.createTemplate({ title, content: value.content })
            })
          }
        >
          Save text as template
        </button>
        <button
          onClick={() =>
            void action(async () => {
              const saved = await draft.flush()
              if (saved) setRevisions(await journalApi.revisions(saved.id))
            })
          }
        >
          Previous versions
        </button>
        <button onClick={() => window.print()}>Print / Save as PDF</button>
        {draft.server && (
          <button
            onClick={() =>
              void action(async () => {
                if (
                  !confirm(draft.server?.deleted_at ? 'Restore this entry?' : 'Move this entry to trash?')
                ) {
                  return
                }
                const saved = await draft.flush()
                if (!saved) return
                await journalApi.update(saved.id, {
                  expected_updated_at: saved.updated_at,
                  deleted: !saved.deleted_at,
                })
                onSaved()
                onClose()
              })
            }
          >
            {draft.server.deleted_at ? 'Restore entry' : 'Move to trash'}
          </button>
        )}
        {draft.server?.deleted_at && (
          <button
            onClick={() =>
              void action(async () => {
                if (
                  confirm('Permanently delete this entry and all its attachments? This cannot be undone.')
                ) {
                  if (draft.server) await journalApi.deleteEntry(draft.server)
                  onSaved()
                  onClose()
                }
              })
            }
          >
            Delete forever
          </button>
        )}
      </div>
      {revisions.map((r) => (
        <div class="journal-row">
          <span>{new Date(r.created_at).toLocaleString()}</span>
          <button
            onClick={() => {
              if (confirm('Restore this version? The current version will remain in history.')) {
                edit(entryFields(r.snapshot))
              }
            }}
          >
            Restore version
          </button>
        </div>
      ))}
    </section>
  )
}
function Source({ definition }: { definition: JournalWorkbookDefinition }) {
  const s = definition.source
  return (
    <aside class="journal-source">
      Source / recommended reading:{' '}
      <a href={s.url} target="_blank" rel="noreferrer">
        {s.title}
      </a>{' '}
      by {s.author}.{' '}
      <a href={s.license_url} target="_blank" rel="noreferrer">
        {s.license}
      </a>
      <p>{s.adaptation}</p>
      {s.exclusions && <p>{s.exclusions}</p>}
      {s.content_author && <p>Companion text: {s.content_author}</p>}
      {s.content_license && (
        <p>
          Companion license:{' '}
          <a href={s.content_license_url} target="_blank" rel="noreferrer">
            {s.content_license}
          </a>
        </p>
      )}
    </aside>
  )
}

// The route renders independent optional filters and panels; callbacks own their transitions.
// eslint-disable-next-line complexity
export function Journal() {
  const location = useLocation()
  const [areas, setAreas] = useState<JournalArea[]>([])
  const [templates, setTemplates] = useState<JournalTemplate[]>([])
  const [catalog, setCatalog] = useState<JournalWorkbookDefinition[]>([])
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState<Partial<JournalEntriesQuery>>({
    page: 1,
    per_page: 20,
    deleted: 'false',
    area_id: new URLSearchParams(window.location.search).get('area') || undefined,
  })
  const [editor, setEditor] = useState<JournalEntry | CreateJournalEntryBody>()
  const [record, setRecord] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [memories, setMemories] = useState<JournalEntry[] | null>(null)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [category, setCategory] = useState('')
  const [audience, setAudience] = useState('')
  const [format, setFormat] = useState('')
  const prompted = location.path === '/journal/prompted'
  const refresh = () => setReload((n) => n + 1)
  const action = async (fn: () => Promise<unknown>) => {
    setError('')
    setBusy(true)
    try {
      await fn()
    } catch {
      setError('Could not complete that request. Check your connection and retry.')
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    let active = true
    void Promise.all([journalApi.areas(), journalApi.templates(), journalApi.catalog()])
      .then(([a, t, c]) => {
        if (active) {
          setAreas(a)
          setTemplates(t)
          setCatalog(c)
        }
      })
      .catch(() => {
        if (active) setError('Could not load journal settings.')
      })
    return () => {
      active = false
    }
  }, [reload])
  useEffect(() => {
    let active = true
    setBusy(true)
    void journalApi
      .entries(query)
      .then((r) => {
        if (active) {
          setEntries(r.data)
          setTotal(r.total)
        }
      })
      .catch(() => {
        if (active) setError('Could not load entries. Please retry.')
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [query, reload])
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('entry')
    if (id) void action(async () => setEditor(await journalApi.entry(id)))
    else if (params.get('new') === '1') {
      const kind = params.get('source_kind')
      const record_id = params.get('source_id')
      const entry = blankEntry()
      if (
        record_id &&
        record_id.length <= 200 &&
        (kind === 'person' || kind === 'questionnaire' || kind === 'event')
      ) {
        entry.links = [
          {
            kind,
            record_id,
            label:
              kind === 'person'
                ? 'Related person'
                : kind === 'questionnaire'
                  ? 'Related assessment'
                  : 'Related event',
          },
        ]
      }
      setEditor(entry)
    }
  }, [])
  const filter = (patch: Partial<JournalEntriesQuery>) => {
    setQuery((q) => ({ ...q, ...patch, page: 1 }))
    setSelected([])
  }
  const allEntries = async () => {
    const result: JournalEntry[] = []
    let page = 1
    while (true) {
      const response = await journalApi.entries({ ...query, page, per_page: 100 })
      result.push(...response.data)
      if (result.length >= response.total || !response.data.length) return result
      page++
    }
  }
  const findMemories = () =>
    action(async () => {
      const today = new Date()
      const matches: JournalEntry[] = []
      let page = 1
      while (true) {
        const response = await journalApi.entries({
          page,
          per_page: 100,
          deleted: 'false',
          to: new Date(today.getFullYear(), 0, 1).toISOString(),
        })
        matches.push(
          ...response.data.filter((entry) => {
            const day = new Date(entry.occurred_at)
            return (
              entry.resurface &&
              day.getFullYear() < today.getFullYear() &&
              day.getMonth() === today.getMonth() &&
              day.getDate() === today.getDate()
            )
          }),
        )
        if (page * 100 >= response.total || !response.data.length) break
        page++
      }
      setMemories(matches)
    })
  const exportEntries = (type: 'json' | 'markdown' | 'archive', onlySelected = false) =>
    action(async () => {
      const items = onlySelected
        ? await Promise.all(selected.map((id) => journalApi.entry(id)))
        : await allEntries()
      if (type === 'markdown') {
        download('journal.md', items.map(markdown).join('\n\n---\n\n'), 'text/markdown')
      } else {
        const attachmentData =
          type === 'archive'
            ? await Promise.all(
                items.map(async (e) => ({
                  entry_id: e.id,
                  attachments: await Promise.all(
                    (await journalApi.attachments(e.id)).map(async (a) => {
                      const blob = await journalApi.attachmentBlob(a.id)
                      const data = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader()
                        reader.onload = () => resolve(String(reader.result))
                        reader.onerror = reject
                        reader.readAsDataURL(blob)
                      })
                      return { ...a, data }
                    }),
                  ),
                })),
              )
            : undefined
        download(
          type === 'archive' ? 'journal-with-media.json' : 'journal.json',
          JSON.stringify({ entries: items, attachments: attachmentData }, null, 2),
          'application/json',
        )
      }
    })
  if (!auth.value.token) {
    return (
      <div class="journal">
        <h1>Journal</h1>
        <p>
          <a href="/login">Sign in</a> to open your private writing space.
        </p>
      </div>
    )
  }
  return (
    <div class="journal">
      <header class="journal-header">
        <div>
          <p class="journal-eyebrow">YOUR PRIVATE WRITING SPACE</p>
          <h1>Journal</h1>
          <p>Notice a little. Keep what matters.</p>
        </div>
        <div class="journal-row">
          <button
            disabled={Boolean(editor)}
            onClick={() => {
              setRecord(false)
              setEditor(blankEntry(query.area_id && query.area_id !== 'general' ? query.area_id : null))
            }}
          >
            ✎ Write
          </button>
          <button
            disabled={Boolean(editor)}
            onClick={() => {
              setRecord(true)
              setEditor(blankEntry())
            }}
          >
            ◉ Record
          </button>
          <a class={prompted ? 'selected' : ''} href="/journal/prompted">
            Prompted journals
          </a>
        </div>
      </header>
      {error && (
        <p role="alert" class="journal-notice">
          {error} <button onClick={refresh}>Retry</button>
        </p>
      )}
      {editor ? (
        <Editor
          key={editor.id}
          initial={editor}
          areas={areas}
          record={record}
          onSaved={refresh}
          onClose={() => {
            setEditor(undefined)
            refresh()
          }}
        />
      ) : (
        <>
          {prompted && (
            <section>
              <div class="journal-row">
                <h2>A question can be a beginning.</h2>
                <a href="/journal">All entries</a>
              </div>
              <p>Choose a reflection. Skip any question. Return whenever you like.</p>
              <div class="journal-row">
                <input
                  aria-label="Search prompted journals"
                  placeholder="Find a reflection…"
                  value={catalogSearch}
                  onInput={(e) => setCatalogSearch(e.currentTarget.value)}
                />
                <select
                  aria-label="Category"
                  value={category}
                  onChange={(e) => setCategory(e.currentTarget.value)}
                >
                  <option value="">All categories</option>
                  {['wellbeing', 'life_reflection', 'creative_play'].map((c) => (
                    <option value={c}>{c.replaceAll('_', ' ')}</option>
                  ))}
                </select>
                <select
                  aria-label="Audience"
                  value={audience}
                  onChange={(e) => setAudience(e.currentTarget.value)}
                >
                  <option value="">All audiences</option>
                  {[...new Set(catalog.map((c) => c.audience))].map((c) => (
                    <option>{c}</option>
                  ))}
                </select>
                <select aria-label="Format" value={format} onChange={(e) => setFormat(e.currentTarget.value)}>
                  <option value="">All lengths</option>
                  {['exercise', 'mini_workbook', 'workbook'].map((c) => (
                    <option value={c}>{c.replaceAll('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div class="journal-catalog">
                {catalog
                  .filter(
                    (c) =>
                      (!category || c.category === category) &&
                      (!audience || c.audience === audience) &&
                      (!format || c.format === format) &&
                      `${c.title} ${c.description}`.toLowerCase().includes(catalogSearch.toLowerCase()),
                  )
                  .map((c) => (
                    <article class="journal-card">
                      <small>
                        {c.category.replaceAll('_', ' ')} · {c.sections.length} sections
                      </small>
                      <h3>{c.title}</h3>
                      <p>{c.description}</p>
                      <p>{c.audience}</p>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void action(async () => {
                            const entry = await journalApi.create({ ...blankEntry(), workbook_id: c.id })
                            setEditor(entry)
                            refresh()
                          })
                        }
                      >
                        Start a new reflection
                      </button>
                      <button onClick={() => filter({ kind: 'workbook', search: c.title })}>
                        View prior attempts
                      </button>
                      <Source definition={c} />
                    </article>
                  ))}
              </div>
            </section>
          )}
          <div class="journal-layout">
            <aside class="journal-sidebar">
              <h2>Areas</h2>
              <button class={!query.area_id ? 'selected' : ''} onClick={() => filter({ area_id: undefined })}>
                All entries
              </button>
              <button
                class={query.area_id === 'general' ? 'selected' : ''}
                onClick={() => filter({ area_id: 'general' })}
              >
                General
              </button>
              {areas
                .filter((a) => !a.archived)
                .sort((a, b) => a.position - b.position)
                .map((a) => (
                  <button
                    class={query.area_id === a.id ? 'selected' : ''}
                    onClick={() => filter({ area_id: a.id })}
                  >
                    {a.name}
                  </button>
                ))}
              <details>
                <summary>Manage areas</summary>
                <button
                  onClick={() =>
                    void action(async () => {
                      const name = prompt('Name your area')
                      if (name?.trim()) {
                        await journalApi.createArea({ name, position: areas.length, archived: false })
                        refresh()
                      }
                    })
                  }
                >
                  Add area
                </button>
                {areas.map((a) => (
                  <div class="journal-manage">
                    <strong>
                      {a.name}
                      {a.archived ? ' (archived)' : ''}
                    </strong>
                    <button
                      onClick={() =>
                        void action(async () => {
                          const name = prompt('Rename area', a.name)
                          if (name?.trim()) {
                            await journalApi.updateArea(a.id, { expected_updated_at: a.updated_at, name })
                            refresh()
                          }
                        })
                      }
                    >
                      Rename
                    </button>
                    <button
                      onClick={() =>
                        void action(async () => {
                          const position = prompt('Position (0 is first)', String(a.position))
                          if (position !== null && /^\d+$/.test(position)) {
                            await journalApi.updateArea(a.id, {
                              expected_updated_at: a.updated_at,
                              position: Number(position),
                            })
                            refresh()
                          }
                        })
                      }
                    >
                      Reorder
                    </button>
                    <button
                      onClick={() =>
                        void action(async () => {
                          await journalApi.updateArea(a.id, {
                            expected_updated_at: a.updated_at,
                            archived: !a.archived,
                          })
                          refresh()
                        })
                      }
                    >
                      {a.archived ? 'Unarchive' : 'Archive'}
                    </button>
                    <button
                      onClick={() =>
                        void action(async () => {
                          if (confirm(`Delete ${a.name}? Its entries will move to General.`)) {
                            await journalApi.deleteArea(a)
                            refresh()
                          }
                        })
                      }
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </details>
              <details>
                <summary>Templates</summary>
                {templates.map((t) => (
                  <div class="journal-manage">
                    <strong>{t.title}</strong>
                    <button
                      onClick={() =>
                        void action(async () => {
                          setEditor(await journalApi.create({ ...blankEntry(), template_id: t.id }))
                        })
                      }
                    >
                      Use
                    </button>
                    <button
                      onClick={() =>
                        void action(async () => {
                          const title = prompt('Template title', t.title)
                          if (!title?.trim()) return
                          const content = prompt('Template text', t.content)
                          if (content !== null) {
                            await journalApi.updateTemplate(t.id, {
                              expected_updated_at: t.updated_at,
                              title,
                              content,
                            })
                            refresh()
                          }
                        })
                      }
                    >
                      Edit
                    </button>
                    <button
                      onClick={() =>
                        void action(async () => {
                          if (confirm('Delete this template? Entries already made from it will remain.')) {
                            await journalApi.deleteTemplate(t)
                            refresh()
                          }
                        })
                      }
                    >
                      Delete
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => {
                    setEditor(blankEntry())
                    setRecord(false)
                  }}
                >
                  Write a new template
                </button>
              </details>
            </aside>
            <section class="journal-timeline">
              <button disabled={busy} onClick={() => void findMemories()}>
                On this day
              </button>
              {memories !== null && (
                <aside class="journal-notice">
                  <div class="journal-row">
                    <h3>On this day in past years</h3>
                    <button onClick={() => setMemories(null)}>Hide memories</button>
                  </div>
                  <p>Only entries with memories enabled appear here. All previous years were checked.</p>
                  {memories.length ? (
                    memories.map((entry) => (
                      <button onClick={() => setEditor(entry)}>
                        {new Date(entry.occurred_at).getFullYear()} · {entry.title || 'Untitled entry'}
                      </button>
                    ))
                  ) : (
                    <p>No memories for today.</p>
                  )}
                </aside>
              )}
              <div class="journal-row">
                <h2>{query.deleted === 'true' ? 'Trash' : prompted ? 'Your reflections' : 'All entries'}</h2>
                <span>{total} entries</span>
              </div>
              <div class="journal-filters">
                <input
                  aria-label="Search entries"
                  placeholder="Search your words…"
                  value={query.search ?? ''}
                  onInput={(e) => filter({ search: e.currentTarget.value || undefined })}
                />
                <input
                  aria-label="Filter tag"
                  placeholder="Tag"
                  value={query.tag ?? ''}
                  onChange={(e) => filter({ tag: e.currentTarget.value || undefined })}
                />
                <label>
                  From{' '}
                  <input
                    type="date"
                    onChange={(e) =>
                      filter({
                        from: e.currentTarget.value
                          ? new Date(e.currentTarget.value + 'T00:00').toISOString()
                          : undefined,
                      })
                    }
                  />
                </label>
                <label>
                  Through{' '}
                  <input
                    type="date"
                    onChange={(e) =>
                      filter({
                        to: e.currentTarget.value
                          ? new Date(e.currentTarget.value + 'T23:59:59.999').toISOString()
                          : undefined,
                      })
                    }
                  />
                </label>
                <select
                  aria-label="Entry kind"
                  value={query.kind ?? ''}
                  onChange={(e) =>
                    filter({ kind: (e.currentTarget.value as JournalEntriesQuery['kind']) || undefined })
                  }
                >
                  <option value="">All kinds</option>
                  <option value="text">Writing</option>
                  <option value="audio">Audio</option>
                  <option value="workbook">Prompted</option>
                </select>
                <label>
                  <input
                    type="checkbox"
                    checked={query.favorite === 'true'}
                    onChange={(e) => filter({ favorite: e.currentTarget.checked ? 'true' : undefined })}
                  />
                  Favorites
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={query.deleted === 'true'}
                    onChange={(e) => filter({ deleted: e.currentTarget.checked ? 'true' : 'false' })}
                  />
                  Trash
                </label>
                <button
                  onClick={() => {
                    setQuery({ page: 1, per_page: 20, deleted: 'false' })
                    setSelected([])
                  }}
                >
                  Clear filters
                </button>
              </div>
              {busy && <p role="status">Loading…</p>}
              {!busy && !entries.length && (
                <div class="journal-empty">
                  <h3>A page is waiting.</h3>
                  <p>
                    {query.search || query.area_id || query.tag
                      ? 'No entries match these filters.'
                      : 'Your words do not need a plan. Begin with one sentence.'}
                  </p>
                  <button onClick={() => setEditor(blankEntry())}>Write something</button>
                </div>
              )}
              {entries.map((e) => (
                <article class="journal-entry" key={e.id}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${e.title || 'untitled entry'}`}
                    checked={selected.includes(e.id)}
                    onChange={(ev) =>
                      setSelected((ids) =>
                        ev.currentTarget.checked ? [...ids, e.id] : ids.filter((id) => id !== e.id),
                      )
                    }
                  />
                  <button
                    class="journal-entry-open"
                    onClick={() => {
                      setRecord(false)
                      setEditor(e)
                    }}
                  >
                    <small>
                      {new Date(e.occurred_at).toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}{' '}
                      · {areas.find((a) => a.id === e.area_id)?.name ?? 'General'}
                      {e.pinned ? ' · Pinned' : ''}
                      {e.favorite ? ' · ★' : ''}
                    </small>
                    <h3>{e.title || e.workbook?.definition.title || 'Untitled entry'}</h3>
                    <p>
                      {e.content.slice(0, 220) ||
                        (e.workbook
                          ? `${e.workbook.completed_sections.length}/${e.workbook.definition.sections.length} sections · ${e.workbook.status.replaceAll('_', ' ')}`
                          : 'Open this entry')}
                    </p>
                    <small>{e.tags.map((t) => `#${t}`).join(' ')}</small>
                  </button>
                  {e.workbook && (
                    <button
                      onClick={() =>
                        void action(async () =>
                          setEditor(
                            await journalApi.create({
                              ...blankEntry(),
                              workbook_id: e.workbook?.definition.id,
                            }),
                          ),
                        )
                      }
                    >
                      Repeat
                    </button>
                  )}
                </article>
              ))}
              <div class="journal-row">
                <button
                  disabled={(query.page ?? 1) === 1}
                  onClick={() => setQuery((q) => ({ ...q, page: (q.page ?? 1) - 1 }))}
                >
                  Previous
                </button>
                <span>Page {query.page ?? 1}</span>
                <button
                  disabled={(query.page ?? 1) * 20 >= total}
                  onClick={() => setQuery((q) => ({ ...q, page: (q.page ?? 1) + 1 }))}
                >
                  Next
                </button>
              </div>
              <details>
                <summary>Export entries</summary>
                <p>
                  Exports include the current filters across every page. Media archive includes original
                  attachment files encoded inside JSON.
                </p>
                <div class="journal-row">
                  {(['json', 'markdown', 'archive'] as const).map((type) => (
                    <button disabled={busy} onClick={() => void exportEntries(type)}>
                      {type === 'archive' ? 'All with media' : `All as ${type}`}
                    </button>
                  ))}
                  {selected.length > 0 &&
                    (['json', 'markdown', 'archive'] as const).map((type) => (
                      <button disabled={busy} onClick={() => void exportEntries(type, true)}>
                        Selected as {type}
                      </button>
                    ))}
                </div>
              </details>
            </section>
          </div>
        </>
      )}
    </div>
  )
}

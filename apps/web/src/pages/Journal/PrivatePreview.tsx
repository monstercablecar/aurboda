import type { JournalAttachment } from '@aurboda/api-spec'

import DOMPurify from 'dompurify'
import { Marked } from 'marked'
import { useEffect, useState } from 'preact/hooks'

import { journalApi } from '../../state/api/journal'
const escape = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
export const journalImageIds = (content: string) =>
  [
    ...new Set([...content.matchAll(/journal-attachment:([0-9a-f-]{36})/gi)].map((m) => m[1]!.toLowerCase())),
  ].slice(0, 30)
export const privateJournalHtml = (content: string, images: ReadonlyMap<string, string>) => {
  const parser = new Marked({
    gfm: true,
    breaks: true,
    renderer: {
      image({ href, text }) {
        const id = /^journal-attachment:([0-9a-f-]{36})$/i.exec(href)?.[1]?.toLowerCase(),
          url = id ? images.get(id) : undefined
        return url
          ? `<img src="${escape(url)}" alt="${escape(text)}" loading="lazy" />`
          : `<span>${escape(text || 'Image unavailable')}</span>`
      },
    },
  })
  const purifier = DOMPurify(window)
  purifier.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName === 'IMG' && ![...images.values()].includes(node.getAttribute('src') ?? '')) {
      node.remove()
    }
    if (node.nodeName === 'A') {
      node.setAttribute('rel', 'noreferrer noopener')
    }
  })
  return purifier.sanitize(parser.parse(content, { async: false }), {
    FORBID_TAGS: [
      'form',
      'input',
      'button',
      'select',
      'textarea',
      'style',
      'video',
      'audio',
      'iframe',
      'svg',
    ],
    FORBID_ATTR: ['style', 'srcset'],
    ALLOW_UNKNOWN_PROTOCOLS: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|blob):|[#/])/i,
  })
}
export function PrivatePreview({
  content,
  attachments,
  className = 'journal-preview',
}: {
  content: string
  attachments: JournalAttachment[]
  className?: string
}) {
  const [images, setImages] = useState<Map<string, string>>(new Map())
  const key = journalImageIds(content).join(',')
  useEffect(() => {
    let active = true
    const urls: string[] = []
    const next = new Map<string, string>()
    setImages(new Map())
    void Promise.all(
      journalImageIds(content).map(async (id) => {
        if (!attachments.some((a) => a.id === id && a.mime_type.startsWith('image/'))) return
        try {
          const blob = await journalApi.attachmentBlob(id)
          if (!active) return
          const url = URL.createObjectURL(blob)
          urls.push(url)
          next.set(id, url)
        } catch {}
      }),
    ).then(() => {
      if (active) setImages(next)
    })
    return () => {
      active = false
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [key, attachments])
  return <div class={className} dangerouslySetInnerHTML={{ __html: privateJournalHtml(content, images) }} />
}

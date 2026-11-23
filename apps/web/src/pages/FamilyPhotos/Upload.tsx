import { useRef, useState } from 'preact/hooks'

import { familyError, uploadFamily } from '../../state/api/family-photos'

export function FamilyUpload({ maxBytes, onUploaded }: { maxBytes: number; onUploaded: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [messages, setMessages] = useState<string[]>([])
  const [current, setCurrent] = useState('')
  const upload = async () => {
    setBusy(true)
    setMessages([])
    const results: string[] = []
    for (const file of files) {
      setCurrent(file.name)
      setProgress(0)
      if (file.size > maxBytes) {
        results.push(`${file.name}: exceeds the ${Math.floor(maxBytes / 1024 ** 2)} MB limit`)
        continue
      }
      try {
        await uploadFamily(file, caption, setProgress)
        results.push(`${file.name}: uploaded; preparing preview`)
      } catch (error) {
        results.push(`${file.name}: ${familyError(error)}`)
      }
      setMessages([...results])
    }
    setMessages(results)
    setBusy(false)
    setFiles([])
    setCurrent('')
    onUploaded()
  }
  return (
    <section
      class="family-upload"
      id="upload"
      aria-label="Upload Photo / Video"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        if (!busy) setFiles(Array.from(e.dataTransfer?.files ?? []))
      }}
    >
      <h2>Upload Photo / Video</h2>
      <p>Choose from your gallery or drop files here. Up to {Math.floor(maxBytes / 1024 ** 2)} MB each.</p>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,video/mp4,video/quicktime,.heic,.heif,.mov"
        disabled={busy}
        onChange={(e) => setFiles(Array.from(e.currentTarget.files ?? []))}
      />
      <label>
        Caption (optional)
        <textarea
          maxLength={2000}
          value={caption}
          disabled={busy}
          onInput={(e) => setCaption(e.currentTarget.value)}
        />
      </label>
      {files.length > 0 && (
        <p>
          {files.length} file{files.length === 1 ? '' : 's'} selected
        </p>
      )}
      <button class="btn-primary" disabled={busy || !files.length} onClick={() => void upload()}>
        {busy ? 'Uploading…' : 'Upload to Marcroft Family'}
      </button>
      {busy && (
        <p aria-live="polite">
          {current} <progress value={progress} max={100} /> {progress}%
        </p>
      )}
      <ul aria-live="polite">
        {messages.map((message, i) => (
          <li key={i}>{message}</li>
        ))}
      </ul>
    </section>
  )
}

import { useState } from 'preact/hooks'

export function PhotoField({
  value,
  onChange,
}: {
  value: string | null
  onChange: (value: string | null) => void
}) {
  const [error, setError] = useState('')
  return (
    <div>
      <label>
        Photo (optional)
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            if (!file) return
            if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 350_000) {
              setError('Choose a PNG, JPEG, or WebP image smaller than 350 KB.')
              return
            }
            setError('')
            const reader = new FileReader()
            reader.onload = () => {
              if (typeof reader.result === 'string') onChange(reader.result)
            }
            reader.onerror = () => setError('Could not read this photo. Please try another image.')
            reader.readAsDataURL(file)
          }}
        />
      </label>
      {value && (
        <div class="people-actions">
          <img class="people-photo" src={value} alt="Person photo preview" />
          <button type="button" onClick={() => onChange(null)}>
            Remove photo
          </button>
        </div>
      )}
      {error && (
        <p role="alert" class="people-error">
          {error}
        </p>
      )}
    </div>
  )
}

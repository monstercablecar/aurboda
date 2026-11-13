import type { Substance } from '@aurboda/api-spec'

import { useMutation } from '@tanstack/react-query'
import { useState } from 'preact/hooks'

import {
  archiveSubstance,
  createSubstance,
  pharmacologyErrorMessage,
  updateSubstance,
} from '../../state/api'

const categories: Substance['category'][] = [
  'prescription',
  'otc',
  'supplement',
  'nootropic',
  'caffeine',
  'other',
]

// eslint-disable-next-line complexity -- a single progressive substance form maps optional registry fields directly
export function SubstanceForm({
  onCancel,
  onSaved,
  substance,
}: {
  onCancel: () => void
  onSaved: (message: string) => void
  substance?: Substance
}) {
  const [displayName, setDisplayName] = useState(substance?.display_name ?? '')
  const [genericName, setGenericName] = useState(substance?.generic_name ?? '')
  const [brandName, setBrandName] = useState(substance?.brand_name ?? '')
  const [category, setCategory] = useState<Substance['category']>(substance?.category ?? 'supplement')
  const [customCategory, setCustomCategory] = useState(substance?.custom_category ?? '')
  const [formulation, setFormulation] = useState(substance?.formulation ?? '')
  const [route, setRoute] = useState(substance?.route ?? '')
  const [strength, setStrength] = useState(String(substance?.strength ?? ''))
  const [strengthUnit, setStrengthUnit] = useState(substance?.strength_unit ?? '')
  const [defaultDose, setDefaultDose] = useState(String(substance?.default_dose ?? ''))
  const [doseUnit, setDoseUnit] = useState(substance?.dose_unit ?? '')
  const [manufacturer, setManufacturer] = useState(substance?.manufacturer ?? '')
  const [favorite, setFavorite] = useState(substance?.favorite ?? false)
  const [notes, setNotes] = useState(substance?.notes ?? '')
  const [tags, setTags] = useState(substance?.tags.join(', ') ?? '')
  const [error, setError] = useState('')
  const saveMutation = useMutation({
    // eslint-disable-next-line complexity -- nullable optional fields are normalized together before one request
    mutationFn: () => {
      const body = {
        brand_name: brandName || null,
        category,
        custom_category: customCategory || null,
        default_dose: defaultDose ? Number(defaultDose) : null,
        display_name: displayName.trim(),
        dose_unit: doseUnit.trim(),
        favorite,
        formulation: formulation || null,
        generic_name: genericName || null,
        manufacturer: manufacturer || null,
        notes: notes || null,
        route: route || null,
        status: substance?.status ?? ('active' as const),
        strength: strength ? Number(strength) : null,
        strength_unit: strengthUnit || null,
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      }
      if (!body.display_name || !body.dose_unit) throw new Error('Name and dose unit are required.')
      return substance ? updateSubstance(substance.id, body) : createSubstance(body)
    },
    onError: (mutationError) => setError(pharmacologyErrorMessage(mutationError)),
    onSuccess: () => onSaved(substance ? 'Substance updated.' : 'Substance created.'),
  })
  const archiveMutation = useMutation({
    mutationFn: async () => {
      if (substance?.status === 'archived') {
        await updateSubstance(substance.id, { status: 'active' })
      } else {
        await archiveSubstance(substance!.id)
      }
    },
    onError: (mutationError) => setError(pharmacologyErrorMessage(mutationError)),
    onSuccess: () => onSaved(substance?.status === 'archived' ? 'Substance reactivated.' : 'Substance archived.'),
  })

  return (
    <form
      class="treatments-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!saveMutation.isPending) saveMutation.mutate()
      }}
    >
      <div class="form-heading">
        <div><p class="treatments-kicker">Library</p><h2>{substance ? 'Edit substance' : 'New substance'}</h2></div>
        <button class="icon-button" type="button" onClick={onCancel} aria-label="Close substance form">×</button>
      </div>
      <div class="form-grid">
        <label class="field full-field"><span>Display name</span><input required value={displayName} onInput={(event) => setDisplayName((event.target as HTMLInputElement).value)} /></label>
        <label class="field"><span>Generic name</span><input value={genericName} onInput={(event) => setGenericName((event.target as HTMLInputElement).value)} /></label>
        <label class="field"><span>Brand name</span><input value={brandName} onInput={(event) => setBrandName((event.target as HTMLInputElement).value)} /></label>
        <label class="field"><span>Category</span><select value={category} onChange={(event) => setCategory((event.target as HTMLSelectElement).value as Substance['category'])}>{categories.map((value) => <option value={value}>{value}</option>)}</select></label>
        <label class="field"><span>Custom category</span><input value={customCategory} onInput={(event) => setCustomCategory((event.target as HTMLInputElement).value)} /></label>
        <label class="field"><span>Formulation</span><input placeholder="tablet, capsule, liquid…" value={formulation} onInput={(event) => setFormulation((event.target as HTMLInputElement).value)} /></label>
        <label class="field"><span>Route</span><input placeholder="oral, sublingual…" value={route} onInput={(event) => setRoute((event.target as HTMLInputElement).value)} /></label>
        <label class="field"><span>Strength</span><input min="0" step="any" type="number" value={strength} onInput={(event) => setStrength((event.target as HTMLInputElement).value)} /></label>
        <label class="field"><span>Strength unit</span><input value={strengthUnit} onInput={(event) => setStrengthUnit((event.target as HTMLInputElement).value)} /></label>
        <label class="field"><span>Default dose</span><input min="0" step="any" type="number" value={defaultDose} onInput={(event) => setDefaultDose((event.target as HTMLInputElement).value)} /></label>
        <label class="field"><span>Dose unit</span><input required placeholder="mg, mL, tablet…" value={doseUnit} onInput={(event) => setDoseUnit((event.target as HTMLInputElement).value)} /></label>
        <label class="field full-field"><span>Manufacturer</span><input value={manufacturer} onInput={(event) => setManufacturer((event.target as HTMLInputElement).value)} /></label>
        <label class="field full-field"><span>Tags</span><input placeholder="Separate tags with commas" value={tags} onInput={(event) => setTags((event.target as HTMLInputElement).value)} /></label>
        <label class="field full-field"><span>Notes</span><textarea value={notes} onInput={(event) => setNotes((event.target as HTMLTextAreaElement).value)} /></label>
      </div>
      <label class="check-label favorite-toggle"><input type="checkbox" checked={favorite} onChange={(event) => setFavorite((event.target as HTMLInputElement).checked)} /><span>Show as a favorite for quick PRN logging</span></label>
      {error && <p class="form-error" role="alert">{error}</p>}
      <div class="form-actions split-actions">
        <div>{substance && <button class="danger-button" type="button" disabled={archiveMutation.isPending} onClick={() => archiveMutation.mutate()}>{substance.status === 'archived' ? 'Reactivate' : 'Archive'}</button>}</div>
        <div><button class="btn-secondary" type="button" onClick={onCancel}>Cancel</button><button class="btn-primary" type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Saving…' : 'Save'}</button></div>
      </div>
    </form>
  )
}

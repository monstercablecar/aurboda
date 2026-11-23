import { useFamilyAccess } from '../state/api/family-photos'
import { QuickLinkWidget } from './widgets/QuickLinkWidget'

export function FamilyPhotoQuickLink() {
  const { data } = useFamilyAccess()
  if (!data?.enabled || !data.allowed) return null
  return (
    <div class="quick-links">
      <QuickLinkWidget
        config={{
          href: data.is_admin ? '/family-photos#upload' : '/family-photos',
          label: data.is_admin ? 'Upload Photo / Video' : 'Family Photos',
        }}
      />
    </div>
  )
}

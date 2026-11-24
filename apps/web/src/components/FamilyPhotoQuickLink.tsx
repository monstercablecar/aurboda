import { useFamilyAccess } from '../state/api/family-photos'
import { QuickLinkWidget } from './widgets/QuickLinkWidget'

export function FamilyPhotoQuickLink() {
  const { data } = useFamilyAccess()
  if (!data?.enabled || !data.allowed) return null
  return (
    <div class="quick-links">
      <QuickLinkWidget
        config={{
          href: '/family-photos#upload',
          label: 'Upload Photo / Video',
        }}
      />
    </div>
  )
}

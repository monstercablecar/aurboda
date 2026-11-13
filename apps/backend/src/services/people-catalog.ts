import { careEthics, careGuidance, careSources } from './people-catalog/care.ts'
import { genderContextGuidance, genderContextSources } from './people-catalog/gender-context.ts'
import { guidance } from './people-catalog/guidance.ts'
import { infantGuidance, infantSources } from './people-catalog/infant.ts'
import { marriageGuidance, marriageSources } from './people-catalog/marriage.ts'
import { pregnancyGuidance, pregnancySources, pregnancyMilestones } from './people-catalog/pregnancy.ts'
import { sources } from './people-catalog/sources.ts'
export const peopleCatalog = [
  ...guidance,
  ...genderContextGuidance,
  ...infantGuidance,
  ...careGuidance,
  ...pregnancyGuidance,
  ...marriageGuidance,
]
export const peopleSources = [
  ...sources,
  ...genderContextSources,
  ...infantSources,
  ...careSources,
  ...pregnancySources,
  ...marriageSources,
]

export const peopleMilestones = pregnancyMilestones
export const peopleCareEthics = careEthics

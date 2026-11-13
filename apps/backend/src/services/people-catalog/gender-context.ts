import type { PeopleGuidance, PeopleSource } from '@aurboda/api-spec'

const verified = '2026-11-11'
const licensing =
  'Linked official source; short original paraphrases only. No source images or full publications reproduced.'
export const genderContextSources: PeopleSource[] = [
  {
    id: 'nimh-men-context',
    publisher: 'National Institute of Mental Health',
    title: 'Men and Mental Health',
    url: 'https://www.nimh.nih.gov/health/topics/men-and-mental-health',
    last_verified: verified,
    applicable_population: 'Men; used here only as an optional adult educational resource.',
    evidence_category: 'educational_guidance',
    licensing_status: licensing,
    limitations: [
      'Population information is not an assessment of an individual. The source discusses both sex and psychosocial factors; it does not establish an identity-specific prediction. No symptom, diagnosis, anatomy or treatment need is inferred from gender.',
    ],
  },
  {
    id: 'unwomen-unpaid-work',
    publisher: 'UN Women',
    title: 'Whose time to care: Unpaid care and domestic work during COVID-19',
    url: 'https://data.unwomen.org/publications/whose-time-care-unpaid-care-and-domestic-work-during-covid-19',
    publication_date: '2020-11-25',
    last_verified: verified,
    applicable_population:
      'Women and men represented in pandemic-era surveys across 38 countries; optional context for adult women.',
    evidence_category: 'empirical_evidence',
    licensing_status: licensing,
    limitations: [
      'Pandemic-era population research is not a description of every woman or current household. No caregiving role, shared household, burden or family structure is assumed. The conversation suggestion is an optional application, not a tested intervention.',
    ],
  },
  {
    id: 'asha-gender-communication',
    publisher: 'American Speech-Language-Hearing Association',
    title: 'Supporting and Working With Transgender and Gender-Diverse People',
    url: 'https://www.asha.org/practice/multicultural/supporting-and-working-with-transgender-and-gender-diverse-individuals/',
    last_verified: verified,
    applicable_population:
      'Gender-diverse clients, patients, students and their support systems, including nonbinary people.',
    evidence_category: 'educational_guidance',
    licensing_status: licensing,
    limitations: [
      'Professional communication guidance adapted here only for everyday respect and privacy. The page describes language use as understood in 2021. This catalog does not import treatment, legal-record-access or disclosure rules. Individual terminology and context preferences take precedence.',
    ],
  },
  {
    id: 'unicef-equal-treatment',
    publisher: 'UNICEF',
    title: 'Equal treatment from day one',
    url: 'https://www.unicef.org/parenting/child-development/equal-treatment-gender',
    last_verified: verified,
    applicable_population:
      'Parents and caregivers of children of every gender, especially in early childhood.',
    evidence_category: 'educational_guidance',
    licensing_status: licensing,
    limitations: [
      'Universal parenting guidance is kept eligible without a gender selection. No gender is assigned from interests, toys or behavior; no developmental timing is altered. Not all children share preferences.',
    ],
  },
]

const record = (
  entry: Pick<
    PeopleGuidance,
    | 'id'
    | 'title'
    | 'summary'
    | 'practical_actions'
    | 'evidence_ids'
    | 'relationship_types'
    | 'min_age'
    | 'max_age'
    | 'domains'
  > &
    Partial<PeopleGuidance>,
): PeopleGuidance => ({
  age_unit: 'years',
  needs: [],
  statuses: [],
  priority: 20,
  guidance_type: 'resource',
  optional_metrics: [],
  evidence_class: 'educational_guidance',
  contraindications: [],
  review_interval: 90,
  version: '1.1.0',
  last_verified: verified,
  jurisdiction: 'International educational context',
  active: true,
  interests: [],
  goals: [],
  recurring: true,
  ...entry,
})
const adultRelationships: PeopleGuidance['relationship_types'] = [
  'child',
  'parent',
  'lover',
  'spouse',
  'friend',
]
export const genderContextGuidance: PeopleGuidance[] = [
  record({
    id: 'men-mental-health-resource',
    title: 'Optional information about men’s mental health',
    relationship_types: adultRelationships,
    min_age: 18,
    max_age: 151,
    genders: ['man'],
    domains: ['wellbeing', 'gender_context'],
    summary:
      'NIMH offers educational information about men’s mental health. Showing this resource does not indicate a condition or a need for treatment.',
    practical_actions: [
      'Ask whether the person would welcome this information. Individual wishes take precedence; men do not all share the same needs.',
    ],
    evidence_ids: ['nimh-men-context'],
    jurisdiction: 'US educational context',
  }),
  record({
    id: 'women-unpaid-work-context',
    title: 'Optional context about women and unpaid work',
    relationship_types: adultRelationships,
    min_age: 18,
    max_age: 151,
    genders: ['woman'],
    domains: ['mutual_support', 'gender_context'],
    summary:
      'UN Women studied gender disparities in unpaid work during COVID-19. Those population findings do not describe every woman’s responsibilities.',
    practical_actions: [
      'If this topic matters to the person, ask whether responsibilities affect their time and what support they would welcome. Follow their stated preferences.',
    ],
    evidence_ids: ['unwomen-unpaid-work'],
    evidence_class: 'general_practical_suggestion',
  }),
  record({
    id: 'nonbinary-language-preferences',
    title: 'Ask about preferred language',
    relationship_types: adultRelationships,
    min_age: 6,
    max_age: 151,
    genders: ['nonbinary'],
    domains: ['communication', 'gender_context'],
    summary:
      'Names and pronouns vary among nonbinary people. An identity label does not determine which language a person uses.',
    practical_actions: [
      'Respectfully invite the person to share their preferred terms, without requiring an answer. Follow their preferences and briefly correct mistakes.',
    ],
    evidence_ids: ['asha-gender-communication'],
    evidence_class: 'general_practical_suggestion',
  }),
  record({
    id: 'nonbinary-context-privacy',
    title: 'Respect context and privacy preferences',
    relationship_types: adultRelationships,
    min_age: 6,
    max_age: 151,
    genders: ['nonbinary'],
    domains: ['privacy', 'gender_context'],
    summary:
      'A person may want different information shared in different settings. Nonbinary people do not all have the same disclosure preferences.',
    practical_actions: [
      'Ask what name or terms the person wants used around others. Do not assume permission to share personal identity information.',
    ],
    evidence_ids: ['asha-gender-communication'],
    evidence_class: 'general_practical_suggestion',
  }),
  record({
    id: 'child-play-without-stereotypes',
    title: 'Keep play choices open',
    relationship_types: ['child'],
    min_age: 0,
    max_age: 12,
    domains: ['learning', 'gender_equality'],
    summary:
      'Children of every gender can explore varied, age-appropriate play. A toy preference does not establish a child’s identity or ability.',
    practical_actions: [
      'When developmentally suitable, offer creative, building, caring and active play opportunities. Follow the child’s interests rather than gendered packaging.',
    ],
    evidence_ids: ['unicef-equal-treatment'],
    guidance_type: 'optimization',
  }),
  record({
    id: 'child-expression-without-stereotypes',
    title: 'Welcome expression without gender expectations',
    relationship_types: ['child'],
    min_age: 0,
    max_age: 12,
    domains: ['communication', 'gender_equality'],
    summary:
      'Gender stereotypes can limit how children feel able to express themselves. Each child deserves an accepting environment.',
    practical_actions: [
      'Avoid gender-based teasing or expectations about toughness, appearance or obedience. Let the child express feelings and develop their own sense of identity.',
    ],
    evidence_ids: ['unicef-equal-treatment'],
    guidance_type: 'relationship',
  }),
]

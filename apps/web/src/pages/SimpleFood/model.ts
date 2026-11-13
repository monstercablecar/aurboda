import type {
  Assessment,
  ContextEvent,
  ContextEventType,
  CreateContextEventTypeBody,
  CreateQuestionnaireBody,
  QuestionnaireTemplate,
} from '@aurboda/api-spec'

import { addDays, format } from 'date-fns'

export type SimpleFoodView = 'today' | 'assessment' | 'intake'

export const simpleFoodViews: { key: SimpleFoodView; label: string }[] = [
  { key: 'today', label: 'Today & trends' },
  { key: 'assessment', label: 'REAP-S v2' },
  { key: 'intake', label: 'GI intake' },
]

export const SIMPLE_FOOD_DAILY_KEY = 'simple_food_daily_check'
export const SIMPLE_FOOD_REAPS_KEY = 'simple_food_reaps_v2'
export const SIMPLE_FOOD_INTAKE_KEY = 'simple_food_nutrition_gi_intake'

export const SIMPLE_FOOD_FULLNESS_KEY = 'simple_food_fullness'
export const SIMPLE_FOOD_BLOATING_KEY = 'simple_food_bloating'
export const SIMPLE_FOOD_REFLUX_KEY = 'simple_food_reflux'

export const simpleFoodMetricNames = {
  added_sugar: 'simple_food_added_sugar',
  bloating: 'simple_food_bloating',
  diet_balance: 'simple_food_diet_balance',
  fullness: 'simple_food_fullness',
  processed_food: 'simple_food_processed_food',
  produce_frequency: 'simple_food_produce_frequency',
  reflux: 'simple_food_reflux',
} as const

export interface ChoiceOption {
  value: string
  label: string
  detail?: string
}

interface ManagedTemplateDefinition {
  description: string
  display_name: string
  enabled: boolean
  moment: CreateQuestionnaireBody['moment']
  questions: CreateQuestionnaireBody['questions']
  stable_key: string
}

const option = (value: string, label: string, detail?: string): ChoiceOption => ({ value, label, ...(detail ? { detail } : {}) })

const helperConfig = (
  options: ChoiceOption[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({ options, ...extra })

const dailyQuestion = ({
  stable_key,
  prompt,
  description,
  metric_name,
  options,
  numeric_map,
  sort_order,
}: {
  stable_key: string
  prompt: string
  description: string
  metric_name: string
  options: ChoiceOption[]
  numeric_map: Record<string, number>
  sort_order: number
}) => ({
  stable_key,
  prompt,
  response_type: 'single_choice' as const,
  required: false,
  enabled: true,
  sort_order,
  metric_name,
  unit: 'ordinal',
  anchors: {},
  config: helperConfig(options, { description, numeric_map }),
})

export const dailyQuestionnaireDefinition: ManagedTemplateDefinition = {
  stable_key: SIMPLE_FOOD_DAILY_KEY,
  display_name: 'Daily nutrition check',
  enabled: true,
  description:
    'Simple Food Tracker daily check. Managed by the /simple-food page. Unknown stays distinct from missing, and only mapped categorical answers project into metrics.',
  moment: 'custom',
  questions: [
    dailyQuestion({
      stable_key: 'produce_frequency',
      prompt: 'How often did you eat vegetables or fruit today?',
      description: 'Include vegetables and whole fruit. Exclude juice and fried potatoes for consistency.',
      metric_name: simpleFoodMetricNames.produce_frequency,
      options: [
        option('none', 'None'),
        option('once', 'Once'),
        option('twice_or_more', 'Twice or more'),
        option('unknown', 'Not sure'),
      ],
      numeric_map: { none: 0, once: 1, twice_or_more: 2 },
      sort_order: 10,
    }),
    dailyQuestion({
      stable_key: 'added_sugar',
      prompt: 'How much added sugar did you consume today?',
      description:
        'Count sugary drinks, desserts, candy, sweetened snacks, and added sugars in prepared foods. Naturally occurring sugar in whole fruit does not count.',
      metric_name: simpleFoodMetricNames.added_sugar,
      options: [
        option('little_or_none', 'Little or none'),
        option('some', 'Some'),
        option('a_lot', 'A lot'),
        option('unknown', 'Not sure'),
      ],
      numeric_map: { little_or_none: 0, some: 1, a_lot: 2 },
      sort_order: 20,
    }),
    dailyQuestion({
      stable_key: 'processed_food',
      prompt: 'How much fast food or highly processed convenience food did you eat?',
      description:
        'Examples: fast-food meals, packaged sweets, and highly processed snack foods. Homemade bread or pasta are not automatically “unhealthy” just because they contain carbohydrates.',
      metric_name: simpleFoodMetricNames.processed_food,
      options: [
        option('none', 'None'),
        option('some', 'Some'),
        option('most_of_my_food', 'Most of my food'),
        option('unknown', 'Not sure'),
      ],
      numeric_map: { none: 0, some: 1, most_of_my_food: 2 },
      sort_order: 30,
    }),
    dailyQuestion({
      stable_key: 'diet_balance',
      prompt: 'How balanced and varied was your diet today?',
      description: 'A global subjective assessment, not a validated diet-quality score.',
      metric_name: simpleFoodMetricNames.diet_balance,
      options: [
        option('limited', 'Limited variety, mostly less nutritious choices'),
        option('mixed', 'Mixed'),
        option('mostly_varied', 'Mostly varied, nutritious foods'),
        option('unknown', 'Not sure'),
      ],
      numeric_map: { limited: 0, mixed: 1, mostly_varied: 2 },
      sort_order: 40,
    }),
  ],
}

const reapFrequencyOptionsLow = [
  option('every_day', 'Every day'),
  option('more_than_2', 'More than 2 times a week'),
  option('two_or_fewer', '2 or fewer times a week'),
  option('never', 'Never'),
]

const reapFrequencyOptionsHigh = [
  option('every_day', 'Every day'),
  option('more_than_3', 'More than 3 times a week'),
  option('three_or_fewer', '3 or fewer times a week'),
  option('never', 'Never'),
]

const reapQuestion = ({
  stable_key,
  prompt,
  helper,
  sort_order,
  section,
  options,
  numeric_map,
}: {
  stable_key: string
  prompt: string
  helper?: string
  sort_order: number
  section: string
  options: ChoiceOption[]
  numeric_map?: Record<string, number>
}) => ({
  stable_key,
  prompt,
  response_type: 'single_choice' as const,
  required: true,
  enabled: true,
  sort_order,
  metric_name: null,
  unit: null,
  anchors: {},
  config: helperConfig(options, {
    ...(helper ? { helper } : {}),
    ...(numeric_map ? { numeric_map } : {}),
    section,
  }),
})

export const reapsDefinition: ManagedTemplateDefinition = {
  stable_key: SIMPLE_FOOD_REAPS_KEY,
  display_name: 'REAP-S v2 detailed nutrition assessment',
  enabled: true,
  description:
    'Rapid Eating Assessment for Participants, Short Version, v.2. Source: Segal-Isaacson et al. supplemental instrument (2022/2023). Use for baseline or periodic reassessment rather than daily logging.',
  moment: 'custom',
  questions: [
    reapQuestion({
      stable_key: 'not_well_enough_to_shop_or_cook',
      prompt: 'In an average week, how often do you not feel well enough to shop or cook?',
      sort_order: 10,
      section: 'Food sufficiency / insufficiency',
      options: reapFrequencyOptionsLow,
      numeric_map: { every_day: 0, more_than_2: 1, two_or_fewer: 2, never: 3 },
    }),
    reapQuestion({
      stable_key: 'fewer_than_two_meals',
      prompt: 'In an average week, how often do you eat fewer than two meals per day?',
      sort_order: 20,
      section: 'Food sufficiency / insufficiency',
      options: reapFrequencyOptionsLow,
      numeric_map: { every_day: 0, more_than_2: 1, two_or_fewer: 2, never: 3 },
    }),
    reapQuestion({
      stable_key: 'less_than_three_ounces_protein',
      prompt:
        'In an average week, how often do you eat less than 3 ounces per day of high-protein foods such as poultry, meat, fish, tofu, 1 ounce of nuts, or 1½ cups of beans?',
      helper:
        'Three ounces of meat, chicken, or fish is about a deck of cards: roughly one regular hamburger, one chicken thigh or leg, one medium fish fillet, one small pork chop, or a small handful of nuts.',
      sort_order: 30,
      section: 'Food sufficiency / insufficiency',
      options: reapFrequencyOptionsLow,
      numeric_map: { every_day: 0, more_than_2: 1, two_or_fewer: 2, never: 3 },
    }),
    reapQuestion({
      stable_key: 'less_than_two_calcium_servings',
      prompt:
        'In an average week, how often do you consume less than 2 servings of a calcium-rich food such as milk, yogurt, cheese, or calcium-fortified soy, rice, or almond milk?',
      helper: 'One serving is 1 cup of milk or yogurt, or 2 ounces of cheese.',
      sort_order: 40,
      section: 'Food sufficiency / insufficiency',
      options: reapFrequencyOptionsLow,
      numeric_map: { every_day: 0, more_than_2: 1, two_or_fewer: 2, never: 3 },
    }),
    reapQuestion({
      stable_key: 'vegetables_three_servings',
      prompt: 'In an average week, how often do you eat 3 or more servings of vegetables per day?',
      helper:
        'Do not include potatoes or corn. One serving is ½ cup cooked vegetables or 1 cup leafy raw vegetables. Half a cup is roughly the size of a lightbulb; 1 cup is about a baseball.',
      sort_order: 50,
      section: 'Healthy eating pattern',
      options: reapFrequencyOptionsHigh,
      numeric_map: { every_day: 3, more_than_3: 2, three_or_fewer: 1, never: 0 },
    }),
    reapQuestion({
      stable_key: 'fruit_two_servings',
      prompt: 'In an average week, how often do you eat 2 or more servings of fruit per day?',
      helper: 'Do not include fruit juice or fruit drinks. One serving is ½ cup or 1 medium fruit.',
      sort_order: 60,
      section: 'Healthy eating pattern',
      options: reapFrequencyOptionsHigh,
      numeric_map: { every_day: 3, more_than_3: 2, three_or_fewer: 1, never: 0 },
    }),
    reapQuestion({
      stable_key: 'whole_grains_high_fiber',
      prompt: 'In an average week, how often do you eat 2 or more servings of whole grain products or high-fiber starches a day?',
      helper:
        'Examples: 1 slice 100% whole-grain bread or crackers; 1 cup whole-grain cereal such as oatmeal; ½ cup brown rice, whole-wheat pasta, baked potato, yucca, yams, or plantain.',
      sort_order: 70,
      section: 'Healthy eating pattern',
      options: reapFrequencyOptionsHigh,
      numeric_map: { every_day: 3, more_than_3: 2, three_or_fewer: 1, never: 0 },
    }),
    reapQuestion({
      stable_key: 'fish_shellfish',
      prompt: 'In an average week, how often do you eat fish, shellfish, or other seafood?',
      sort_order: 80,
      section: 'Healthy eating pattern',
      options: reapFrequencyOptionsHigh,
      numeric_map: { every_day: 3, more_than_3: 2, three_or_fewer: 1, never: 0 },
    }),
    reapQuestion({
      stable_key: 'beans_legumes',
      prompt: 'In an average week, how often do you eat beans, peas, lentils, or other legumes?',
      sort_order: 90,
      section: 'Healthy eating pattern',
      options: reapFrequencyOptionsHigh,
      numeric_map: { every_day: 3, more_than_3: 2, three_or_fewer: 1, never: 0 },
    }),
    reapQuestion({
      stable_key: 'nuts_nut_butters',
      prompt: 'In an average week, how often do you eat tree nuts, peanuts, or nut butters?',
      sort_order: 100,
      section: 'Healthy eating pattern',
      options: reapFrequencyOptionsHigh,
      numeric_map: { every_day: 3, more_than_3: 2, three_or_fewer: 1, never: 0 },
    }),
    reapQuestion({
      stable_key: 'vegetable_oils',
      prompt: 'In an average week, how often do you use olive oil, peanut oil, or other vegetable oils?',
      sort_order: 110,
      section: 'Healthy eating pattern',
      options: reapFrequencyOptionsHigh,
      numeric_map: { every_day: 3, more_than_3: 2, three_or_fewer: 1, never: 0 },
    }),
    reapQuestion({
      stable_key: 'high_fat_meats',
      prompt:
        'In an average week, how often do you eat high-fat meats such as hamburger, ribs, steak, lamb chops, chicken or turkey wings, hot dogs, or cold cuts such as bologna and salami?',
      sort_order: 120,
      section: 'Low nutrient density foods',
      options: reapFrequencyOptionsHigh,
      numeric_map: { every_day: 0, more_than_3: 1, three_or_fewer: 2, never: 3 },
    }),
    reapQuestion({
      stable_key: 'solid_fats',
      prompt:
        'In an average week, how often do you eat more than 1 tablespoon of cooking or table fats that are solid at room temperature, such as butter, stick margarine, bacon fat, or vegetable shortening?',
      helper: 'One tablespoon is about the size of a poker chip.',
      sort_order: 130,
      section: 'Low nutrient density foods',
      options: reapFrequencyOptionsHigh,
      numeric_map: { every_day: 0, more_than_3: 1, three_or_fewer: 2, never: 3 },
    }),
    reapQuestion({
      stable_key: 'sweet_drinks',
      prompt:
        'In an average week, how often do you drink 12 ounces or more of non-diet soda, fruit drink or punch, fruit juice, or Kool-Aid per day?',
      helper: 'One can of soda is 12 ounces.',
      sort_order: 140,
      section: 'Low nutrient density foods',
      options: reapFrequencyOptionsHigh,
      numeric_map: { every_day: 0, more_than_3: 1, three_or_fewer: 2, never: 3 },
    }),
    reapQuestion({
      stable_key: 'sweets',
      prompt:
        'In an average week, how often do you eat sweets like cake, cookies, pastries, donuts, toaster pastries, muffins, chocolate, or candy?',
      sort_order: 150,
      section: 'Low nutrient density foods',
      options: reapFrequencyOptionsHigh,
      numeric_map: { every_day: 0, more_than_3: 1, three_or_fewer: 2, never: 3 },
    }),
    reapQuestion({
      stable_key: 'packaged_snacks',
      prompt: 'In an average week, how often do you eat packaged snack foods such as chips, salted pretzels, pizza bites, and similar items?',
      sort_order: 160,
      section: 'Low nutrient density foods',
      options: reapFrequencyOptionsHigh,
      numeric_map: { every_day: 0, more_than_3: 1, three_or_fewer: 2, never: 3 },
    }),
    reapQuestion({
      stable_key: 'restaurant_takeout_convenience',
      prompt:
        'In an average week, how often do you eat meals from restaurants, take-out places, convenience stores, or entertainment venues?',
      sort_order: 170,
      section: 'Low nutrient density foods',
      options: reapFrequencyOptionsHigh,
      numeric_map: { every_day: 0, more_than_3: 1, three_or_fewer: 2, never: 3 },
    }),
    reapQuestion({
      stable_key: 'home_cooked_from_basic_ingredients',
      prompt:
        'In an average week, how often do you prepare meals at home from basic ingredients such as fresh or frozen vegetables, uncooked poultry, pasta, beans, and similar items?',
      sort_order: 180,
      section: 'Low nutrient density foods',
      options: reapFrequencyOptionsHigh,
      numeric_map: { every_day: 3, more_than_3: 2, three_or_fewer: 1, never: 0 },
    }),
    reapQuestion({
      stable_key: 'alcohol_above_guideline',
      prompt:
        'In an average week, how often do you have more than 1 alcoholic drink per day if you are a woman, or more than 2 alcoholic drinks per day if you are a man?',
      helper: 'One drink equals 5 oz wine, 12 oz beer, or 1½ oz hard liquor.',
      sort_order: 190,
      section: 'Low nutrient density foods',
      options: reapFrequencyOptionsHigh,
      numeric_map: { every_day: 0, more_than_3: 1, three_or_fewer: 2, never: 3 },
    }),
    reapQuestion({
      stable_key: 'exercise_walk_mile_or_15_minutes',
      prompt:
        'In an average week, how often do you walk at least one mile (about 2,000 steps) or exercise for at least 15 minutes?',
      sort_order: 200,
      section: 'Exercise',
      options: reapFrequencyOptionsHigh,
      numeric_map: { every_day: 3, more_than_3: 2, three_or_fewer: 1, never: 0 },
    }),
    reapQuestion({
      stable_key: 'readiness_to_change',
      prompt: 'How interested are you in making changes to your eating or physical activity habits in order to be healthier?',
      sort_order: 210,
      section: 'Readiness to change',
      options: [
        option('very_interested', 'Very interested'),
        option('interested', 'Interested'),
        option('disinterested', 'Disinterested'),
        option('very_disinterested', 'Very disinterested'),
      ],
    }),
  ],
}

const intakeChoice = (
  stable_key: string,
  prompt: string,
  section: string,
  options: ChoiceOption[],
  sort_order: number,
  extra: Record<string, unknown> = {},
) => ({
  stable_key,
  prompt,
  response_type: 'single_choice' as const,
  required: false,
  enabled: true,
  sort_order,
  metric_name: null,
  unit: null,
  anchors: {},
  config: helperConfig(options, { section, ...extra }),
})

const intakeMulti = (
  stable_key: string,
  prompt: string,
  section: string,
  options: ChoiceOption[],
  sort_order: number,
  extra: Record<string, unknown> = {},
) => ({
  stable_key,
  prompt,
  response_type: 'multiple_choice' as const,
  required: false,
  enabled: true,
  sort_order,
  metric_name: null,
  unit: null,
  anchors: {},
  config: helperConfig(options, { section, ...extra }),
})

const intakeText = (
  stable_key: string,
  prompt: string,
  section: string,
  sort_order: number,
  long = false,
  extra: Record<string, unknown> = {},
) => ({
  stable_key,
  prompt,
  response_type: (long ? 'long_text' : 'short_text') as 'long_text' | 'short_text',
  required: false,
  enabled: true,
  sort_order,
  metric_name: null,
  unit: null,
  anchors: {},
  config: { section, ...extra },
})

export const intakeDefinition: ManagedTemplateDefinition = {
  stable_key: SIMPLE_FOOD_INTAKE_KEY,
  display_name: 'Nutrition & GI intake',
  enabled: true,
  description:
    'Structured nutrition and digestive-health intake. This is a clinically informed personal history, not a validated diagnostic instrument.',
  moment: 'custom',
  questions: [
    intakeChoice(
      'dietary_pattern',
      'Typical dietary pattern',
      'Dietary background',
      [
        option('omnivorous', 'Omnivorous'),
        option('higher_protein', 'Higher protein'),
        option('lower_carb', 'Lower carb / keto-leaning'),
        option('vegetarian', 'Vegetarian'),
        option('vegan', 'Vegan'),
        option('mixed_or_variable', 'Mixed / variable'),
        option('other', 'Other'),
      ],
      10,
    ),
    intakeMulti(
      'dietary_restrictions',
      'Dietary restrictions or boundaries',
      'Dietary background',
      [
        option('none', 'None'),
        option('gluten', 'Avoiding gluten'),
        option('dairy', 'Avoiding dairy'),
        option('low_fodmap', 'Low-FODMAP or similar GI-directed pattern'),
        option('halal_kosher', 'Religious restrictions'),
        option('weight_cutting', 'Intentional weight-control restrictions'),
        option('other', 'Other'),
      ],
      20,
    ),
    intakeText('food_allergies_or_intolerances', 'Food allergies or intolerances', 'Dietary background', 30, true),
    intakeChoice(
      'meal_schedule',
      'Typical meal schedule',
      'Dietary background',
      [
        option('very_regular', 'Very regular meals'),
        option('mostly_regular', 'Mostly regular'),
        option('variable', 'Variable'),
        option('often_skips_meals', 'Often skips meals'),
        option('late_shift_pattern', 'Late / shift-work style pattern'),
      ],
      40,
    ),
    intakeText('major_nutrition_goals', 'Major nutrition goals', 'Dietary background', 50, true),
    intakeMulti(
      'common_digestive_symptoms',
      'Common digestive symptoms',
      'Digestive health',
      [
        option('bloating', 'Bloating / pressure'),
        option('reflux', 'Reflux / heartburn'),
        option('nausea', 'Nausea'),
        option('abdominal_pain', 'Abdominal pain'),
        option('constipation', 'Constipation'),
        option('diarrhea', 'Diarrhea'),
        option('urgent_bowel_movements', 'Urgency'),
        option('uncomfortable_fullness', 'Uncomfortable fullness'),
      ],
      60,
    ),
    intakeText('suspected_dietary_triggers', 'Suspected dietary triggers', 'Digestive health', 70, true),
    intakeChoice(
      'bowel_habit_pattern',
      'Typical bowel habit pattern',
      'Digestive health',
      [
        option('usually_regular', 'Usually regular'),
        option('constipation_prone', 'Constipation-prone'),
        option('diarrhea_prone', 'Diarrhea-prone'),
        option('mixed', 'Mixed / inconsistent'),
        option('not_sure', 'Not sure'),
      ],
      80,
    ),
    intakeChoice(
      'digestive_symptom_frequency',
      'How often do digestive symptoms interfere with the day?',
      'Digestive health',
      [
        option('rarely', 'Rarely'),
        option('weekly', 'About weekly'),
        option('several_times_week', 'Several times a week'),
        option('daily', 'Daily or near-daily'),
      ],
      90,
    ),
    intakeChoice(
      'symptoms_affect_sleep_or_eating',
      'Do symptoms interfere with eating or sleep?',
      'Digestive health',
      [
        option('no', 'No'),
        option('sometimes', 'Sometimes'),
        option('often', 'Often'),
      ],
      100,
    ),
    intakeChoice(
      'recent_weight_change',
      'Recent unintentional weight change',
      'Health context',
      [
        option('none_known', 'None known'),
        option('loss_small', 'Some loss'),
        option('loss_large', 'Significant loss'),
        option('gain_small', 'Some gain'),
        option('gain_large', 'Significant gain'),
        option('not_sure', 'Not sure'),
      ],
      110,
    ),
    intakeChoice(
      'appetite_change',
      'Appetite change',
      'Health context',
      [
        option('stable', 'Stable'),
        option('lower', 'Lower than usual'),
        option('higher', 'Higher than usual'),
        option('variable', 'Very variable'),
      ],
      120,
    ),
    intakeText('relevant_conditions', 'Relevant diagnosed conditions', 'Health context', 130, true),
    intakeText(
      'medications_supplements_context',
      'Medication or supplement context (reference existing Treatments records when possible)',
      'Health context',
      140,
      true,
    ),
    intakeChoice(
      'caffeine_pattern',
      'Typical caffeine use',
      'Health context',
      [
        option('none', 'None'),
        option('light', 'Light'),
        option('moderate', 'Moderate'),
        option('heavy', 'Heavy'),
        option('variable', 'Very variable'),
      ],
      150,
    ),
    intakeChoice(
      'alcohol_pattern',
      'Typical alcohol use',
      'Health context',
      [
        option('none', 'None'),
        option('occasional', 'Occasional'),
        option('weekly', 'Weekly'),
        option('frequent', 'Frequent'),
        option('prefer_not_to_say', 'Prefer not to say'),
      ],
      160,
    ),
    intakeChoice(
      'food_access_concerns',
      'Food availability or access concerns',
      'Health context',
      [
        option('none', 'None'),
        option('sometimes', 'Sometimes'),
        option('ongoing', 'Ongoing concern'),
        option('prefer_not_to_say', 'Prefer not to say'),
      ],
      170,
    ),
    intakeChoice(
      'snacking_pattern',
      'Typical snacking pattern',
      'Eating patterns',
      [
        option('rare', 'Rare'),
        option('intentional', 'Intentional / planned'),
        option('frequent', 'Frequent'),
        option('grazing', 'Grazing most of the day'),
      ],
      180,
    ),
    intakeChoice(
      'late_night_eating',
      'Eating late at night',
      'Eating patterns',
      [
        option('rarely', 'Rarely'),
        option('sometimes', 'Sometimes'),
        option('often', 'Often'),
        option('most_days', 'Most days'),
      ],
      190,
    ),
    intakeChoice(
      'typical_meal_size',
      'Typical meal size',
      'Eating patterns',
      [
        option('small', 'Usually small'),
        option('medium', 'Usually moderate'),
        option('large', 'Often large'),
        option('very_variable', 'Very variable'),
      ],
      200,
    ),
    intakeChoice(
      'uncomfortable_fullness_frequency',
      'Episodes of uncomfortable fullness',
      'Eating patterns',
      [
        option('rarely', 'Rarely'),
        option('monthly', 'About monthly'),
        option('weekly', 'About weekly'),
        option('several_times_week', 'Several times a week or more'),
      ],
      210,
    ),
    intakeChoice(
      'hunger_cues',
      'Are hunger cues easy to recognize?',
      'Eating patterns',
      [
        option('easy', 'Yes, usually clear'),
        option('mixed', 'Mixed'),
        option('difficult', 'Often difficult'),
      ],
      220,
    ),
    intakeText('intake_notes', 'Anything else worth noting', 'Notes', 230, true),
  ],
}

export const managedSimpleFoodTemplates = [
  dailyQuestionnaireDefinition,
  reapsDefinition,
  intakeDefinition,
]

export const managedContextTypes: CreateContextEventTypeBody[] = [
  {
    key: SIMPLE_FOOD_FULLNESS_KEY,
    display_name: 'Simple Food · Fullness',
    description: 'Simple Food Tracker fullness check-ins. Intensity 0–4 maps to the simple_food_fullness metric.',
    active: true,
  },
  {
    key: SIMPLE_FOOD_BLOATING_KEY,
    display_name: 'Simple Food · Bloating',
    description: 'Simple Food Tracker bloating check-ins. Intensity 0–3 maps to the simple_food_bloating metric.',
    active: true,
  },
  {
    key: SIMPLE_FOOD_REFLUX_KEY,
    display_name: 'Simple Food · Reflux',
    description: 'Simple Food Tracker reflux check-ins. Intensity 0–3 maps to the simple_food_reflux metric.',
    active: true,
  },
]

export const pad = (value: number): string => value.toString().padStart(2, '0')

export const localDateKey = (date = new Date()): string => format(date, 'yyyy-MM-dd')

export const shiftDate = (date: string, days: number): string => format(addDays(new Date(`${date}T12:00:00`), days), 'yyyy-MM-dd')

export const localDateToNoonIso = (date: string): string => {
  const parsed = new Date(`${date}T12:00:00`)
  if (!date || Number.isNaN(parsed.getTime()) || format(parsed, 'yyyy-MM-dd') !== date) {
    throw new Error('Enter a valid date.')
  }
  return parsed.toISOString()
}

export const nowLocalDateTime = (): string => {
  const date = new Date()
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export const isoToLocalDateTime = (iso: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export const localDateTimeToIso = (local: string): string => {
  const date = new Date(local)
  if (!local || Number.isNaN(date.getTime())) throw new Error('Enter a valid date and time.')
  return date.toISOString()
}

const zonedParts = (iso: string, timeZone: string): Record<string, string> =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map(({ type, value }) => [type, value]),
  )

export const dateKeyInZone = (iso: string, timeZone: string): string => {
  const parts = zonedParts(iso, timeZone)
  return `${parts.year}-${parts.month}-${parts.day}`
}

export const hourInZone = (iso: string, timeZone: string): number => Number(zonedParts(iso, timeZone).hour)

export const symptomTimeBucket = (iso: string, timeZone: string): string => {
  const hour = hourInZone(iso, timeZone)
  if (hour < 6) return 'Overnight'
  if (hour < 11) return 'Morning'
  if (hour < 15) return 'Midday'
  if (hour < 19) return 'Afternoon'
  return 'Evening'
}

export const questionnaireByKey = (
  templates: QuestionnaireTemplate[] | undefined,
  stableKey: string,
): QuestionnaireTemplate | undefined => templates?.find((template) => template.stable_key === stableKey)

export const contextTypeByKey = (
  types: ContextEventType[] | undefined,
  key: string,
): ContextEventType | undefined => types?.find((type) => type.key === key)

export const responseMap = (
  assessment: Assessment | undefined,
  template: QuestionnaireTemplate | undefined,
): Record<string, unknown> => {
  if (!assessment || !template) return {}
  const questions = new Map(template.questions.map((question) => [question.id, question]))
  return Object.fromEntries(
    assessment.responses
      .map((response) => {
        const question = questions.get(response.question_id)
        return question ? [question.stable_key, response.value] : null
      })
      .filter((entry): entry is [string, unknown] => !!entry),
  )
}

export const latestAssessmentForTemplate = (
  assessments: Assessment[],
  templateId: string | undefined,
  stage?: string,
): Assessment | undefined =>
  assessments
    .filter(
      (assessment) =>
        !assessment.deleted_at &&
        (!!templateId && assessment.template_id === templateId) &&
        (stage === undefined || (assessment.stage ?? 'completed') === stage),
    )
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at) || right.assessed_at.localeCompare(left.assessed_at))[0]

export const assessmentForLocalDate = (
  assessments: Assessment[],
  templateId: string | undefined,
  localDate: string,
): Assessment | undefined =>
  assessments
    .filter(
      (assessment) =>
        !assessment.deleted_at &&
        !!templateId &&
        assessment.template_id === templateId &&
        dateKeyInZone(assessment.assessed_at, assessment.timezone) === localDate,
    )
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at) || right.assessed_at.localeCompare(left.assessed_at))[0]

export const completedAssessments = (
  assessments: Assessment[],
  templateId: string | undefined,
): Assessment[] =>
  assessments
    .filter(
      (assessment) =>
        !assessment.deleted_at &&
        !!templateId &&
        assessment.template_id === templateId &&
        (assessment.stage ?? 'completed') !== 'draft',
    )
    .sort((left, right) => right.assessed_at.localeCompare(left.assessed_at) || right.updated_at.localeCompare(left.updated_at))

export const latestDraftAssessment = (
  assessments: Assessment[],
  templateId: string | undefined,
): Assessment | undefined => latestAssessmentForTemplate(assessments, templateId, 'draft')

export const optionsForQuestion = (question: QuestionnaireTemplate['questions'][number]): ChoiceOption[] => {
  const raw = question.config.options
  return Array.isArray(raw)
    ? raw.filter(
        (item): item is ChoiceOption =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as ChoiceOption).value === 'string' &&
          typeof (item as ChoiceOption).label === 'string',
      )
    : []
}

export const questionSection = (question: QuestionnaireTemplate['questions'][number]): string =>
  typeof question.config.section === 'string' ? question.config.section : 'Questions'

export const questionDescription = (question: QuestionnaireTemplate['questions'][number]): string | undefined =>
  typeof question.config.description === 'string'
    ? question.config.description
    : typeof question.config.helper === 'string'
      ? question.config.helper
      : undefined

export const choiceLabel = (
  question: QuestionnaireTemplate['questions'][number] | undefined,
  value: unknown,
): string => {
  if (!question || typeof value !== 'string') return typeof value === 'string' ? value : String(value ?? '')
  return optionsForQuestion(question).find((optionItem) => optionItem.value === value)?.label ?? value
}

export const formatAnswer = (
  question: QuestionnaireTemplate['questions'][number] | undefined,
  value: unknown,
): string => {
  if (Array.isArray(value)) return value.map((item) => choiceLabel(question, item)).join(', ')
  if (typeof value === 'string') return choiceLabel(question, value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return value == null ? '—' : String(value)
}

export interface ReapsScores {
  sections: Record<'exercise' | 'food_sufficiency' | 'healthy_pattern' | 'low_nutrient_density', number>
  readiness: string | null
  total: number
}

const reapsSectionKeys: Record<keyof ReapsScores['sections'], string[]> = {
  food_sufficiency: [
    'not_well_enough_to_shop_or_cook',
    'fewer_than_two_meals',
    'less_than_three_ounces_protein',
    'less_than_two_calcium_servings',
  ],
  healthy_pattern: [
    'vegetables_three_servings',
    'fruit_two_servings',
    'whole_grains_high_fiber',
    'fish_shellfish',
    'beans_legumes',
    'nuts_nut_butters',
    'vegetable_oils',
  ],
  low_nutrient_density: [
    'high_fat_meats',
    'solid_fats',
    'sweet_drinks',
    'sweets',
    'packaged_snacks',
    'restaurant_takeout_convenience',
    'home_cooked_from_basic_ingredients',
    'alcohol_above_guideline',
  ],
  exercise: ['exercise_walk_mile_or_15_minutes'],
}

export const reapThresholds = {
  food_sufficiency: 8,
  healthy_pattern: 14,
  low_nutrient_density: 16,
  exercise: 1,
} as const

export const scoreFromQuestion = (
  question: QuestionnaireTemplate['questions'][number] | undefined,
  value: unknown,
): number | null => {
  if (!question) return null
  if (typeof value === 'number' && ['numeric', 'likert'].includes(question.response_type)) return value
  if (typeof value !== 'string') return null
  const rawMap = question.config.numeric_map
  if (typeof rawMap !== 'object' || rawMap === null || Array.isArray(rawMap)) return null
  const mapped = (rawMap as Record<string, unknown>)[value]
  return typeof mapped === 'number' && Number.isFinite(mapped) ? mapped : null
}

export const scoreReapsAssessment = (
  assessment: Assessment | undefined,
  template: QuestionnaireTemplate | undefined,
): ReapsScores | null => {
  if (!assessment || !template) return null
  const values = responseMap(assessment, template)
  const questions = new Map(template.questions.map((question) => [question.stable_key, question]))
  const sections = {
    exercise: 0,
    food_sufficiency: 0,
    healthy_pattern: 0,
    low_nutrient_density: 0,
  }
  for (const [section, keys] of Object.entries(reapsSectionKeys) as [keyof typeof sections, string[]][]) {
    sections[section] = keys.reduce((sum, key) => sum + (scoreFromQuestion(questions.get(key), values[key]) ?? 0), 0)
  }
  return {
    sections,
    readiness: typeof values.readiness_to_change === 'string' ? choiceLabel(questions.get('readiness_to_change'), values.readiness_to_change) : null,
    total: sections.exercise + sections.food_sufficiency + sections.healthy_pattern + sections.low_nutrient_density,
  }
}

export const sectionVerdict = (section: keyof typeof reapThresholds, score: number): string =>
  score <= reapThresholds[section] ? 'Investigate / discuss' : 'Encourage / commend'

export const symptomMetricKey = (event: ContextEvent): keyof typeof simpleFoodMetricNames | null => {
  switch (event.event_type.key) {
    case SIMPLE_FOOD_FULLNESS_KEY:
      return 'fullness'
    case SIMPLE_FOOD_BLOATING_KEY:
      return 'bloating'
    case SIMPLE_FOOD_REFLUX_KEY:
      return 'reflux'
    default:
      return null
  }
}

export const simpleFoodEvents = (events: ContextEvent[]): ContextEvent[] =>
  events.filter((event) => symptomMetricKey(event) !== null && !event.deleted_at)

export const latestEventByType = (
  events: ContextEvent[],
  key: string,
): ContextEvent | undefined =>
  simpleFoodEvents(events)
    .filter((event) => event.event_type.key === key)
    .sort((left, right) => right.started_at.localeCompare(left.started_at))[0]

export const categoryCount = <T extends string>(values: T[]): Record<T, number> =>
  values.reduce(
    (counts, value) => ({ ...counts, [value]: (counts[value] ?? 0) + 1 }),
    {} as Record<T, number>,
  )

export const viewForQuery = (view: string | undefined): SimpleFoodView =>
  simpleFoodViews.some((candidate) => candidate.key === view) ? (view as SimpleFoodView) : 'today'

export const simpleFoodUrl = (
  currentSearch: string | URLSearchParams | Record<string, string | undefined>,
  changes: Record<string, string | undefined>,
): string => {
  const params =
    currentSearch instanceof URLSearchParams
      ? new URLSearchParams(currentSearch)
      : typeof currentSearch === 'string'
        ? new URLSearchParams(currentSearch.replace(/^\?/, ''))
        : new URLSearchParams(
            Object.entries(currentSearch).filter((entry): entry is [string, string] => entry[1] !== undefined),
          )
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) params.delete(key)
    else params.set(key, value)
  }
  const search = params.toString()
  return `/simple-food${search ? `?${search}` : ''}`
}

import type { TaskBoardColumn } from '@aurboda/api-spec'

/** Source guidance becomes ordinary private task text at the one-time seed. */
export interface OnboardingCard {
  key: string
  title: string
  description: string
}

const optional =
  'This is optional. If you already did this, move the card to a Done-category column or use its checkmark. You can complete or delete this card whenever you prefer.'
const reveal = (page: string) =>
  `If ${page} is hidden in your menu, open [Settings](/settings) → Feature Control and enable ${page}. Hiding a page changes menu visibility only; it does not delete data or stop collection.`

const feature = (
  key: string,
  title: string,
  guidance: string,
  page: string,
  done: string,
): OnboardingCard => ({
  key,
  title,
  description: `${guidance}\n\n${reveal(page)}\n\nDone when: ${done}\n\n${optional}`,
})

const assessment = (key: string, title: string, guidance: string, numeric = true): OnboardingCard =>
  feature(
    key,
    title,
    `${guidance}\n\nOpen [Mental assessments](/assessments), find this instrument, use its external test link if needed, then Record result. Enter the actual test time and any useful conditions; save and check the saved result/history. ${numeric ? 'Its numeric fields also become instrument-specific metrics available in Chart.' : 'This keeps a report in assessment history; it does not create a pooled numeric chart series.'} Later entries can be reviewed in history; compare only the same version and protocol. No diagnosis, clinical interpretation or personalized recommendation is provided.`,
    'Mental assessments',
    'you have saved and reviewed one real result for this instrument, or chosen to skip it.',
  )

const benchmark = (key: string, title: string, purpose: string, unit: string): OnboardingCard =>
  assessment(
    `benchmark_${key}`,
    `Try ${title.toLowerCase()}`,
    `${title} from Human Benchmark is an informal ${purpose} exercise. Record the final ${unit} shown by the provider. Use the same device, browser and input method for later comparisons; practice and hardware affect results. These scores are separate from the Foghouse Home games.`,
  )

const treatment = (key: string, title: string, guidance: string): OnboardingCard =>
  feature(
    key,
    title,
    `Only relevant if ketamine treatment is already part of your care. ${guidance} Open [Treatments](/treatments) and use the named questionnaire at the appropriate actual time. Save your own answers and review the assessment in Treatments → Journal. Answers and any configured numeric question metrics are retained for later review; compare the same question version and timing. These editable personal check-ins are not validated diagnostic scales, a treatment recommendation, or evidence of treatment effectiveness. Do not create a treatment or invent answers to finish this card.`,
    'Treatments',
    'you have saved and reviewed this relevant check-in, or deleted the card because it does not apply.',
  )

/** Order is introductory setup, first uses, distinct baselines, then optional connections. */
export function onboardingCatalog(columns: TaskBoardColumn[]): OnboardingCard[] {
  const inProgress = columns.find((column) => column.status === 'in_progress')?.title ?? 'In progress'
  const done = columns.find((column) => column.status === 'done')?.title ?? 'Done'
  return [
    {
      key: 'feature_control',
      title: 'Make the tracker fit you',
      description: `Open [Settings](/settings) → Feature Control. Hide a page you do not expect to use and enable another you are curious about, then return to the navigation to see the difference. Keep whichever arrangement you prefer. If you already like your selection, reviewing it is enough. Each switch saves immediately.\n\nHiding changes menu visibility only. It does not delete records, stop collection or integrations, or remove access through a direct link. Settings stays available to restore pages.\n\nDone when: you know where visibility is controlled and have chosen the pages you want to see.\n\n${optional}`,
    },
    feature(
      'kanban',
      'Move and finish a card',
      `Open [Tasks](/goals) and choose Board. Move this card to “${inProgress}” by its drag handle or its ••• → Move to menu. Click its title to read or edit the details. Use its checkmark or move it to “${done}” to finish; moving back reopens it. The category, rather than a column’s title, controls completion.\n\nThese are normal tasks: edit, move, complete or delete them in any order. Delete irrelevant cards through •••. To remove Onboarding permanently, move or delete all its tasks (including archived tasks), then remove the empty column in Board settings. Deleted onboarding guidance is not refilled.`,
      'Tasks',
      'you have moved this card into your workflow and completed it.',
    ),
    feature(
      'settings',
      'Review your account settings',
      'Open [Settings](/settings). Review Profile, Personal Information, Feed & Followers and the other sections that matter to you. Change only information you want to supply and confirm saved changes. HR Zone Thresholds are optional; leave the defaults unless you have a reason to customize them. This helps you understand which personal and sharing settings the tracker uses.',
      'Settings',
      'you have reviewed the settings and kept or saved the choices you want.',
    ),
    feature(
      'journal',
      'Try a private reflection',
      'Open [Journal](/journal) and choose Write, or browse Prompted journals for a workbook that interests you. Write something meaningful to you; skip prompts you do not want to answer. Use Save now and return to your entry to confirm it saved. This introduces free writing and guided reflection without requiring sensitive details.',
      'Journal',
      'you can find one saved entry or workbook response again.',
    ),
    feature(
      'people',
      'Keep one useful People record',
      'If relationship tracking is useful to you, open [PEOPLE](/people). Add a real person with only the information you want to retain, or review an existing record. Explore an important date or relationship note if relevant. This gives you a place to find relationship context again; care, pregnancy and child guidance are optional and should be used only when applicable.',
      'PEOPLE',
      'you can reopen a useful real record, or have decided this feature is not for you.',
    ),
    feature(
      'resources',
      'Find a useful resource',
      'Open [Resources](/resources), browse the available folders and open or download a file or link you want to keep handy. Resources is a shared library, so what is available depends on this server. Browsing does not require administrator upload or management privileges; if the library is empty, simply note where it is.',
      'Resources',
      'you know where to find available shared resources, even if none are useful yet.',
    ),
    feature(
      'first_data',
      'Follow one real entry through the tracker',
      'Open [+ Add](/add) if you have a real measurement, tag or activity to record, or use an existing entry. Find it in [Data](/data) or [Timeline](/timeline). For numeric measurements, open [Chart](/chart) and select the matching metric and time range. One point teaches where data appears; it does not establish a trend. Use actual values and units, and skip entry if you have nothing meaningful to record.',
      '+ Add, Data, Timeline or Chart',
      'you can find and review a real entry in the appropriate view.',
    ),
    feature(
      'work',
      'Set up a useful Work day',
      'If Work fits your life, open [Work](/work), review its profile/setup choices, then record a real day using the fields that apply. Save and reopen the day to check it. This introduces the configurable daily tracker and history; blank or unknown information should stay that way rather than becoming invented measurements.',
      'Work',
      'a relevant day is saved and can be reopened, or you have decided to skip Work.',
    ),
    feature(
      'export',
      'Know where your account download lives',
      'Open [Settings](/settings) → Export account data and read the scope before using the download control. This produces a compressed SQL account export for technical restore, not an in-app import or spreadsheet. It includes private task descriptions and board settings. Shared Resources and other central server data are outside this per-account download; unsaved browser drafts are not included. You do not need to generate a download to complete this discovery task.',
      'Settings',
      'you know where to request the export and what it includes.',
    ),
    assessment(
      'pss14',
      'Record a perceived stress baseline',
      'PSS-14 measures self-reported perceived stress over the past month. On the linked PsyToolkit page use Run demo for exactly 14 items and enter the total 0–56 points, not a PSS-10 result. Higher scores mean more perceived stress, not a diagnosis. Recall windows can overlap on repeat entries.',
    ),
    assessment(
      'swls',
      'Record life satisfaction',
      'The Satisfaction With Life Scale (SWLS) asks about satisfaction with life as a whole. Use the five-item version and enter its total 5–35 points. This is a self-report reflection, not a diagnostic test or a target score.',
    ),
    assessment(
      'who5',
      'Record well-being with WHO-5',
      'WHO-5 asks about mental well-being over the past two weeks. Enter the 0–100 standardized score, in multiples of four (raw 0–25 × 4), not the raw total. Higher means greater reported well-being. Overlapping recall periods limit short-interval comparisons; the app does not diagnose from the result.',
    ),
    assessment(
      'big_five',
      'Explore your Big Five profile',
      'The Big Five IPIP inventory records five self-reported personality domain totals. Select Out of 120 for IPIP-NEO-120 raw totals of 24–120 each, or Out of 300 for IPIP-NEO-300 raw totals of 60–300 each. Enter raw points, never percentages or percentiles. The selector changes entry fields and history; the formats have distinct metrics and are not converted or directly comparable. Keep facets in report notes if useful. Traits describe tendencies, with no preferred result.',
    ),
    assessment(
      'mensa',
      'Try the Mensa practice challenge',
      'Mensa IQ Challenge is an optional 35-puzzle, 25-minute reasoning practice activity. It does not qualify you for Mensa or replace a supervised test. Select the numeric format only for an actual returned estimate (the entry form accepts 40–200). If the provider returns a message instead, select the descriptive format and copy the exact message; never infer a number. Numeric estimates have their own metric; descriptive results remain reports without numeric metrics. Note first/repeat attempt because practice changes comparisons.',
    ),
    benchmark('reaction', 'Reaction time', 'response-speed', 'average reaction time in milliseconds'),
    benchmark('visual_memory', 'Visual memory', 'visual pattern recall', 'level'),
    benchmark('number_memory', 'Number memory', 'digit recall', 'number of digits'),
    benchmark('sequence_memory', 'Sequence memory', 'sequence recall', 'level'),
    benchmark('verbal_memory', 'Verbal memory', 'word recognition', 'points'),
    assessment(
      'testmybrain',
      'Explore a TestMyBrain study',
      'TestMyBrain offers optional research studies whose tasks and returned results vary. Read the external study’s consent and instructions before deciding to participate. Record the exact study/test, protocol, result unit or descriptive result, and report details. Do not combine different studies or protocols; the optional numeric report field is not projected into a pooled metric.',
      false,
    ),
    feature(
      'foghouse_memory',
      'Try the Home memory game',
      'Open [Home](/), find Foghouse memory test, choose Tap to play and read How to play. This is forward spatial recall with pointer input, one unscored practice and two attempts at each length 2–9. After a completed run, choose Save result explicitly. The saved assessment includes longest successful span, correct/total scored trials and the run report; view it in Mental assessments, with numeric summaries available in Chart. Compare only the same protocol, device and input mode; practice affects results. This custom game is not a clinical Corsi test.',
      'Home, Mental assessments or Chart',
      'you have explicitly saved and reviewed a completed run, or chosen to skip the game.',
    ),
    feature(
      'foghouse_reaction',
      'Try the Home reaction game',
      'Open [Home](/), find Foghouse reaction test, choose Tap to play and read How to play. Complete the fixed three-minute protocol using its Space or tap/click mode, then choose Save result explicitly. The saved assessment retains the run report and summaries such as valid responses, anticipations, omissions and median valid reaction time when available. Review it in Mental assessments; numeric summaries are available in Chart. Compare only the same protocol, device and input mode. This custom PVT-inspired game is not a validated PVT or diagnostic assessment.',
      'Home, Mental assessments or Chart',
      'you have explicitly saved and reviewed a completed run, or chosen to skip the game.',
    ),
    feature(
      'reaps',
      'Review a nutrition baseline',
      'If useful, open [Simple food](/simple-food) → REAP-S v2 and answer the existing dietary screener. Save and review its history and displayed total out of 60, section scores and separate readiness-to-change response. This gives you a recorded dietary self-report baseline; later saved responses can be reviewed using the same version. These questionnaire answers are not a new pooled nutrition metric series, diagnosis or personalized nutrition advice.',
      'Simple food',
      'you have saved and reviewed a real REAP-S v2 response, or chosen to skip it.',
    ),
    feature(
      'nutrition_intake',
      'Keep relevant nutrition and GI context',
      'If nutrition or digestive context matters to you, open [Simple food](/simple-food) → GI intake. Review Nutrition & GI intake, enter only relevant information you want to keep, and save. You can reference existing information rather than retype it. Responses remain in assessment history for later review; this structured personal history is not a validated diagnostic instrument and has no pooled numeric score or diagnostic interpretation.',
      'Simple food',
      'you can review the relevant saved intake, or have decided to skip it.',
    ),
    treatment(
      'ketamine_pre_session',
      'Review a relevant pre-session check-in',
      'Ketamine pre-session records your preparation, intention and current state before a session.',
    ),
    treatment(
      'ketamine_post_session',
      'Review a relevant post-session check-in',
      'Ketamine post-session records the immediate experience, challenges and optional reflections after a session.',
    ),
    treatment(
      'ketamine_next_day',
      'Review a relevant next-day check-in',
      'Ketamine next-day integration records next-day state, lingering effects and optional reflections.',
    ),
    feature(
      'cpap',
      'Import CPAP history if you use it',
      'Only if you use CPAP and have an actual myAir CSV, open [CPAP](/cpap) → Import myAir records. Select your file, review the preview and validation, then import and check Session history. This is a manual CSV import, not a direct device connection or automatic sync. Do not upload sample or invented therapy data to finish onboarding.',
      'CPAP',
      'you can see your imported real sessions, or have deleted this irrelevant card.',
    ),
    feature(
      'data_source',
      'Connect one optional data source',
      'Open [Data Sources](/data-sources) and choose one service or device you actually use. Follow that page’s account-level instructions, then check its status and confirm real records arrive in Data or the relevant history. Existing connected data is enough; do not reconnect unnecessarily. Options include Oura, Garmin, Strava, ActivityWatch, RescueTime, Last.fm, OwnTracks and ICS Calendars. Android setup uses the existing upstream companion instructions; this fork does not provide its own APK. If a service needs server configuration, choose another option or skip this card; no administrator action is required of you.',
      'the selected Data Sources page or Data',
      'one relevant connection has delivered real records, or you have chosen to skip integrations.',
    ),
    feature(
      'ai_connection',
      'Discover the optional AI connection',
      'Open [Aurboda (Web / API)](/data-sources/aurboda) → Connect an AI assistant. Read the existing MCP connection instructions and decide whether you want a compatible assistant to access your data. If you choose to connect, use the displayed URL and account sign-in flow, then ask a question about data you are comfortable sharing. Existing MCP tools can query and add data; do not assume this is read-only access. You can finish by reading and deciding against connecting.',
      'Aurboda (Web / API)',
      'you understand the existing optional connection and have decided whether to use it.',
    ),
  ]
}

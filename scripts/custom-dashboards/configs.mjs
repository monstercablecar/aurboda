const widget = (id, type, config) => ({ id, type, config })
const link = (id, label, href, icon = 'trends') => widget(id, 'quick_link', { label, href, icon })
const section = (id, title, type, widgets, description, collapsed) => ({
  id,
  title,
  type,
  widgets,
  description,
  ...(collapsed ? { collapsed } : {}),
})
const spark = (metric, title, days = 28) =>
  widget(metric, 'sparkline_card', { metric, title, lookback_days: days })
const card = (metric, title, unit) => widget(metric, 'metric_card', { metric, title, unit })
const bars = (metric, title, days = 28) =>
  widget(`${metric}-daily`, 'bar_chart', {
    source_type: 'metric',
    pattern: metric,
    title,
    lookback_days: days,
    bucket_size: '1d',
    aggregation: 'sum',
  })
const trend = (metric, title) =>
  widget(`${metric}-ema`, 'trend_chart', {
    source_type: 'metric',
    pattern: metric,
    title,
    lookback_days: 90,
    half_life_days: 7,
    aggregation: 'mean',
    display_period: 'daily',
    missing_days: 'skip',
  })
const home = () => link('life-link', 'Life Overview', 'dashboard:life')
const details = (widgets) => section('details', 'Inspect the underlying data', 'links', [home(), ...widgets])
const board = (key, name, description, sections, period) => ({
  key,
  name,
  visibility: 'private',
  config: { version: 1, description, sections, ...(period ? { period } : {}) },
})
const workLinks = () => [
  link('work-detail', 'Work totals and conversions', '/work'),
  link('work-chart', 'Chart Explorer', '/chart'),
]
const treatmentLinks = () => [
  link('treatment-today', 'Today: recorded intake and logging', '/treatments?view=today', 'timeline'),
  link('treatment-library', 'Current stack and schedules', '/treatments?view=library', 'settings'),
  link('treatment-journal', 'Intake and treatment history', '/treatments?view=journal', 'timeline'),
  link(
    'treatment-insights',
    'Exposure coverage and limitations',
    '/treatments?view=insights',
    'correlations',
  ),
]
const review = (key, name, granularity) =>
  board(
    key,
    name,
    'One finished calendar period, compared with the preceding equivalent period. Means include recorded observations only; missing days are not zero. Period boundaries use your configured timezone.',
    [
      section(
        'review-summary',
        'Summary and previous-period comparison',
        'metrics',
        [
          card('cpap_usage_hours', 'CPAP hours · mean per recorded night', 'hours'),
          card('cpap_ahi', 'AHI · mean per recorded night', 'events/hour'),
          card('work_hires', 'Hires · mean per logged workday', 'count'),
          card('steps', 'Steps · mean per recorded day', 'steps'),
          widget('sleep-period', 'activity_type_card', { pattern: 'sleep', title: 'Recorded sleep' }),
        ],
        'Work cards are means, not period totals. Sleep records and CPAP usage describe different things. Compare coverage as well as values.',
      ),
      section(
        'review-output',
        'How was recorded output distributed?',
        'charts',
        [bars('work_interview_decisions', 'Completed interviews with a decision · daily recorded output')],
        'Dates without a work entry are unknown. Recorded output does not measure efficiency or hours worked.',
      ),
      details([
        ...workLinks(),
        link('cpap-detail', 'CPAP nights and import', '/cpap', 'sleep'),
        link(
          'treatment-detail',
          'Treatment and assessment coverage',
          '/treatments?view=insights',
          'correlations',
        ),
      ]),
    ],
    { granularity },
  )

export const buildDashboards = () => [
  board(
    'life',
    'Life Overview',
    'A quick view of recent observations, followed by direct access to your detailed pages. Each card names its window; a blank value means no recorded data, not zero.',
    [
      section(
        'recent',
        'Recent observations',
        'metrics',
        [
          widget('latest-sleep', 'last_sleep', { title: 'Most recent sleep · within 36 hours' }),
          spark('cpap_usage_hours', 'CPAP hours · 7-day mean per recorded night', 7),
          spark('work_hires', 'Hires · 28-day mean per logged workday'),
          spark('steps', 'Steps · 7-day mean per recorded day', 7),
          spark('assessment_morning_energy', 'Morning energy · 7-day mean recorded score', 7),
        ],
        'CPAP hours are therapy usage, not total sleep. Recent treatment and energy logs may be sparse. A mean is not a total or today’s value.',
      ),
      section('dashboards', 'Explore a domain', 'links', [
        link('sleep-link', 'Sleep & Recovery', 'dashboard:sleep', 'sleep'),
        link('work-link', 'Work & Productivity', 'dashboard:work'),
        link('treatments-link', 'Supplements & Medications', 'dashboard:treatments'),
        link('energy-link', 'Energy & Performance', 'dashboard:energy', 'correlations'),
        link('weekly-link', 'Weekly Review', 'dashboard:weekly', 'timeline'),
        link('monthly-link', 'Monthly Review', 'dashboard:monthly', 'timeline'),
      ]),
      section('sources', 'Log or inspect details', 'links', [
        link('cpap-detail', 'CPAP nights and import', '/cpap', 'sleep'),
        link('work-detail', 'Work totals and conversions', '/work'),
        link('treatment-detail', 'Stack and intake', '/treatments?view=today', 'timeline'),
        link('sleep-detail', 'Sleep analysis', '/sleep', 'sleep'),
        link('analyze-detail', 'Analyze associations', '/correlations', 'correlations'),
        link('goals-detail', 'Goals', '/goals', 'goals'),
        link('timeline-detail', 'Timeline', '/timeline', 'timeline'),
      ]),
      section(
        'data-health',
        'Check coverage before interpreting change',
        'links',
        [
          link('sync-detail', 'Source sync status', '/data-sources', 'settings'),
          link(
            'coverage-detail',
            'Treatment and assessment coverage',
            '/treatments?view=insights',
            'correlations',
          ),
        ],
        'Sync status and coverage remain in their authoritative pages. CPAP is manually imported; an absent night does not establish that therapy was unused. An unlogged dose does not establish that it was missed.',
      ),
    ],
  ),
  board(
    'sleep',
    'Sleep & Recovery',
    'Separate recorded sleep from CPAP therapy usage. Consumer measurements and descriptive associations do not establish a diagnosis or causation.',
    [
      section(
        'sleep-summary',
        'What sleep and therapy were recorded?',
        'metrics',
        [
          widget('latest-sleep', 'last_sleep', { title: 'Most recent sleep · within 36 hours' }),
          widget('sleep-28', 'activity_type_card', {
            pattern: 'sleep',
            lookback_days: 28,
            title: 'Recorded sleep · 28 days',
          }),
          spark('cpap_usage_hours', 'CPAP hours · 28-day mean per recorded night'),
          spark('cpap_ahi', 'AHI (events/hour) · 28-day mean per recorded night'),
          spark('cpap_leak_95_percentile', '95th-percentile leak · 28-day mean (L/min)'),
        ],
        'CPAP dates come from the existing myAir import’s Denver therapy-date anchor. Missing nights are unknown. Sleep-stage detail appears only when present in the underlying sleep record.',
      ),
      section(
        'sleep-trend',
        'Has recorded CPAP usage changed?',
        'charts',
        [trend('cpap_usage_hours', 'CPAP hours · smoothed observed-night mean · 90 days')],
        'EMA half-life: 7 days. Unrecorded days are skipped, not assigned zero hours.',
      ),
      details([
        link('cpap-detail', 'Detailed CPAP analysis and import', '/cpap', 'sleep'),
        link('sleep-detail', 'Sleep sessions and stages', '/sleep', 'sleep'),
        link('analyze-detail', 'Explore sleep associations', '/correlations', 'correlations'),
        link('intake-detail', 'Intake timing and history', '/treatments?view=journal', 'timeline'),
      ]),
    ],
  ),
  board(
    'work',
    'Work & Productivity',
    'Recorded output over a rolling 28-day window. The Work page remains authoritative for totals, funnel conversions and daily entry. Its calendar-aligned last-28-days window can differ at the boundary from these rolling charts.',
    [
      section(
        'work-summary',
        'Output per logged workday · 28 days',
        'metrics',
        [
          spark('work_hires', 'Hires · mean per logged workday'),
          spark('work_interview_decisions', 'Completed interviews with a decision · mean per logged workday'),
          spark('work_applications_reviewed', 'Applications reviewed · mean per logged workday'),
        ],
        'These are averages of existing daily totals, not totals for the whole window. No conversion denominator is recalculated here.',
      ),
      section(
        'work-daily',
        'When did recorded output change?',
        'charts',
        [
          bars('work_hires', 'Hires · recorded daily total · 28 days'),
          bars('work_interview_decisions', 'Completed interviews with a decision · daily total · 28 days'),
          bars('work_applications_reviewed', 'Applications reviewed · daily total · 28 days'),
        ],
        'The installed tracker saves daily totals at noon. Those timestamps cannot identify interview hours. Missing entries are unknown, and output does not measure efficiency.',
      ),
      section(
        'work-trend',
        'Longer view',
        'charts',
        [trend('work_hires', 'Hires · smoothed observed daily output · 90 days')],
        'EMA half-life: 7 days; unlogged days are skipped.',
        true,
      ),
      details([
        ...workLinks(),
        link('analyze-detail', 'Explore associations', '/correlations', 'correlations'),
      ]),
    ],
  ),
  board(
    'treatments',
    'Supplements & Medications',
    'Use the existing Treatments module for the active stack, schedules, actual intake, corrections and regimen history. A configured schedule is intent, not proof a dose was taken. This is descriptive tracking, not medication guidance.',
    [
      section(
        'stack',
        'Stack, logging and history',
        'links',
        treatmentLinks(),
        'The source pages retain dose units, routes, timestamps, versions and notes. Missing logs are unknown; schedules are never counted as exposure.',
      ),
      section(
        'recorded-dose',
        'What caffeine dose was recorded each day?',
        'charts',
        [bars('pharmacology_caffine_dose_mg', 'Recorded caffeine dose · mg per local day · 28 days')],
        'Uses the existing pharmacology daily projection and its stable metric name. This chart cannot show intake time or infer unlogged exposure. Inspect the Journal for timing; do not combine different units.',
      ),
      details([
        link('analyze-detail', 'Explore measured associations', '/correlations', 'correlations'),
        link('chart-detail', 'Chart another existing exposure metric', '/chart'),
      ]),
    ],
  ),
  board(
    'energy',
    'Energy & Performance',
    'Explore hypotheses using recorded energy, recovery and work observations. Recent assessments are sparse: no ranked prediction or causal conclusion is supported by these charts.',
    [
      section(
        'energy-scores',
        'How do recorded scores change? · 28 days',
        'metrics',
        [
          spark('assessment_morning_energy', 'Morning energy · mean recorded score'),
          spark('assessment_morning_restedness', 'Morning restedness · mean recorded score'),
          spark('assessment_midday_energy', 'Midday energy · mean recorded score'),
          spark('assessment_evening_mental_fatigue', 'Evening mental fatigue · mean recorded score'),
        ],
        'Scores retain the questionnaire definitions. Missing assessments are not low-energy days; check sample coverage in Treatments Insights.',
      ),
      section(
        'hypotheses',
        'Questions worth exploring when coverage improves',
        'links',
        [
          link(
            'analyze-detail',
            'Analyze matched observations and lag windows',
            '/correlations',
            'correlations',
          ),
          link(
            'coverage-detail',
            'Review samples and overlapping exposures',
            '/treatments?view=insights',
            'correlations',
          ),
          link(
            'journal-detail',
            'Inspect intake and assessment times',
            '/treatments?view=journal',
            'timeline',
          ),
        ],
        'Compare sleep with next-day output, CPAP with morning restedness, or preceding-day activity with energy. Match local dates and windows; inspect sample size, missing days and overlapping regimen changes. Use same-day and next-day analyses only where enough paired observations exist. Daily CPAP and dose anchors are not event times.',
        true,
      ),
      details([
        link('sleep-link', 'Sleep & Recovery', 'dashboard:sleep', 'sleep'),
        link('work-link', 'Work & Productivity', 'dashboard:work'),
        link('treatment-link', 'Supplements & Medications', 'dashboard:treatments'),
      ]),
    ],
  ),
  review('weekly', 'Weekly Review', 'week'),
  review('monthly', 'Monthly Review', 'month'),
]

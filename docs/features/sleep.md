# Sleep Analysis

Aurboda provides dedicated sleep tracking and analysis. The Sleep page shows your sleep quality trends over configurable periods, while the sleep detail view gives you a full breakdown of individual sessions including a hypnogram, Oura scores, and HR/HRV overlays.

## The Sleep Page

The page at `/sleep` shows your sleep quality over a selectable period (7, 14, 30, 60, or 90 days).

### Overview Stats

Four cards at the top show key metrics with trend arrows comparing to the previous period:

- **Sleep Score** -- Overall quality (from Oura), averaged over the period.
- **Duration** -- Average hours of actual sleep per completed sleep session (excluding awake time).
- **Efficiency** -- Time asleep vs. time in bed (percentage).
- **Latency** -- Time to fall asleep.

### Sleep Score Trend

A line chart showing your nightly sleep score over time with a dashed average line. The chart uses a blue gradient fill and shows individual data points.

### Sleep Duration Bars

A bar chart showing hours of sleep per night, color-coded:

- **Green** (7-9 hours) -- reference range, highlighted as a target zone band.
- **Yellow** (6-7 or 9+ hours) -- caution range.
- **Red** (under 6 hours) -- insufficient sleep.

A dashed average line shows your overall average.

### Sleep Components

Five Oura sleep sub-scores (when available): Total Score, Deep Sleep, REM Sleep, Restfulness, and Timing. Each shows the period average with a trend percentage.

## Sleep Detail View

Clicking a sleep session (from the Timeline, Data Browser, or elsewhere) opens a detailed view showing:

### Hypnogram

A colored chart showing your progression through sleep stages over the night:

- **Awake** (amber, top)
- **REM** (purple)
- **Light** (light blue)
- **Deep** (indigo, bottom)

Heart rate (red) and HRV (teal) lines can be overlaid on the hypnogram. Hovering shows exact values at any point in time.

### Sleep Metrics

When connected to Oura: Sleep Score, Efficiency, Restfulness, Deep Score, and REM Score displayed as metric cards.

Time fields show "In Bed" (total time in bed), "Asleep" (actual sleep time excluding awake periods), and average HRV during the session.

### Additional Context

- **Music** playing during the session (via Last.fm).
- **Sleep location** -- the place where you slept, determined by finding the location visit with the longest overlap during the sleep window.
- **Source records** -- if the sleep was merged from multiple sources (e.g., Oura + Health Connect), shows each source with links.
- **Notes** -- attach comments to any sleep session.

## Primary vs. Evening Sleep

The daily summary distinguishes two sleep slots:

- **Primary sleep**: The session you woke up from on a given date. This is the session Oura's sleep score evaluates.
- **Evening sleep**: The session that started in the evening and continues into the next day.

Sleep dates use the **wake-up convention**: a session starting at 11pm on March 7 and ending at 7am on March 8 has a sleep date of March 8.

## What Data It Needs

| Feature                     | Data source                                      |
| --------------------------- | ------------------------------------------------ |
| Sleep sessions              | Oura, Garmin, or Health Connect                  |
| Sleep stages (hypnogram)    | Health Connect (via Oura/Garmin or watch)        |
| Sleep scores and components | Oura (primary source), Garmin (sleep score only) |
| HR/HRV during sleep         | Oura, Garmin, or Health Connect                  |
| Sleep location              | OwnTracks                                        |

The Sleep page works with any sleep source, but Oura provides the richest data (scores, sub-components, stages).

## Known Limitations

- Sleep components (deep, REM, restfulness, timing) are **Oura-specific**. They don't appear for Garmin-only or Health Connect-only users.
- The Sleep page does not track **sleep debt** or **sleep need** -- it shows quality metrics but not how much sleep you need vs. how much you're getting. (See issue #302 for planned sleep debt tracking.)
- Sleep duration uses the calculated "asleep" time when available (excluding awake periods). When stage data is missing, it falls back to total time in bed.
- There is no sleep **timing consistency** analysis (e.g., tracking bedtime regularity over time), though the Oura "Timing" sub-score partially covers this.

## Sleep workspace and naps

Sleep is available in the main web navigation and Android More menu (embedded `/sleep`). It reuses the existing activity, metric and note APIs; no new storage or migrations are required. Local/public server updates serve the same web page. Android menu changes require an updated Android app.

The workspace includes responsive score/duration charts, links to CPAP, Timeline and data sources, and a session history with links to stages, source records, notes and corrections. A single score/session can be charted. Periods include today and the preceding N−1 local calendar days; sleep sessions are assigned to their wake-up day. Incomplete sessions have no calculated duration. Actual asleep time takes precedence over session length when supplied by the API. Duration averages are per completed sleep session, not a count of nights or a sleep-debt estimate. Missing days are not zero sleep.

Imported and manually recorded `nap` activities appear separately from overnight sleep. Short sessions are not automatically reclassified as naps. **Log a nap** accepts local start/end times; 10/20/30/60-minute shortcuts fill a nap ending now. The form rejects invalid, reversed, future or over-24-hour intervals and checks existing sleep/nap records for overlap before saving. This client check helps avoid duplicates but cannot prevent a concurrent import or another client writing the same period. A successful manual entry is a normal nap activity and remains editable in its detail page.

**Optional sleep check-in** lets you select a session, describe how rested you feel, record awakenings, and add optional context. At least one answer or note is needed to save. Answers are stored as an ordinary comment on that session, viewable/editable in its notes; they do not modify imported device scores or act as a clinical questionnaire. These comments follow existing activity-note access and export rules. No separate questionnaire database or local persistent draft is created.

A failed save preserves the form and displays an error. Session changes discard the page state using the existing session boundary; awaited save continuations are fenced against account changes. Period fetch failures have an explicit retry control.

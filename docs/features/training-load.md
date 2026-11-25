# Training Load

Training Load describes recorded exercise and active calories using the Banister impulse-response model. It does not measure recovery, injury risk, illness, fatigue or readiness to train. Sleep and other life demands are not inputs to this calculation.

The **Training load** page (`/training-load`) is embedded by the Android More hub and also appears on the horizontal Timeline. REST `GET /training-load` and MCP `get_training_load` use the same service.

## Model quantities

- **Long-term load (CTL):** exponential moving average with a default 42-day time constant. The historical technical alias is “fitness”; it is not a measured fitness test.
- **Short-term load (ATL):** exponential moving average with a default 7-day time constant. The technical alias is “fatigue”; it does not measure felt fatigue.
- **Load difference (TSB):** CTL minus ATL. Positive and negative values describe these two modeled quantities, with blue and purple styling. Neither is a training prescription.
- **Training impulse (TRIMP):** workout heart-rate/duration calculation. Without usable heart rate, the existing estimate is duration × 0.5. Workout `trimp_basis` and response `estimated_impulse` identify this fallback. This share covers workouts in the requested range; prior impulses still affect CTL.
- **Activity impulse:** recorded active calories multiplied by the configured scale (default 0.1).

## Coverage and compatibility

The EMA fills absent hours with zero for computation. An absent hour may mean inactivity or missing recording; the app cannot distinguish these using stored impulse buckets. Generated lookback hours must not count as observed history.

Until reliable source coverage is available, the shared read service returns `bootstrapping: true` and omits optional `zones`. CTL remains dashed and categorical model bands are suppressed. This is a conservative coverage state, not a claim every account is new. Numeric point series, raw records, settings, metric keys, workouts, REST/MCP paths and exports are unchanged. Legacy zone keys/helpers remain available for compatibility; their labels are descriptive rather than readiness/risk judgments.

## Page and Timeline

The page offers 30/90/180/365-day ranges, model quantities, a visible coverage limitation, duration-estimate provenance, chart hover/drag values, and the existing newest-first workout table with **Show all**. Settings links retain the existing time-constant controls. Timeline tooltips use the same descriptive terms and explain unknown coverage.

No new input, score, threshold, data migration or training advice is introduced. Physical Android behavior and human comprehension require separate verification; embedding the same web page does not establish those outcomes.

## Configuration

The ATL and CTL time constants can be set in **Settings → Training load** (`/settings#training-load`; leave a field empty for the default). All of these settings can be set through the API (`PATCH /user/settings`, `training_load`, which replaces the whole object) and the `update_user_settings` MCP tool:

| Setting                    | Default       | Description                                                                                                                                     |
| -------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Max HR**                 | Auto-detected | Overrides the maximum heart rate used for TRIMP calculation. Falls back to: highest observed HR in the last year, then 220 - age, then 190 bpm. |
| **Resting HR**             | Auto-detected | Overrides resting HR. Falls back to: most recent resting HR metric, then 60 bpm.                                                                |
| **Acute time constant**    | 7 days        | Controls how quickly the short-term (ATL) EMA responds. Lower = more responsive.                                                                |
| **Chronic time constant**  | 42 days       | Controls how quickly the long-term (CTL) EMA responds. Lower = more responsive.                                                                 |
| **Activity impulse scale** | 0.1           | Converts active calories to impulse units.                                                                                                      |

The TRIMP formula uses a sex-dependent weighting constant (k-factor): 1.92 for males, 1.67 for females. This is automatically selected based on your biological sex setting.

## What Data It Needs

| Input                      | Source                                      | Used for                         |
| -------------------------- | ------------------------------------------- | -------------------------------- |
| Exercise sessions          | Oura, Garmin, Health Connect                | TRIMP calculation (with HR data) |
| Heart rate during exercise | Any HR source overlapping exercise sessions | Accurate TRIMP scoring           |
| Active calories            | Health Connect aggregate, HR-computed       | Activity impulse                 |
| Resting heart rate         | Oura, Garmin, Health Connect                | TRIMP baseline                   |
| Max heart rate             | Observed from data, or manual setting       | TRIMP scaling                    |
| Biological sex             | User settings                               | TRIMP k-factor selection         |

Training load can be computed from exercise sessions using the duration fallback; missing heart rate remains explicitly estimated.

## Known Limitations

- Source completeness is unknown. Neither elapsed time nor generated empty hours establishes observed rest, recovery or sufficient history.
- The TRIMP formula assumes a specific relationship between heart rate and metabolic load. Individual variations (e.g., cardiac drift, heat, altitude) are not accounted for.
- Activity impulse from calories is a rough proxy for training stress. It doesn't distinguish between easy and hard non-workout activity.

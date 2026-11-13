# ResMed myAir CPAP

The private Foghouse CPAP page at `/cpap` imports `SLEEP_RECORD.csv` from a ResMed myAir data export. It shows session history, averages over the latest 30 recorded dates, and links to usage, AHI, leak and score charts. Android exposes the same page under **More → CPAP**.

## Setup and import

No administrator credentials, extra service or database migration are needed. Log in, request/download your myAir export, unzip it locally, and select **SLEEP_RECORD.csv** on the CPAP page. Review the date range, session count and metric count, then choose **Import records**. Import another export to update history. There is no automatic myAir synchronization.

## Imported data

The importer creates these custom metrics, with source `resmed_myair`:

| CSV column         | Metric                  | Unit        |
| ------------------ | ----------------------- | ----------- |
| USAGE_HOURS        | cpap_usage_hours        | hours       |
| AHI                | cpap_ahi                | events/hour |
| LEAK_50_PERCENTILE | cpap_leak_50_percentile | L/min       |
| LEAK_70_PERCENTILE | cpap_leak_70_percentile | L/min       |
| LEAK_95_PERCENTILE | cpap_leak_95_percentile | L/min       |
| MASK_SESSION_COUNT | cpap_mask_session_count | count       |
| SLEEP_SCORE        | cpap_sleep_score        | score       |
| AHI_SCORE          | cpap_ahi_score          | score       |
| LEAK_SCORE         | cpap_leak_score         | score       |
| MASK_SCORE         | cpap_mask_score         | score       |
| USAGE_SCORE        | cpap_usage_score        | score       |

`SESSION_DATE`, `USAGE_HOURS`, and `AHI` are required. Blank optional measurements are skipped; zero is preserved. Malformed calendar dates, negative/nonfinite numbers, and malformed CSV are rejected before import. Rows marked deleted (`RECORD_DELETE_IND=Y`) are ignored. Duplicate session dates use the newest `DATA_UPDATE_TIME`; equal timestamps use the last CSV row. Zone-less update times are interpreted consistently as UTC for ranking only.

Every date is stored at noon in **America/Denver**, including daylight saving changes. This is a stable daily identifier regardless of the browser timezone, not a sleep start or end time. No sleep activity, sleep stages or invented duration boundaries are created. These CPAP-specific metrics do not overwrite other sources' sleep scores.

## Storage and updates

CSV parsing runs locally in the browser. Only session timestamps and metric values go to the existing custom-metric and bulk-metric endpoints. The full raw CSV, patient details and device identifiers are not saved or uploaded. Definitions use average aggregation, so missing dates do not count as zero. Summary averages include actual zero values and exclude missing measurements.

Reimporting the same date uses the same timestamp, metric and source keys, updating existing measurements rather than adding duplicates. Update timestamps select among duplicates within one upload, not between separate uploads; use your newest export. Blank optional fields do not erase measurements imported earlier, and ignored deleted rows do not delete existing data. A failed import may have saved some values: the page reports how many values the server confirmed, refreshes history, and permits a safe retry. Requests are limited to 10,000 measurements per batch.

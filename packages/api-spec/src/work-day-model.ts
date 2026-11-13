import type { WorkProfile } from './schemas/work.ts'

import {
  inputMetricNames,
  derivedMetricNames,
  dayMarkerMetric,
  inputGroups,
  isRecruitingCompatibleProfile,
  type WorkInputKey,
  type DerivedMetricKey,
} from './work-profile.ts'
type InputTotals = Record<WorkInputKey, number>
type DerivedTotals = Record<DerivedMetricKey, number>
type StoredTotals = Record<string, number>
export const calculateDerivedTotals = (totals: InputTotals): DerivedTotals => {
  const applicationDeclines =
    totals.bmi_declines +
    totals.location_declines +
    totals.application_response_declines +
    totals.job_hop_declines +
    totals.work_gap_declines +
    totals.overqualified_declines +
    totals.duplicate_declines
  const interviewDenials =
    totals.interview_deny_answers + totals.interview_deny_tattoo + totals.interview_deny_policy
  const interviewDecisions = interviewDenials + totals.sent_for_approval
  const approvalDenials =
    totals.approval_deny_grooming +
    totals.approval_deny_social_media +
    totals.approval_deny_answers +
    totals.approval_deny_policy +
    totals.approval_deny_language

  return {
    application_declines: applicationDeclines,
    applications_reviewed: applicationDeclines + totals.invited_to_interview,
    approval_denials: approvalDenials,
    hires: totals.offers_accepted,
    interview_appointments: interviewDecisions + totals.no_shows + totals.reschedules,
    interview_decisions: interviewDecisions,
    interview_denials: interviewDenials,
    offers_decided: totals.offers_accepted + totals.offers_declined,
  }
}

export const buildStoredTotals = (totals: InputTotals): StoredTotals => {
  const stored = Object.fromEntries(
    Object.entries(inputMetricNames).map(([key, metric]) => [metric, totals[key as WorkInputKey]]),
  )
  const derived = calculateDerivedTotals(totals)
  for (const [key, metric] of Object.entries(derivedMetricNames)) {
    stored[metric] = derived[key as DerivedMetricKey]
  }
  stored[dayMarkerMetric] = 1
  return stored
}

export const computeWorkDayTotals = (
  profile: WorkProfile,
  values: Record<string, Record<string, number>>,
) => {
  const rows = Object.fromEntries(
    profile.metric_rows.map((row) => [
      row.id,
      profile.category_columns.reduce((sum, column) => sum + (values[row.id]?.[column.id] ?? 0), 0),
    ]),
  )
  const totals = Object.fromEntries(profile.metric_rows.map((row) => [row.storage_metric, rows[row.id] ?? 0]))
  if (isRecruitingCompatibleProfile(profile)) {
    Object.assign(
      totals,
      buildStoredTotals(
        Object.fromEntries(
          inputGroups.flatMap((group) => group.metrics.map((metric) => [metric.key, rows[metric.key] ?? 0])),
        ) as InputTotals,
      ),
    )
  }
  totals[profile.storage_contract.day_marker_metric] = 1
  return totals
}

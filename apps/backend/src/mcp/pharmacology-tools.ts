import {
  confirmRegimenBodySchema,
  correctAssessmentBodySchema,
  createAdministrationBodySchema,
  createContextEventBodySchema,
  createRegimenBodySchema,
  createSubstanceBodySchema,
  createTreatmentSessionBodySchema,
  pharmacologyTimelineQuerySchema,
  submitAssessmentBodySchema,
  todayQuerySchema,
  updateAdministrationBodySchema,
  updateRegimenBodySchema,
  updateSubstanceBodySchema,
  updateTreatmentSessionBodySchema,
} from '@aurboda/api-spec'
import { z } from 'zod'

import * as pharmacology from '../services/pharmacology.ts'
import { errorResponse, jsonResponse, type McpServer } from './helpers.ts'

const OBSERVATIONAL =
  'This records and summarizes observations only; it does not make clinical decisions or establish causality.'
const uuid = z.string().uuid()

export const registerPharmacologyTools = (server: McpServer, user: string): void => {
  server.tool('list_substances', `List the user's medication and supplement catalogue. ${OBSERVATIONAL}`, { status: z.enum(['active', 'inactive', 'archived']).optional() }, async ({ status }) => jsonResponse({ success: true, data: await pharmacology.listSubstances(user, status) }))
  server.tool('create_substance', `Create substance configuration; changing defaults later never rewrites past administration facts. ${OBSERVATIONAL}`, createSubstanceBodySchema.shape, async (params) => jsonResponse({ success: true, data: await pharmacology.createSubstance(user, params) }))
  server.tool('update_substance', `Update substance configuration and preserve an immutable version snapshot. ${OBSERVATIONAL}`, { id: uuid, ...updateSubstanceBodySchema.shape }, async ({ id, ...params }) => { const data=await pharmacology.updateSubstance(user,id,params); return data?jsonResponse({success:true,data}):errorResponse('Substance not found') })
  server.tool('archive_substance', `Archive a substance without deleting its medical history. ${OBSERVATIONAL}`, { id: uuid }, async ({ id }) => { const data=await pharmacology.archiveSubstance(user,id); return data?jsonResponse({success:true,data}):errorResponse('Substance not found') })

  server.tool('list_regimens', `List scheduled configuration. A schedule is not evidence that a dose was administered. ${OBSERVATIONAL}`, { status: z.enum(['active','paused','archived']).optional() }, async ({status})=>jsonResponse({success:true,data:await pharmacology.listRegimens(user,status)}))
  server.tool('create_regimen', `Create a regimen and item configuration; this does not create administration events. ${OBSERVATIONAL}`, createRegimenBodySchema.shape, async(params)=>jsonResponse({success:true,data:await pharmacology.createRegimen(user,params)}))
  server.tool('update_regimen', `Update regimen configuration and preserve an immutable version snapshot. ${OBSERVATIONAL}`, {id:uuid,...updateRegimenBodySchema.shape}, async({id,...params})=>{const data=await pharmacology.updateRegimen(user,id,params);return data?jsonResponse({success:true,data}):errorResponse('Regimen not found')})
  server.tool('archive_regimen', `Archive a regimen without deleting factual administrations. ${OBSERVATIONAL}`, {id:uuid}, async({id})=>{const data=await pharmacology.archiveRegimen(user,id);return data?jsonResponse({success:true,data}):errorResponse('Regimen not found')})
  server.tool('get_today_plan', `Derive the local-day plan and confirmation state without manufacturing administrations. ${OBSERVATIONAL}`, todayQuerySchema.shape, async(params)=>jsonResponse({success:true,data:await pharmacology.getToday(user,params.timezone,params.date)}))
  server.tool('confirm_regimen', `Record only explicitly selected regimen items as actual outcomes. Reuse the same idempotency_key for safe retries. ${OBSERVATIONAL}`, {regimen_id:uuid,...confirmRegimenBodySchema.shape}, async({regimen_id,...params})=>{try{const data=await pharmacology.confirmRegimen(user,regimen_id,params);return data?jsonResponse({success:true,data}):errorResponse('Regimen not found')}catch(error){return errorResponse(error instanceof Error?error.message:'Unable to confirm regimen')}})

  server.tool('list_administrations', `List observed administrations and non-administration outcomes, distinct from schedules. ${OBSERVATIONAL}`, {start:z.iso.datetime({offset:true}).optional(),end:z.iso.datetime({offset:true}).optional(),limit:z.number().int().min(1).max(1000).default(200)}, async(params)=>jsonResponse({success:true,data:await pharmacology.listAdministrations(user,params.start,params.end,params.limit)}))
  server.tool('log_administration', `Record an actual administration or explicit skipped/unknown outcome. Reuse idempotency_key for safe retries. ${OBSERVATIONAL}`, createAdministrationBodySchema.shape, async(params)=>jsonResponse({success:true,data:await pharmacology.createAdministration(user,params)}))
  server.tool('correct_administration', `Correct an administration after preserving its previous immutable revision and recalculating exposure. ${OBSERVATIONAL}`, {id:uuid,...updateAdministrationBodySchema.shape}, async({id,...params})=>{const data=await pharmacology.updateAdministration(user,id,params);return data?jsonResponse({success:true,data}):errorResponse('Administration not found')})
  server.tool('void_administration', `Soft-void an administration, preserve a revision, and remove its derived exposure. ${OBSERVATIONAL}`, {id:uuid,reason:z.string().max(2000).optional()}, async({id,reason})=>{const data=await pharmacology.voidAdministration(user,id,reason);return data?jsonResponse({success:true,data}):errorResponse('Administration not found')})

  server.tool('list_treatment_sessions', `List planned and observed treatment/recovery sessions. ${OBSERVATIONAL}`, {start:z.iso.datetime({offset:true}).optional(),end:z.iso.datetime({offset:true}).optional(),limit:z.number().int().min(1).max(1000).default(200)}, async(params)=>jsonResponse({success:true,data:await pharmacology.listTreatments(user,params.start,params.end,params.limit)}))
  server.tool('create_treatment_session', `Create a treatment/recovery session record; this does not imply that a substance was administered. ${OBSERVATIONAL}`, createTreatmentSessionBodySchema.shape, async(params)=>jsonResponse({success:true,data:await pharmacology.createTreatment(user,params)}))
  server.tool('update_treatment_session', `Update a treatment/recovery session record. ${OBSERVATIONAL}`, {id:uuid,...updateTreatmentSessionBodySchema.shape}, async({id,...params})=>{const data=await pharmacology.updateTreatment(user,id,params);return data?jsonResponse({success:true,data}):errorResponse('Treatment session not found')})
  server.tool('list_questionnaires', `List dynamic versioned assessment templates and questions. ${OBSERVATIONAL}`, {}, async()=>jsonResponse({success:true,data:await pharmacology.listQuestionnaires(user)}))
  server.tool('submit_assessment', `Submit raw version-bound responses; numeric answers are projected for observational charts. ${OBSERVATIONAL}`, submitAssessmentBodySchema.shape, async(params)=>jsonResponse({success:true,data:await pharmacology.submitAssessment(user,params)}))
  server.tool('correct_assessment', `Correct an assessment and replace, rather than duplicate, its numeric projections. ${OBSERVATIONAL}`, {id:uuid,...correctAssessmentBodySchema.shape}, async({id,...params})=>{const data=await pharmacology.correctAssessment(user,id,params);return data?jsonResponse({success:true,data}):errorResponse('Assessment not found')})
  server.tool('list_contextual_events', `List user-recorded contextual events for observational interpretation. ${OBSERVATIONAL}`, {start:z.iso.datetime({offset:true}).optional(),end:z.iso.datetime({offset:true}).optional(),limit:z.number().int().min(1).max(1000).default(200)}, async(params)=>jsonResponse({success:true,data:await pharmacology.listContextEvents(user,params.start,params.end,params.limit)}))
  server.tool('add_contextual_event', `Add a contextual observation without implying causality. ${OBSERVATIONAL}`, createContextEventBodySchema.shape, async(params)=>jsonResponse({success:true,data:await pharmacology.createContextEvent(user,params)}))
  server.tool('get_pharmacology_timeline', `Get a combined factual timeline of administrations, treatments, assessments, and context. ${OBSERVATIONAL}`, pharmacologyTimelineQuerySchema.shape, async(params)=>jsonResponse({success:true,data:await pharmacology.getTimeline(user,params.start,params.end,params.limit)}))
  server.tool('get_pharmacology_insights', `Get sample sizes, coverage, missingness, exposure counts, and warnings. It never claims causality. ${OBSERVATIONAL}`, {timezone:z.string(),start:z.iso.date().optional(),end:z.iso.date().optional()}, async(params)=>jsonResponse({success:true,data:await pharmacology.getInsights(user,params.timezone,params.start,params.end)}))
  server.tool('export_pharmacology_json', 'Export the complete pharmacology domain, including immutable versions and correction revisions.', {}, async()=>jsonResponse({success:true,data:await pharmacology.exportPharmacology(user)}))
}

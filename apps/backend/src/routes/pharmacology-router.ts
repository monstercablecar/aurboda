import type {
  AdministrationResponse,
  AdministrationsResponse,
  AssessmentResponse,
  AssessmentsResponse,
  ConfirmRegimenBody,
  ConfirmRegimenResponse,
  ContextEventResponse,
  ContextEventsResponse,
  ContextEventTypeResponse,
  ContextEventTypesResponse,
  CorrectAssessmentBody,
  CreateAdministrationBody,
  CreateContextEventBody,
  CreateContextEventTypeBody,
  CreateQuestionnaireBody,
  CreateRegimenBody,
  CreateSubstanceBody,
  CreateTreatmentSessionBody,
  CreateTreatmentTypeBody,
  InsightsQuery,
  InsightsResponse,
  PharmacologyCsvExportResponse,
  PharmacologyDeleteResponse,
  PharmacologyExportResponse,
  PharmacologyListQuery,
  PharmacologyTimelineResponse,
  QuestionnaireResponse,
  QuestionnairesResponse,
  RegimenResponse,
  RegimensResponse,
  SubmitAssessmentBody,
  SubstanceResponse,
  SubstancesResponse,
  PharmacologyTimelineQuery,
  PharmacologyTodayQuery,
  TodayResponse,
  TreatmentSessionResponse,
  TreatmentSessionsResponse,
  TreatmentTypeResponse,
  TreatmentTypesResponse,
  UpdateAdministrationBody,
  UpdateContextEventBody,
  UpdateContextEventTypeBody,
  UpdateQuestionnaireBody,
  UpdateRegimenBody,
  UpdateSubstanceBody,
  UpdateTreatmentSessionBody,
  UpdateTreatmentTypeBody,
} from '@aurboda/api-spec'
import {
  confirmRegimenBodySchema,
  correctAssessmentBodySchema,
  createAdministrationBodySchema,
  createContextEventBodySchema,
  createContextEventTypeBodySchema,
  createQuestionnaireBodySchema,
  createRegimenBodySchema,
  createSubstanceBodySchema,
  createTreatmentSessionBodySchema,
  createTreatmentTypeBodySchema,
  insightsQuerySchema,
  pharmacologyListQuerySchema,
  submitAssessmentBodySchema,
  pharmacologyTimelineQuerySchema,
  todayQuerySchema,
  updateAdministrationBodySchema,
  updateContextEventBodySchema,
  updateContextEventTypeBodySchema,
  updateQuestionnaireBodySchema,
  updateRegimenBodySchema,
  updateSubstanceBodySchema,
  updateTreatmentSessionBodySchema,
  updateTreatmentTypeBodySchema,
} from '@aurboda/api-spec'

import * as pharmacology from '../services/pharmacology.ts'
import { type AnyMiddleware, type TypedRouter, typedRouter } from '../typed-router.ts'
import { validateBody, validateQuery } from '../validation.ts'

const isConflict = (error: unknown): boolean =>
  error instanceof Error && (error as Error & { code?: string }).code === '23505'

export const createPharmacologyRouter = (authMiddleware: AnyMiddleware): TypedRouter => {
  const router = typedRouter()

  router.get<Record<string, never>, SubstancesResponse, unknown, PharmacologyListQuery>('/substances', authMiddleware, validateQuery(pharmacologyListQuerySchema), async (req, res) => {
    res.json({ success: true, data: await pharmacology.listSubstances(req.user!, req.query.status) })
  })
  router.post<Record<string, never>, SubstanceResponse, CreateSubstanceBody>('/substances', authMiddleware, validateBody(createSubstanceBodySchema), async (req, res) => {
    try { res.status(201).json({ success: true, data: await pharmacology.createSubstance(req.user!, req.body) }) }
    catch (error) { res.status(isConflict(error) ? 409 : 400).json({ success: false, error: error instanceof Error ? error.message : 'Unable to create substance' }) }
  })
  router.get<{ id: string }, SubstanceResponse>('/substances/:id', authMiddleware, async (req, res) => {
    const data = await pharmacology.getSubstance(req.user!, req.params.id)
    if (!data) return res.status(404).json({ success: false, error: 'Substance not found' })
    res.json({ success: true, data })
  })
  router.patch<{ id: string }, SubstanceResponse, UpdateSubstanceBody>('/substances/:id', authMiddleware, validateBody(updateSubstanceBodySchema), async (req, res) => {
    try { const data = await pharmacology.updateSubstance(req.user!, req.params.id, req.body); if (!data) return res.status(404).json({ success: false, error: 'Substance not found' }); res.json({ success: true, data }) }
    catch (error) { res.status(isConflict(error) ? 409 : 400).json({ success: false, error: error instanceof Error ? error.message : 'Unable to update substance' }) }
  })
  router.delete<{ id: string }, PharmacologyDeleteResponse>('/substances/:id', authMiddleware, async (req, res) => {
    const data = await pharmacology.archiveSubstance(req.user!, req.params.id)
    if (!data) return res.status(404).json({ success: false, error: 'Substance not found' })
    res.json({ success: true })
  })

  router.get<Record<string, never>, RegimensResponse, unknown, PharmacologyListQuery>('/regimens', authMiddleware, validateQuery(pharmacologyListQuerySchema), async (req, res) => res.json({ success: true, data: await pharmacology.listRegimens(req.user!, req.query.status) }))
  router.post<Record<string, never>, RegimenResponse, CreateRegimenBody>('/regimens', authMiddleware, validateBody(createRegimenBodySchema), async (req, res) => {
    try { res.status(201).json({ success: true, data: await pharmacology.createRegimen(req.user!, req.body) }) }
    catch (error) { res.status(isConflict(error) ? 409 : 400).json({ success: false, error: error instanceof Error ? error.message : 'Unable to create regimen' }) }
  })
  router.get<{ id: string }, RegimenResponse>('/regimens/:id', authMiddleware, async (req, res) => { const data=await pharmacology.getRegimen(req.user!,req.params.id); if(!data)return res.status(404).json({success:false,error:'Regimen not found'});res.json({success:true,data}) })
  router.patch<{ id: string }, RegimenResponse, UpdateRegimenBody>('/regimens/:id', authMiddleware, validateBody(updateRegimenBodySchema), async (req,res)=>{try{const data=await pharmacology.updateRegimen(req.user!,req.params.id,req.body);if(!data)return res.status(404).json({success:false,error:'Regimen not found'});res.json({success:true,data})}catch(error){res.status(isConflict(error)?409:400).json({success:false,error:error instanceof Error?error.message:'Unable to update regimen'})}})
  router.delete<{ id: string }, PharmacologyDeleteResponse>('/regimens/:id',authMiddleware,async(req,res)=>{const data=await pharmacology.archiveRegimen(req.user!,req.params.id);if(!data)return res.status(404).json({success:false,error:'Regimen not found'});res.json({success:true})})
  router.post<{ id: string }, ConfirmRegimenResponse, ConfirmRegimenBody>('/regimens/:id/confirm',authMiddleware,validateBody(confirmRegimenBodySchema),async(req,res)=>{try{const data=await pharmacology.confirmRegimen(req.user!,req.params.id,req.body);if(!data)return res.status(404).json({success:false,error:'Regimen not found'});res.status(201).json({success:true,data})}catch(error){res.status(400).json({success:false,error:error instanceof Error?error.message:'Unable to confirm regimen'})}})

  router.get<Record<string,never>,AdministrationsResponse,unknown,PharmacologyListQuery>('/administrations',authMiddleware,validateQuery(pharmacologyListQuerySchema),async(req,res)=>res.json({success:true,data:await pharmacology.listAdministrations(req.user!,req.query.start,req.query.end,req.query.limit)}))
  router.post<Record<string,never>,AdministrationResponse,CreateAdministrationBody>('/administrations',authMiddleware,validateBody(createAdministrationBodySchema),async(req,res)=>{try{res.status(201).json({success:true,data:await pharmacology.createAdministration(req.user!,req.body)})}catch(error){res.status(isConflict(error)?409:400).json({success:false,error:error instanceof Error?error.message:'Unable to record administration'})}})
  router.patch<{id:string},AdministrationResponse,UpdateAdministrationBody>('/administrations/:id',authMiddleware,validateBody(updateAdministrationBodySchema),async(req,res)=>{try{const data=await pharmacology.updateAdministration(req.user!,req.params.id,req.body);if(!data)return res.status(404).json({success:false,error:'Administration not found'});res.json({success:true,data})}catch(error){res.status(isConflict(error)?409:400).json({success:false,error:error instanceof Error?error.message:'Unable to correct administration'})}})
  router.delete<{id:string},PharmacologyDeleteResponse>('/administrations/:id',authMiddleware,async(req,res)=>{const data=await pharmacology.voidAdministration(req.user!,req.params.id);if(!data)return res.status(404).json({success:false,error:'Administration not found'});res.json({success:true})})

  router.get<Record<string,never>,TreatmentTypesResponse>('/treatment-types',authMiddleware,async(req,res)=>res.json({success:true,data:await pharmacology.listTreatmentTypes(req.user!)}))
  router.post<Record<string,never>,TreatmentTypeResponse,CreateTreatmentTypeBody>('/treatment-types',authMiddleware,validateBody(createTreatmentTypeBodySchema),async(req,res)=>{try{res.status(201).json({success:true,data:await pharmacology.createTreatmentType(req.user!,req.body)})}catch(error){res.status(isConflict(error)?409:400).json({success:false,error:error instanceof Error?error.message:'Unable to create treatment type'})}})
  router.patch<{id:string},TreatmentTypeResponse,UpdateTreatmentTypeBody>('/treatment-types/:id',authMiddleware,validateBody(updateTreatmentTypeBodySchema),async(req,res)=>{try{const data=await pharmacology.updateTreatmentType(req.user!,req.params.id,req.body);if(!data)return res.status(404).json({success:false,error:'Treatment type not found'});res.json({success:true,data})}catch(error){res.status(isConflict(error)?409:400).json({success:false,error:error instanceof Error?error.message:'Unable to update treatment type'})}})

  router.get<Record<string,never>,TreatmentSessionsResponse,unknown,PharmacologyListQuery>('/treatments',authMiddleware,validateQuery(pharmacologyListQuerySchema),async(req,res)=>res.json({success:true,data:await pharmacology.listTreatments(req.user!,req.query.start,req.query.end,req.query.limit)}))
  router.post<Record<string,never>,TreatmentSessionResponse,CreateTreatmentSessionBody>('/treatments',authMiddleware,validateBody(createTreatmentSessionBodySchema),async(req,res)=>{try{res.status(201).json({success:true,data:await pharmacology.createTreatment(req.user!,req.body)})}catch(error){res.status(400).json({success:false,error:error instanceof Error?error.message:'Unable to create treatment'})}})
  router.get<{id:string},TreatmentSessionResponse>('/treatments/:id',authMiddleware,async(req,res)=>{const data=await pharmacology.getTreatment(req.user!,req.params.id);if(!data)return res.status(404).json({success:false,error:'Treatment not found'});res.json({success:true,data})})
  router.patch<{id:string},TreatmentSessionResponse,UpdateTreatmentSessionBody>('/treatments/:id',authMiddleware,validateBody(updateTreatmentSessionBodySchema),async(req,res)=>{const data=await pharmacology.updateTreatment(req.user!,req.params.id,req.body);if(!data)return res.status(404).json({success:false,error:'Treatment not found'});res.json({success:true,data})})
  router.delete<{id:string},PharmacologyDeleteResponse>('/treatments/:id',authMiddleware,async(req,res)=>{if(!(await pharmacology.deleteTreatment(req.user!,req.params.id)))return res.status(404).json({success:false,error:'Treatment not found'});res.json({success:true})})

  router.get<Record<string,never>,QuestionnairesResponse>('/questionnaires',authMiddleware,async(req,res)=>res.json({success:true,data:await pharmacology.listQuestionnaires(req.user!)}))
  router.post<Record<string,never>,QuestionnaireResponse,CreateQuestionnaireBody>('/questionnaires',authMiddleware,validateBody(createQuestionnaireBodySchema),async(req,res)=>{try{res.status(201).json({success:true,data:await pharmacology.createQuestionnaire(req.user!,req.body)})}catch(error){res.status(isConflict(error)?409:400).json({success:false,error:error instanceof Error?error.message:'Unable to create questionnaire'})}})
  router.patch<{id:string},QuestionnaireResponse,UpdateQuestionnaireBody>('/questionnaires/:id',authMiddleware,validateBody(updateQuestionnaireBodySchema),async(req,res)=>{try{const data=await pharmacology.updateQuestionnaire(req.user!,req.params.id,req.body);if(!data)return res.status(404).json({success:false,error:'Questionnaire not found'});res.json({success:true,data})}catch(error){res.status(isConflict(error)?409:400).json({success:false,error:error instanceof Error?error.message:'Unable to update questionnaire'})}})

  router.get<Record<string,never>,AssessmentsResponse,unknown,PharmacologyListQuery>('/assessments',authMiddleware,validateQuery(pharmacologyListQuerySchema),async(req,res)=>res.json({success:true,data:await pharmacology.listAssessments(req.user!,req.query.start,req.query.end,req.query.limit)}))
  router.post<Record<string,never>,AssessmentResponse,SubmitAssessmentBody>('/assessments',authMiddleware,validateBody(submitAssessmentBodySchema),async(req,res)=>{try{res.status(201).json({success:true,data:await pharmacology.submitAssessment(req.user!,req.body)})}catch(error){res.status(400).json({success:false,error:error instanceof Error?error.message:'Unable to submit assessment'})}})
  router.patch<{id:string},AssessmentResponse,CorrectAssessmentBody>('/assessments/:id',authMiddleware,validateBody(correctAssessmentBodySchema),async(req,res)=>{try{const data=await pharmacology.correctAssessment(req.user!,req.params.id,req.body);if(!data)return res.status(404).json({success:false,error:'Assessment not found'});res.json({success:true,data})}catch(error){res.status(400).json({success:false,error:error instanceof Error?error.message:'Unable to correct assessment'})}})
  router.delete<{id:string},PharmacologyDeleteResponse>('/assessments/:id',authMiddleware,async(req,res)=>{if(!(await pharmacology.deleteAssessment(req.user!,req.params.id)))return res.status(404).json({success:false,error:'Assessment not found'});res.json({success:true})})

  router.get<Record<string,never>,ContextEventTypesResponse>('/context-types',authMiddleware,async(req,res)=>res.json({success:true,data:await pharmacology.listContextTypes(req.user!)}))
  router.post<Record<string,never>,ContextEventTypeResponse,CreateContextEventTypeBody>('/context-types',authMiddleware,validateBody(createContextEventTypeBodySchema),async(req,res)=>{try{res.status(201).json({success:true,data:await pharmacology.createContextType(req.user!,req.body)})}catch(error){res.status(isConflict(error)?409:400).json({success:false,error:error instanceof Error?error.message:'Unable to create context type'})}})
  router.patch<{id:string},ContextEventTypeResponse,UpdateContextEventTypeBody>('/context-types/:id',authMiddleware,validateBody(updateContextEventTypeBodySchema),async(req,res)=>{try{const data=await pharmacology.updateContextType(req.user!,req.params.id,req.body);if(!data)return res.status(404).json({success:false,error:'Context type not found'});res.json({success:true,data})}catch(error){res.status(isConflict(error)?409:400).json({success:false,error:error instanceof Error?error.message:'Unable to update context type'})}})
  router.get<Record<string,never>,ContextEventsResponse,unknown,PharmacologyListQuery>('/context-events',authMiddleware,validateQuery(pharmacologyListQuerySchema),async(req,res)=>res.json({success:true,data:await pharmacology.listContextEvents(req.user!,req.query.start,req.query.end,req.query.limit)}))
  router.post<Record<string,never>,ContextEventResponse,CreateContextEventBody>('/context-events',authMiddleware,validateBody(createContextEventBodySchema),async(req,res)=>{try{res.status(201).json({success:true,data:await pharmacology.createContextEvent(req.user!,req.body)})}catch(error){res.status(400).json({success:false,error:error instanceof Error?error.message:'Unable to create context event'})}})
  router.patch<{id:string},ContextEventResponse,UpdateContextEventBody>('/context-events/:id',authMiddleware,validateBody(updateContextEventBodySchema),async(req,res)=>{const data=await pharmacology.updateContextEvent(req.user!,req.params.id,req.body);if(!data)return res.status(404).json({success:false,error:'Context event not found'});res.json({success:true,data})})
  router.delete<{id:string},PharmacologyDeleteResponse>('/context-events/:id',authMiddleware,async(req,res)=>{if(!(await pharmacology.deleteContextEvent(req.user!,req.params.id)))return res.status(404).json({success:false,error:'Context event not found'});res.json({success:true})})

  router.get<Record<string,never>,TodayResponse,unknown,PharmacologyTodayQuery>('/today',authMiddleware,validateQuery(todayQuerySchema),async(req,res)=>res.json({success:true,data:await pharmacology.getToday(req.user!,req.query.timezone,req.query.date)}))
  router.get<Record<string,never>,PharmacologyTimelineResponse,unknown,PharmacologyTimelineQuery>('/timeline',authMiddleware,validateQuery(pharmacologyTimelineQuerySchema),async(req,res)=>res.json({success:true,data:await pharmacology.getTimeline(req.user!,req.query.start,req.query.end,req.query.limit)}))
  router.get<Record<string,never>,InsightsResponse,unknown,InsightsQuery>('/insights',authMiddleware,validateQuery(insightsQuerySchema),async(req,res)=>res.json({success:true,data:await pharmacology.getInsights(req.user!,req.query.timezone,req.query.start,req.query.end)}))
  router.get<Record<string,never>,PharmacologyExportResponse>('/export',authMiddleware,async(req,res)=>res.json({success:true,data:await pharmacology.exportPharmacology(req.user!)}))
  router.get<Record<string,never>,PharmacologyCsvExportResponse>('/export.csv',authMiddleware,async(req,res)=>{res.type('text/csv').send(await pharmacology.exportPharmacologyCsv(req.user!))})
  return router
}

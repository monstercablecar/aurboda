export const pharmacologyTables: Record<string, string> = {
  substances: `
    CREATE TABLE IF NOT EXISTS substances (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      analysis_key VARCHAR(100) NOT NULL UNIQUE,
      display_name VARCHAR(200) NOT NULL,
      generic_name VARCHAR(200),
      brand_name VARCHAR(200),
      category VARCHAR(30) NOT NULL CHECK (category IN ('prescription','otc','supplement','nootropic','caffeine','other')),
      custom_category VARCHAR(100),
      formulation VARCHAR(100),
      route VARCHAR(100),
      strength DOUBLE PRECISION CHECK (strength IS NULL OR strength > 0),
      strength_unit VARCHAR(50),
      default_dose DOUBLE PRECISION CHECK (default_dose IS NULL OR default_dose > 0),
      dose_unit VARCHAR(50) NOT NULL,
      manufacturer VARCHAR(200),
      start_date DATE,
      end_date DATE,
      status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
      notes TEXT,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(tags) = 'array'),
      favorite BOOLEAN NOT NULL DEFAULT FALSE,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
    )
  `,
  substances_indexes: `
    CREATE INDEX IF NOT EXISTS idx_substances_status_name ON substances (status, display_name);
    CREATE INDEX IF NOT EXISTS idx_substances_favorite ON substances (favorite, display_name) WHERE status <> 'archived'
  `,
  substance_versions: `
    CREATE TABLE IF NOT EXISTS substance_versions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      substance_id UUID NOT NULL REFERENCES substances(id) ON DELETE RESTRICT,
      version INTEGER NOT NULL CHECK (version > 0),
      snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
      changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reason TEXT,
      UNIQUE (substance_id, version)
    )
  `,
  substance_versions_indexes: `CREATE INDEX IF NOT EXISTS idx_substance_versions_substance ON substance_versions (substance_id, version DESC)`,
  regimens: `
    CREATE TABLE IF NOT EXISTS regimens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(200) NOT NULL,
      description TEXT,
      schedule JSONB NOT NULL CHECK (jsonb_typeof(schedule) = 'object'),
      start_date DATE,
      end_date DATE,
      status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      reminder JSONB NOT NULL DEFAULT '{"enabled":false,"minutes_before":[]}'::jsonb CHECK (jsonb_typeof(reminder) = 'object'),
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
    )
  `,
  regimens_indexes: `CREATE INDEX IF NOT EXISTS idx_regimens_status_sort ON regimens (status, sort_order, name)`,
  regimen_items: `
    CREATE TABLE IF NOT EXISTS regimen_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      regimen_id UUID NOT NULL REFERENCES regimens(id) ON DELETE CASCADE,
      substance_id UUID NOT NULL REFERENCES substances(id) ON DELETE RESTRICT,
      dose DOUBLE PRECISION NOT NULL CHECK (dose > 0),
      dose_unit VARCHAR(50) NOT NULL,
      route VARCHAR(100),
      scheduled_local_time TIME,
      schedule_override JSONB CHECK (schedule_override IS NULL OR jsonb_typeof(schedule_override) = 'object'),
      sort_order INTEGER NOT NULL DEFAULT 0,
      paused BOOLEAN NOT NULL DEFAULT FALSE,
      start_date DATE,
      end_date DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
    )
  `,
  regimen_items_indexes: `
    CREATE INDEX IF NOT EXISTS idx_regimen_items_regimen ON regimen_items (regimen_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_regimen_items_substance ON regimen_items (substance_id)
  `,
  regimen_versions: `
    CREATE TABLE IF NOT EXISTS regimen_versions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      regimen_id UUID NOT NULL REFERENCES regimens(id) ON DELETE RESTRICT,
      version INTEGER NOT NULL CHECK (version > 0),
      snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
      changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reason TEXT,
      UNIQUE (regimen_id, version)
    )
  `,
  regimen_versions_indexes: `CREATE INDEX IF NOT EXISTS idx_regimen_versions_regimen ON regimen_versions (regimen_id, version DESC)`,
  treatment_types: `
    CREATE TABLE IF NOT EXISTS treatment_types (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key VARCHAR(100) NOT NULL UNIQUE,
      display_name VARCHAR(200) NOT NULL,
      category VARCHAR(100) NOT NULL,
      description TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      default_follow_up_hours JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(default_follow_up_hours) = 'array'),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  treatment_types_indexes: `CREATE INDEX IF NOT EXISTS idx_treatment_types_active_name ON treatment_types (active, display_name)`,
  treatment_types_seed: `
    INSERT INTO treatment_types (key, display_name, category, description, active, default_follow_up_hours)
    VALUES ('ketamine', 'Ketamine', 'medicine_assisted_treatment', 'Editable default treatment type.', TRUE, '[24,48,72,168]'::jsonb)
    ON CONFLICT (key) DO NOTHING
  `,
  treatment_sessions: `
    CREATE TABLE IF NOT EXISTS treatment_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      treatment_type_id UUID NOT NULL REFERENCES treatment_types(id) ON DELETE RESTRICT,
      planned_at TIMESTAMPTZ,
      actual_start TIMESTAMPTZ,
      actual_end TIMESTAMPTZ,
      timezone VARCHAR(100) NOT NULL,
      status VARCHAR(20) NOT NULL CHECK (status IN ('planned','in_progress','completed','canceled','incomplete','archived')),
      setting TEXT,
      provider TEXT,
      protocol_reference TEXT,
      intention TEXT,
      notes TEXT,
      concerns TEXT,
      preparation_notes TEXT,
      adverse_events JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(adverse_events) = 'array'),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
      follow_up_hours JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(follow_up_hours) = 'array'),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      CHECK (actual_end IS NULL OR actual_start IS NULL OR actual_end >= actual_start)
    )
  `,
  treatment_sessions_indexes: `
    CREATE INDEX IF NOT EXISTS idx_treatment_sessions_date ON treatment_sessions (COALESCE(actual_start, planned_at) DESC) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_treatment_sessions_type ON treatment_sessions (treatment_type_id)
  `,
  administration_events: `
    CREATE TABLE IF NOT EXISTS administration_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      substance_id UUID NOT NULL REFERENCES substances(id) ON DELETE RESTRICT,
      regimen_item_id UUID REFERENCES regimen_items(id) ON DELETE SET NULL,
      treatment_session_id UUID REFERENCES treatment_sessions(id) ON DELETE SET NULL,
      administered_at TIMESTAMPTZ NOT NULL,
      scheduled_at TIMESTAMPTZ,
      timezone VARCHAR(100) NOT NULL,
      dose DOUBLE PRECISION,
      dose_unit VARCHAR(50),
      route VARCHAR(100),
      status VARCHAR(30) NOT NULL CHECK (status IN ('taken','skipped','delayed','partially_taken','unknown','canceled','entered_in_error')),
      source VARCHAR(100) NOT NULL DEFAULT 'manual',
      reason TEXT,
      notes TEXT,
      side_effects JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(side_effects) = 'array'),
      idempotency_key VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      CHECK (status NOT IN ('taken','delayed','partially_taken') OR (dose > 0 AND dose_unit IS NOT NULL))
    )
  `,
  administration_events_indexes: `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_administration_events_idempotency ON administration_events (idempotency_key) WHERE idempotency_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_administration_events_time ON administration_events (administered_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_administration_events_substance_time ON administration_events (substance_id, administered_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_administration_events_regimen_item ON administration_events (regimen_item_id);
    CREATE INDEX IF NOT EXISTS idx_administration_events_treatment ON administration_events (treatment_session_id)
  `,
  administration_event_revisions: `
    CREATE TABLE IF NOT EXISTS administration_event_revisions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      administration_event_id UUID NOT NULL REFERENCES administration_events(id) ON DELETE RESTRICT,
      revision INTEGER NOT NULL CHECK (revision > 0),
      snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
      action VARCHAR(30) NOT NULL CHECK (action IN ('corrected','voided','entered_in_error')),
      reason TEXT,
      changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (administration_event_id, revision)
    )
  `,
  administration_event_revisions_indexes: `CREATE INDEX IF NOT EXISTS idx_administration_revisions_event ON administration_event_revisions (administration_event_id, revision DESC)`,
  questionnaire_templates: `
    CREATE TABLE IF NOT EXISTS questionnaire_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      stable_key VARCHAR(100) NOT NULL UNIQUE,
      display_name VARCHAR(200) NOT NULL,
      description TEXT,
      moment VARCHAR(30) NOT NULL CHECK (moment IN ('morning','midday','evening','pre_treatment','post_treatment','follow_up','custom')),
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  questionnaire_templates_indexes: `CREATE INDEX IF NOT EXISTS idx_questionnaire_templates_moment ON questionnaire_templates (enabled, moment)`,
  questionnaire_templates_seed: `
    INSERT INTO questionnaire_templates (stable_key, display_name, description, moment) VALUES
      ('morning', 'Morning check-in', 'Editable daily morning assessment.', 'morning'),
      ('midday', 'Midday check-in', 'Editable daily midday assessment.', 'midday'),
      ('evening', 'Evening check-in', 'Editable daily evening assessment.', 'evening'),
      ('ketamine_pre_session', 'Ketamine pre-session', 'Preparation assessment.', 'pre_treatment'),
      ('ketamine_post_session', 'Ketamine post-session', 'Immediate post-session assessment.', 'post_treatment'),
      ('ketamine_next_day', 'Ketamine next-day integration', 'Next-day follow-up assessment.', 'follow_up')
    ON CONFLICT (stable_key) DO NOTHING
  `,
  assessment_questions: `
    CREATE TABLE IF NOT EXISTS assessment_questions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id UUID NOT NULL REFERENCES questionnaire_templates(id) ON DELETE CASCADE,
      stable_key VARCHAR(100) NOT NULL,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      prompt TEXT NOT NULL,
      response_type VARCHAR(30) NOT NULL CHECK (response_type IN ('numeric','likert','yes_no','single_choice','multiple_choice','short_text','long_text','datetime','tags')),
      required BOOLEAN NOT NULL DEFAULT FALSE,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      metric_name VARCHAR(100),
      unit VARCHAR(50),
      anchors JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(anchors) = 'object'),
      config JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (template_id, stable_key)
    )
  `,
  assessment_questions_indexes: `CREATE INDEX IF NOT EXISTS idx_assessment_questions_template ON assessment_questions (template_id, enabled, sort_order)`,
  assessment_questions_seed: `
    INSERT INTO assessment_questions (template_id, stable_key, prompt, response_type, required, sort_order, metric_name, unit, anchors, config)
    SELECT t.id, q.stable_key, q.prompt, q.response_type, q.required, q.sort_order, q.metric_name, q.unit, q.anchors::jsonb, q.config::jsonb
    FROM questionnaire_templates t
    JOIN (VALUES
      ('morning','restedness','Restedness','likert',TRUE,10,'assessment_morning_restedness','score','{"1":"Exhausted","2":"Poorly rested","3":"Adequately rested","4":"Well rested","5":"Exceptionally restored"}','{"min":1,"max":5,"step":1}'),
      ('morning','morning_energy','Morning energy','likert',TRUE,20,'assessment_morning_energy','score','{"1":"Severe fatigue","2":"Low energy","3":"Functional","4":"Energetic","5":"Exceptionally energetic"}','{"min":1,"max":5,"step":1}'),
      ('morning','sleep_inertia','Sleep inertia','likert',TRUE,30,'assessment_morning_sleep_inertia','score','{"1":"Fully alert immediately","5":"Extremely difficult to become alert"}','{"min":1,"max":5,"step":1}'),
      ('morning','notes','Optional notes','long_text',FALSE,40,NULL,NULL,'{}','{}'),
      ('midday','task_initiation_ease','Task initiation ease','likert',TRUE,10,'assessment_midday_task_initiation','score','{"1":"Extremely difficult to begin tasks","5":"Tasks begin naturally with little friction"}','{"min":1,"max":5,"step":1}'),
      ('midday','mental_clarity','Mental clarity','likert',TRUE,20,'assessment_midday_mental_clarity','score','{"1":"Severe brain fog","5":"Exceptionally clear thinking"}','{"min":1,"max":5,"step":1}'),
      ('midday','natural_motivation','Natural motivation','likert',TRUE,30,'assessment_midday_natural_motivation','score','{"1":"Little intrinsic drive","5":"Strong spontaneous drive"}','{"min":1,"max":5,"step":1}'),
      ('midday','enjoyment_reward','Enjoyment/reward','likert',TRUE,40,'assessment_midday_enjoyment_reward','score','{"1":"Activities feel unrewarding","5":"Activities feel naturally engaging and enjoyable"}','{"min":1,"max":5,"step":1}'),
      ('midday','energy','Energy','likert',TRUE,50,'assessment_midday_energy','score','{"1":"Exhausted","5":"Exceptionally energetic"}','{"min":1,"max":5,"step":1}'),
      ('evening','overall_enjoyment','Overall enjoyment','likert',TRUE,10,'assessment_evening_overall_enjoyment','score','{}','{"min":1,"max":5,"step":1}'),
      ('evening','physical_fatigue','Physical fatigue','likert',TRUE,20,'assessment_evening_physical_fatigue','score','{}','{"min":1,"max":5,"step":1}'),
      ('evening','mental_fatigue','Mental fatigue','likert',TRUE,30,'assessment_evening_mental_fatigue','score','{}','{"min":1,"max":5,"step":1}'),
      ('evening','satisfaction_with_day','Satisfaction with the day','likert',TRUE,40,'assessment_evening_day_satisfaction','score','{}','{"min":1,"max":5,"step":1}'),
      ('evening','notes','Optional notes','long_text',FALSE,50,NULL,NULL,'{}','{}'),
      ('ketamine_pre_session','intention','Optional intention','long_text',FALSE,10,NULL,NULL,'{}','{}'),
      ('ketamine_pre_session','current_mood','Current mood','likert',FALSE,20,'assessment_ketamine_pre_mood','score','{}','{"min":1,"max":5,"step":1}'),
      ('ketamine_pre_session','current_energy','Current energy','likert',FALSE,30,'assessment_ketamine_pre_energy','score','{}','{"min":1,"max":5,"step":1}'),
      ('ketamine_pre_session','current_anxiety','Current anxiety','likert',FALSE,40,'assessment_ketamine_pre_anxiety','score','{}','{"min":1,"max":5,"step":1}'),
      ('ketamine_pre_session','current_cognitive_clarity','Current cognitive clarity','likert',FALSE,50,'assessment_ketamine_pre_clarity','score','{}','{"min":1,"max":5,"step":1}'),
      ('ketamine_pre_session','recent_sleep_quality','Recent sleep quality','likert',FALSE,60,'assessment_ketamine_pre_sleep_quality','score','{}','{"min":1,"max":5,"step":1}'),
      ('ketamine_pre_session','concerns','Optional concerns','long_text',FALSE,70,NULL,NULL,'{}','{}'),
      ('ketamine_pre_session','preparation_notes','Optional preparation notes','long_text',FALSE,80,NULL,NULL,'{}','{}'),
      ('ketamine_post_session','overall_experience','Overall experience','long_text',FALSE,10,NULL,NULL,'{}','{}'),
      ('ketamine_post_session','emotional_intensity','Emotional intensity','likert',FALSE,20,'assessment_ketamine_post_emotional_intensity','score','{}','{"min":1,"max":5,"step":1}'),
      ('ketamine_post_session','challenging_experiences','Challenging experiences','long_text',FALSE,30,NULL,NULL,'{}','{}'),
      ('ketamine_post_session','physical_side_effects','Physical side effects','long_text',FALSE,40,NULL,NULL,'{}','{}'),
      ('ketamine_post_session','perceived_insights','Perceived insights','long_text',FALSE,50,NULL,NULL,'{}','{}'),
      ('ketamine_post_session','important_memories_themes','Important memories or themes','long_text',FALSE,60,NULL,NULL,'{}','{}'),
      ('ketamine_post_session','changes_in_perspective','Changes in perspective','long_text',FALSE,70,NULL,NULL,'{}','{}'),
      ('ketamine_post_session','personal_significance','Perceived personal significance','likert',FALSE,80,'assessment_ketamine_post_significance','score','{}','{"min":1,"max":5,"step":1}'),
      ('ketamine_post_session','difficulty','Difficulty of the experience','likert',FALSE,90,'assessment_ketamine_post_difficulty','score','{}','{"min":1,"max":5,"step":1}'),
      ('ketamine_post_session','narrative','Optional free-form narrative','long_text',FALSE,100,NULL,NULL,'{}','{}'),
      ('ketamine_next_day','mood','Mood','likert',FALSE,10,'assessment_ketamine_next_mood','score','{}','{"min":1,"max":5,"step":1}'),
      ('ketamine_next_day','energy','Energy','likert',FALSE,20,'assessment_ketamine_next_energy','score','{}','{"min":1,"max":5,"step":1}'),
      ('ketamine_next_day','anxiety','Anxiety','likert',FALSE,30,'assessment_ketamine_next_anxiety','score','{}','{"min":1,"max":5,"step":1}'),
      ('ketamine_next_day','mental_clarity','Mental clarity','likert',FALSE,40,'assessment_ketamine_next_clarity','score','{}','{"min":1,"max":5,"step":1}'),
      ('ketamine_next_day','task_initiation_ease','Task initiation ease','likert',FALSE,50,'assessment_ketamine_next_task_initiation','score','{}','{"min":1,"max":5,"step":1}'),
      ('ketamine_next_day','enjoyment','Enjoyment','likert',FALSE,60,'assessment_ketamine_next_enjoyment','score','{}','{"min":1,"max":5,"step":1}'),
      ('ketamine_next_day','sleep_quality','Sleep quality','likert',FALSE,70,'assessment_ketamine_next_sleep_quality','score','{}','{"min":1,"max":5,"step":1}'),
      ('ketamine_next_day','lingering_side_effects','Lingering side effects','long_text',FALSE,80,NULL,NULL,'{}','{}'),
      ('ketamine_next_day','meaningful_insights','Which insights still seem meaningful?','long_text',FALSE,90,NULL,NULL,'{}','{}'),
      ('ketamine_next_day','concrete_behavior','What concrete behavior or decision could reflect those insights?','long_text',FALSE,100,NULL,NULL,'{}','{}')
    ) AS q(template_key,stable_key,prompt,response_type,required,sort_order,metric_name,unit,anchors,config)
      ON t.stable_key = q.template_key
    ON CONFLICT (template_id, stable_key) DO NOTHING
  `,
  assessment_question_versions: `
    CREATE TABLE IF NOT EXISTS assessment_question_versions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      question_id UUID NOT NULL REFERENCES assessment_questions(id) ON DELETE RESTRICT,
      version INTEGER NOT NULL CHECK (version > 0),
      snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
      changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (question_id, version)
    )
  `,
  assessment_question_versions_indexes: `
    CREATE INDEX IF NOT EXISTS idx_assessment_question_versions_question
      ON assessment_question_versions (question_id, version DESC)
  `,
  assessment_question_versions_seed: `
    INSERT INTO assessment_question_versions (question_id, version, snapshot)
    SELECT q.id, q.version, jsonb_build_object(
      'id', q.id,
      'template_id', q.template_id,
      'stable_key', q.stable_key,
      'version', q.version,
      'prompt', q.prompt,
      'response_type', q.response_type,
      'required', q.required,
      'enabled', q.enabled,
      'sort_order', q.sort_order,
      'metric_name', q.metric_name,
      'unit', q.unit,
      'anchors', q.anchors,
      'config', q.config
    )
    FROM assessment_questions q
    ON CONFLICT (question_id, version) DO NOTHING
  `,
  assessments: `
    CREATE TABLE IF NOT EXISTS assessments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id UUID NOT NULL REFERENCES questionnaire_templates(id) ON DELETE RESTRICT,
      template_version INTEGER NOT NULL CHECK (template_version > 0),
      treatment_session_id UUID REFERENCES treatment_sessions(id) ON DELETE SET NULL,
      stage VARCHAR(100),
      assessed_at TIMESTAMPTZ NOT NULL,
      timezone VARCHAR(100) NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )
  `,
  assessments_indexes: `
    CREATE INDEX IF NOT EXISTS idx_assessments_date ON assessments (assessed_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_assessments_template_date ON assessments (template_id, assessed_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_assessments_treatment ON assessments (treatment_session_id)
  `,
  assessment_responses: `
    CREATE TABLE IF NOT EXISTS assessment_responses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
      question_id UUID NOT NULL REFERENCES assessment_questions(id) ON DELETE RESTRICT,
      question_version INTEGER NOT NULL CHECK (question_version > 0),
      value JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (assessment_id, question_id)
    )
  `,
  assessment_responses_indexes: `CREATE INDEX IF NOT EXISTS idx_assessment_responses_question ON assessment_responses (question_id)`,
  context_event_types: `
    CREATE TABLE IF NOT EXISTS context_event_types (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key VARCHAR(100) NOT NULL UNIQUE,
      display_name VARCHAR(200) NOT NULL,
      description TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  context_event_types_indexes: `CREATE INDEX IF NOT EXISTS idx_context_event_types_active ON context_event_types (active, display_name)`,
  context_events: `
    CREATE TABLE IF NOT EXISTS context_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type_id UUID NOT NULL REFERENCES context_event_types(id) ON DELETE RESTRICT,
      started_at TIMESTAMPTZ NOT NULL,
      ended_at TIMESTAMPTZ,
      timezone VARCHAR(100) NOT NULL,
      intensity DOUBLE PRECISION,
      notes TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      CHECK (ended_at IS NULL OR ended_at >= started_at)
    )
  `,
  context_events_indexes: `
    CREATE INDEX IF NOT EXISTS idx_context_events_date ON context_events (started_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_context_events_type ON context_events (event_type_id)
  `,
}

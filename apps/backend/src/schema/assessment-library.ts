export const assessmentLibraryTables: Record<string, string> = {
  questionnaire_library: `ALTER TABLE questionnaire_templates ADD COLUMN IF NOT EXISTS library JSONB`,
  questionnaire_template_versions: `CREATE TABLE IF NOT EXISTS questionnaire_template_versions (
    template_id UUID NOT NULL REFERENCES questionnaire_templates(id) ON DELETE RESTRICT,
    version INTEGER NOT NULL,
    snapshot JSONB NOT NULL,
    PRIMARY KEY (template_id, version)
  )`,
  questionnaire_template_versions_seed: `INSERT INTO questionnaire_template_versions(template_id,version,snapshot)
    SELECT t.id,t.version,to_jsonb(t) || jsonb_build_object('questions',COALESCE((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.sort_order,q.created_at) FROM assessment_questions q WHERE q.template_id=t.id),'[]'::jsonb))
    FROM questionnaire_templates t ON CONFLICT DO NOTHING`,
  questionnaire_template_versions_checkins: `INSERT INTO questionnaire_template_versions(template_id,version,snapshot)
    SELECT DISTINCT ON (template_snapshot->>'id',template_snapshot->>'version')
      (template_snapshot->>'id')::uuid,(template_snapshot->>'version')::integer,template_snapshot
    FROM treatment_checkins WHERE template_snapshot IS NOT NULL ON CONFLICT DO NOTHING`,
}

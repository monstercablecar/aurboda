export const privateLinkTables: Record<string, string> = {
  activity_people: `CREATE TABLE IF NOT EXISTS activity_people (
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    PRIMARY KEY(activity_id, person_id))`,
  activity_people_indexes:
    'CREATE INDEX IF NOT EXISTS idx_activity_people_person ON activity_people(person_id)',
}

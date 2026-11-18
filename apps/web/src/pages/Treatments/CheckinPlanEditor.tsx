import type { QuestionnaireTemplate, TreatmentCheckinPlanBody } from '@aurboda/api-spec'

import { AssessmentAbout } from '../../components/AssessmentLibrary/AssessmentAbout'

export const defaultCheckinPlan = (): TreatmentCheckinPlanBody => ({
  before: true,
  after: true,
  next_day: true,
  later_hours: null,
  reminders_enabled: false,
  quiet_start: '21:00',
  quiet_end: '08:00',
  personal_goal: '',
  additional: [],
})

export function CheckinPlanEditor({
  value,
  onChange,
  questionnaires = [],
  preferencesOnly = false,
}: {
  value: TreatmentCheckinPlanBody
  onChange: (value: TreatmentCheckinPlanBody) => void
  questionnaires?: QuestionnaireTemplate[]
  preferencesOnly?: boolean
}) {
  const set = (patch: Partial<TreatmentCheckinPlanBody>) => onChange({ ...value, ...patch })
  const available = questionnaires.filter((q) => q.enabled && q.stable_key !== 'treatment_brief_v1')
  return (
    <fieldset class="checkin-plan">
      <legend>{preferencesOnly ? 'Reminder preferences' : 'Your optional check-in plan'}</legend>
      {!preferencesOnly && (
        <>
          <p>
            Choose only what will be useful. This plan is saved with the session; future library changes will
            not add more work.
          </p>
          {(['before', 'after', 'next_day'] as const).map((kind, index) => (
            <label class="check-label" key={kind}>
              <input
                type="checkbox"
                checked={value[kind]}
                onChange={(e) => set({ [kind]: e.currentTarget.checked })}
              />
              {
                [
                  'Before: mood, enjoyment and everyday activities',
                  'After: unwanted effects and optional reflection',
                  'Next day: mood, functioning and sleep',
                ][index]
              }
            </label>
          ))}
          <p class="form-hint">
            Before opens one hour before the planned start. After opens one hour after the recorded end and
            closes 24 hours after it. Next-day opens 24 hours after the end and closes at 48 hours. These are
            journaling windows, not medical instructions.
          </p>
          <label class="field">
            Later brief check-in
            <select
              value={value.later_hours ?? ''}
              onChange={(e) =>
                set({ later_hours: e.currentTarget.value ? Number(e.currentTarget.value) : null })
              }
            >
              <option value="">None</option>
              <option value="72">3 days after the end</option>
              <option value="168">7 days after the end</option>
            </select>
          </label>
          <label class="field">
            Personal goal (optional)
            <input
              maxLength={200}
              value={value.personal_goal}
              placeholder="For example, getting started with everyday tasks"
              onInput={(e) => set({ personal_goal: e.currentTarget.value })}
            />
          </label>
          <details>
            <summary>Choose your own questionnaires and timing</summary>
            <p>
              Use the shared assessment library or build a questionnaire in + Add, then select it here. Each
              selection keeps the question version used when this session is created.
            </p>
            <p>
              <a href="/assessments">Mental assessment library</a> ·{' '}
              <a href="/physical-assessments">Physical assessment library</a>
            </p>
            <p>
              Deeper assessments are optional. Leave this list empty to decline; no overdue entry will be
              created. Multi-day recall describes that whole period, not an immediate treatment effect.
            </p>
            {value.additional.map((entry, index) => (
              <fieldset key={index}>
                <legend>Additional follow-up {index + 1}</legend>
                <label class="field">
                  Questionnaire
                  <select
                    required
                    value={entry.template_id}
                    onChange={(e) =>
                      set({
                        additional: value.additional.map((item, i) =>
                          i === index ? { ...item, template_id: e.currentTarget.value } : item,
                        ),
                      })
                    }
                  >
                    <option value="">Choose…</option>
                    {available.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                {available.find((q) => q.id === entry.template_id) && (
                  <AssessmentAbout template={available.find((q) => q.id === entry.template_id)!} />
                )}
                <label class="field">
                  Hours after the session ends
                  <input
                    required
                    type="number"
                    min={0}
                    max={8760}
                    value={entry.offset_hours}
                    onInput={(e) =>
                      set({
                        additional: value.additional.map((item, i) =>
                          i === index ? { ...item, offset_hours: Number(e.currentTarget.value) } : item,
                        ),
                      })
                    }
                  />
                </label>
                <label class="field">
                  Keep open for (hours)
                  <input
                    required
                    type="number"
                    min={1}
                    max={720}
                    value={entry.window_hours}
                    onInput={(e) =>
                      set({
                        additional: value.additional.map((item, i) =>
                          i === index ? { ...item, window_hours: Number(e.currentTarget.value) } : item,
                        ),
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  onClick={() => set({ additional: value.additional.filter((_, i) => i !== index) })}
                >
                  Remove follow-up
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              disabled={value.additional.length >= 12 || !available.length}
              onClick={() =>
                set({
                  additional: [
                    ...value.additional,
                    { template_id: available[0]?.id ?? '', offset_hours: 24, window_hours: 24 },
                  ],
                })
              }
            >
              Add questionnaire
            </button>
          </details>
        </>
      )}
      <label class="check-label">
        <input
          type="checkbox"
          checked={value.reminders_enabled}
          onChange={(e) => set({ reminders_enabled: e.currentTarget.checked })}
        />
        Remind me about this plan
      </label>
      <p class="form-hint">
        At most two notifications per check-in. Notifications use generic wording and your notification
        settings. Delivery may be delayed by your device; this is not a clinical monitoring service.
      </p>
      {value.reminders_enabled && (
        <div class="form-grid">
          <label class="field">
            Quiet hours start
            <input
              type="time"
              required
              value={value.quiet_start}
              onInput={(e) => set({ quiet_start: e.currentTarget.value })}
            />
          </label>
          <label class="field">
            Quiet hours end
            <input
              type="time"
              required
              value={value.quiet_end}
              onInput={(e) => set({ quiet_end: e.currentTarget.value })}
            />
          </label>
          <p class="form-hint">Uses the session timezone. Equal times turn quiet hours off.</p>
        </div>
      )}
    </fieldset>
  )
}

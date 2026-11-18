import type { QuestionnaireTemplate } from '@aurboda/api-spec'

import { libraryInstrument } from '@aurboda/api-spec'

export function AssessmentAbout({ template }: { template: QuestionnaireTemplate }) {
  const instrument = libraryInstrument(template.stable_key)
  return (
    <div class="form-hint">
      <p>{instrument ? 'Standardized instrument' : 'Custom questionnaire · not a validated instrument'}</p>
      <p>{instrument?.purpose ?? template.description ?? 'Personal observations'}</p>
      <p>
        Recall: {template.library?.recall_period ?? 'Not specified; follow the question instructions'}.
        Effort:{' '}
        {template.library
          ? `about ${template.library.estimated_minutes} minutes`
          : `${template.questions.filter((q) => q.enabled).length} questions; time not specified`}
        .
      </p>
      {instrument && (
        <>
          <p>{instrument.repeat}</p>
          <p>
            <a href={instrument.source} target="_blank" rel="noopener noreferrer">
              Instrument and scoring source
            </a>
          </p>
          <small>{instrument.attribution}</small>
        </>
      )}
      <p>
        Entries are not clinician-monitored. These observations do not diagnose conditions or establish
        treatment effects.
      </p>
    </div>
  )
}

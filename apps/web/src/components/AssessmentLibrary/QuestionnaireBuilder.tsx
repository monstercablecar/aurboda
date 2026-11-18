import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'preact/hooks'

import { QuestionnaireForm } from '../../pages/Treatments/QuestionnaireForm'
import '../../pages/Treatments/style.css'

export function QuestionnaireBuilder() {
  const client = useQueryClient()
  const [message, setMessage] = useState('')
  const [generation, setGeneration] = useState(0)
  return (
    <section aria-label="Questionnaire builder">
      <p>
        Save a reusable set of questions for your own observations. You can choose it later in the assessment
        library or a treatment follow-up plan.
      </p>
      {message && (
        <p role="status">
          {message} <a href="/assessments">Open assessment library</a>
        </p>
      )}
      <QuestionnaireForm
        key={generation}
        simple
        onCancel={() => {
          setGeneration((n) => n + 1)
          setMessage('Form cleared. Nothing was saved.')
        }}
        onSaved={(result) => {
          setMessage(result)
          setGeneration((n) => n + 1)
          void client.invalidateQueries({ queryKey: ['pharmacology', 'questionnaires'] })
        }}
      />
    </section>
  )
}

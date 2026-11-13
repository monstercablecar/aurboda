import type {
  MatchedPeopleGuidance,
  PeopleFeedbackBody,
  PeopleGuidance,
  PeopleSource,
} from '@aurboda/api-spec'

export function GuidanceCard({
  guidance,
  sources,
  onFeedback,
  pending,
  prominent = false,
}: {
  guidance: PeopleGuidance | MatchedPeopleGuidance
  sources: PeopleSource[]
  onFeedback?: (guidance: PeopleGuidance, action: PeopleFeedbackBody['action']) => void
  pending?: boolean
  prominent?: boolean
}) {
  const Actions = prominent ? 'div' : 'details'
  return (
    <article class="people-guidance">
      <span class="people-tag">
        {guidance.guidance_type} · {guidance.evidence_class.replaceAll('_', ' ')}
      </span>
      <h3>{guidance.title}</h3>
      <p>{guidance.summary}</p>
      <Actions>
        {prominent ? <h4>Practical actions</h4> : <summary>Practical actions</summary>}
        <ul>
          {guidance.practical_actions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ul>
        {guidance.contraindications.length > 0 && (
          <>
            <h4>Scope and qualifications</h4>
            <ul>
              {guidance.contraindications.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </>
        )}
      </Actions>
      <details>
        <summary>Sources and why this?</summary>
        {'reasons' in guidance && (
          <ul>
            {guidance.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        <p class="people-muted">
          Version {guidance.version} · Guidance checked {guidance.last_verified} · {guidance.jurisdiction}
        </p>
        {guidance.evidence_comparison && (
          <p>Source relationship: {guidance.evidence_comparison.replaceAll('_', ' ')}.</p>
        )}
        {guidance.evidence_ids.map((id) => {
          const source = sources.find((item) => item.id === id)
          return source ? (
            <div key={id}>
              <h4>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.title}
                </a>
              </h4>
              <p>
                {source.publisher} · {source.evidence_category.replaceAll('_', ' ')}
                <br />
                Population: {source.applicable_population}
              </p>
              <p class="people-muted">
                {source.publication_date && `Publisher published: ${source.publication_date}. `}
                {source.review_date && `Publisher reviewed: ${source.review_date}. `}Source checked:{' '}
                {source.last_verified}.
              </p>
              {source.verification_method && (
                <p>
                  Verification method:{' '}
                  {source.verification_method === 'official_indexed_excerpt'
                    ? 'Official indexed excerpt (full page not verified)'
                    : 'Full source page'}
                </p>
              )}
              {source.official_quote && (
                <figure>
                  <figcaption>Source quotation — {source.publisher}</figcaption>
                  <blockquote cite={source.url}>{source.official_quote.text}</blockquote>
                  <p>
                    <a href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.title}
                    </a>{' '}
                    · {source.official_quote.section}
                  </p>
                </figure>
              )}
              {source.limitations.length > 0 && (
                <ul>
                  {source.limitations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
              <p class="people-muted">{source.licensing_status}</p>
            </div>
          ) : (
            <p key={id}>Source details unavailable: {id}</p>
          )
        })}
      </details>
      {guidance.review && (
        <details>
          <summary>Evidence and empathy review</summary>
          <p>
            Claim type: {guidance.review.claim_type}. Reviewed: {guidance.review.reviewed_on}.
          </p>
          <p>
            {guidance.review.individualized_judgment
              ? 'Requires individualized professional judgment.'
              : 'General guidance within the stated scope.'}
          </p>
          <p>Empathy review: {guidance.review.empathy_review.reviewed_on}.</p>
          <p>{guidance.review.empathy_review.notes}</p>
        </details>
      )}
      {'feedback' in guidance && guidance.feedback && <p class="people-muted">Marked {guidance.feedback}</p>}
      {onFeedback && !prominent && (
        <div class="people-actions">
          <button disabled={pending} onClick={() => onFeedback(guidance, 'completed')}>
            Mark complete
          </button>
          <button disabled={pending} onClick={() => onFeedback(guidance, 'dismissed')}>
            Dismiss suggestion
          </button>
        </div>
      )}
    </article>
  )
}

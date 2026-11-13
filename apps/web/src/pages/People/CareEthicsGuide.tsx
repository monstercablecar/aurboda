import { useEffect, useRef } from 'preact/hooks'

export function CareEthicsGuide({ personId, onClose }: { personId?: string; onClose: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [])
  return (
    <section class="people-panel">
      <button onClick={onClose}>Back to {personId ? 'person' : 'people'}</button>
      <h1 ref={heading} tabIndex={-1}>
        Care Ethics Guide
      </h1>
      <p>
        Care means paying attention to what matters to someone, offering useful support, and listening to
        their response. It supports a life they help define.
      </p>
      <p class="people-muted">
        This authored practical guide is informed by care ethics. It is not a universal rulebook or clinical
        or legal advice.
      </p>
      <h2>Put care into practice</h2>
      <ul>
        <li>
          <strong>Notice and ask.</strong> Ask what matters today; do not infer needs from a diagnosis or
          identity.
        </li>
        <li>
          <strong>Offer specific, bounded help.</strong> Say what you can do and when. Offer a real choice,
          including declining.
        </li>
        <li>
          <strong>Agree on boundaries.</strong> Ask before touch, arranging appointments, sharing information
          or tracking sensitive details.
        </li>
        <li>
          <strong>Follow through.</strong> Make commitments within your abilities. Be honest when you need
          help or cannot continue.
        </li>
        <li>
          <strong>Listen and adapt.</strong> Ask whether the help helped. Their response matters more than
          your intention.
        </li>
      </ul>
      <details>
        <summary>Recognize harmful paternalism</summary>
        <p>
          Paternalism means overriding someone's choices because you assume you know best. Power or financial
          dependence can make an apparent agreement hard to refuse.
        </p>
        <p>
          Warning signs include speaking for someone without permission, treating refusal as noncompliance,
          demanding disclosure, making help conditional on obedience, or turning tracking into a compliance
          score.
        </p>
      </details>
      <details>
        <summary>Three everyday examples</summary>
        <ul>
          <li>
            Instead of taking control of meal planning: “Would a meal or an errand help this week? It's okay
            to say no.”
          </li>
          <li>
            Instead of pressuring a depressed friend to participate: “Would you prefer listening, quiet
            company, or some space?” Respect their answer.
          </li>
          <li>
            Instead of taking over an adult parent's appointments: “What role, if any, would you like me to
            have—transport, taking notes, or something else?”
          </li>
        </ul>
      </details>
      <details>
        <summary>Children, dependence and serious danger</summary>
        <p>
          Children and dependents need protection and reliable care alongside choices suited to their age and
          abilities. Explain limits and involve them as their understanding grows. Dependence or disability
          does not automatically remove agency.
        </p>
        <p>
          In immediate serious danger, seek appropriate urgent help and act proportionately within your role.
          Return control as soon as possible. Danger is not a blanket license to take over someone's life.
        </p>
      </details>
      <h2>Repair an overstep</h2>
      <p>
        Pause, acknowledge the impact, ask what should change, and accept a no. An apology does not entitle
        you to reassurance or renewed access.
      </p>
      <h2>A quick check before acting</h2>
      <p>
        Whose goal is this? Have I asked? Is refusal a real option? What is the least intrusive useful step?
        Can I follow through? When will we review whether it helps?
      </p>
      <p>
        Further reading:{' '}
        <a href="https://iep.utm.edu/care-ethics/" target="_blank" rel="noopener noreferrer">
          Internet Encyclopedia of Philosophy: Care Ethics
        </a>
        . The examples above are practical interpretations, not quotations from this source.
      </p>
    </section>
  )
}

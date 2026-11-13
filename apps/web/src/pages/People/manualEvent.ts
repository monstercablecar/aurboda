import type { PeopleEvent, PeopleEventBody } from '@aurboda/api-spec'

export const isManualEvent = (event: PeopleEvent): event is PeopleEvent & PeopleEventBody =>
  event.source === 'manual' && event.type !== 'relationship_state'

# Optional People reminders

People reminders reuse the shared pg-boss scheduler and existing browser push subscriptions. A reminder is created only when the user explicitly supplies `reminder_at` and `reminder_timezone` on an event. All event types can have a reminder. Nothing in the catalog automatically schedules notifications.

The server validates a future ISO instant and an IANA time zone when a reminder changes. The timestamp identifies the delivery instant; the zone preserves the user's scheduling context. Changing an unrelated field on a historical event does not invalidate its past reminder. Remove a reminder by setting both fields to null, or delete the event/person.

## Availability and privacy

The dashboard reports availability only after the shared scheduler starts and all three existing VAPID configuration variables are present. Users must also enable browser notifications in Settings on a supported browser. Availability does not guarantee delivery; offline browsers, permission changes, operating-system restrictions and push-service failures can prevent it.

Payloads contain only a generic kind, fixed title/body and random event identifier. Names, relationship types, needs, notes and event contents are never sent. The service worker ignores arbitrary text or URLs and opens `/people` for this notification type. Existing notification tests continue to open Settings.

## Delivery behavior

The scheduler checks each user's private database about once per minute. Delivery state is keyed by event ID and revision, cascades on deletion, and is checked again inside a transaction before sending. The same parent/event lock order used by event edits prevents a correction or deletion racing ahead of an in-progress dispatch. The provider request has a five-second timeout; the transaction holds its lock through that bounded dispatch to preserve ordering.

Concurrent sweeps skip locked records. A reminder already accepted by a push service is not sent again after an unrelated event edit if its scheduled instant is unchanged. A changed reminder time is a new opt-in. Invalid/removed or stale-revision reminders are not sent.

Missing subscriptions/configuration and transient provider failures retry after five minutes. Attempts stop after 12 attempts or once the reminder is 24 hours old, whichever comes first. Expired subscriptions (HTTP 404/410) are removed. Acceptance by any of the user's subscriptions marks the reminder accepted; other failed devices are not retried independently, avoiding duplicate notifications on successful devices.

This is best-effort delivery, not an exactly-once guarantee. A server crash after provider acceptance but before the database commit may cause a duplicate retry. The stable notification tag allows browsers to replace an existing displayed notification. Reminders are unsuitable for emergency or time-critical medical duties. No real push messages are sent by the automated tests.

## Verification

Unit tests inject the clock, dispatch and subscription dependencies. They cover explicit opt-in, future times, offsets/time zones, removal, unchanged history, expiry/retry bounds, generic payloads, unsafe endpoints and expired subscription removal. Service-worker tests confirm fixed text and navigation. Database tests cover concurrent claims, stale revisions, opt-out, retry eligibility, unchanged-time suppression after editing and deletion cascades.

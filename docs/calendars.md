# Calendars (ICS)

Aurboda can sync events from any calendar that provides an ICS URL. Events are stored as `calendar_event` activities with source `calendar`, enabling analysis alongside other activities. Some UI labels still use the older “tags” terminology.

## Data Synced

Calendar events are stored as **activities** by `apps/backend/src/integrations/ical/sync.ts` (`syncCalendar`):

- Activity type: `calendar_event`
- Title: event summary
- External identifier: event UID
- Data: calendar name
- Start time and end time from the event
- Source: `calendar`

Parsed description, location and summary are also retained in `raw_records`. Timeline reads the activity representation; compatibility tag queries are not a separate calendar storage system.

## Admin Setup

No server-side configuration is needed on a public server.

The server fetches each ICS URL a user enters, so by default a URL may only lead to **public** addresses: a URL whose host resolves to a private, loopback or link-local address is refused, and so is a redirect to one. A server on a private network, whose users are trusted with that network, can lift this:

| Variable                           | Description                                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `CALENDAR_ALLOW_PRIVATE_ADDRESSES` | `true` lets calendar URLs point at private / loopback addresses, e.g. a Nextcloud or Radicale on the same LAN (`http://nextcloud.lan/…`). |

Leave it unset on a server that is open to people you would not let onto your network.

## User Setup

1. Go to **Settings > Data Sources > Calendars**
2. Add one or more calendars by providing:
   - **Name** -- A display name for the calendar
   - **ICS URL** -- The calendar's ICS feed URL

### Finding Your ICS URL

Most calendar providers offer ICS export URLs:

- **Google Calendar:** Calendar Settings > "Secret address in iCal format"
- **Outlook/Office 365:** Calendar Settings > Shared calendars > Publish a calendar
- **Apple iCloud:** Calendar sharing > Public Calendar link
- **Nextcloud:** Calendar > sharing icon > copy link with `.ics` extension

## Sync

### Manual Sync

- **REST:** `POST /api/sync/calendars`
- **MCP:** `sync_calendars()`

Options:

- `full_resync: true` -- Re-fetch and reprocess all events

### Auto-Sync

`services/sync-provider.ts` checks the user’s configured calendar polling interval (30-minute default), using the first configured calendar’s sync state before syncing all feeds together. The background scheduler and applicable query paths invoke this provider; see [data sources](data-sources.md).

### Sync Process

1. Fetch ICS data from each configured URL (http or https, following up to 5 redirects, each checked like the URL itself)
2. Parse events from the ICS feed
3. Store events as activities and raw records with the calendar source
4. Each calendar tracks its own sync state independently

Results show events processed per calendar:

```json
{
  "results": [
    { "calendar": "Work", "status": "success", "events_processed": 42 },
    { "calendar": "Personal", "status": "success", "events_processed": 15 }
  ]
}
```

## People dates and Google buttons

People birthdays and important dates use a separate authenticated JSON projection at `GET /people/calendar`, rendered in Timeline without writing generic activities. It is not an ICS subscription URL. Editing profile dates changes this projection directly. See [People dates](people.md#private-calendar-dates).

People also offers individual Google Calendar event-template links. Users review and save one occurrence and choose any repeat in Google; these independent copies do not synchronize back to People.

## Current importer limits

`parseICalEvents` reads top-level VEVENT start/end values; it does not explicitly expand RRULE recurrence or reconcile removed remote occurrences. Do not assume this importer has the same recurrence semantics as People’s deterministic date projection. See [technical debt](ai/technical-debt.md) before extending it.

## Troubleshooting

| Message                                         | Meaning                                                                                                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `The calendar address is private …`             | The URL, or a redirect from it, leads to a private or loopback address. Use a public URL, or ask the admin to set `CALENDAR_ALLOW_PRIVATE_ADDRESSES`. |
| `The calendar URL must use http or https`       | `webcal://` links are https links under another name: replace `webcal://` with `https://`.                                                            |
| `Failed to fetch ICS: 404 Not Found` (or other) | The calendar host answered with that status. Check the URL; a secret address may have been reset.                                                     |
| `Failed to fetch ICS (ECONNREFUSED)` (or other) | The host could not be reached from the Aurboda server.                                                                                                |

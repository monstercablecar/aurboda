# Kanban appearance

Tasks → Board → **Appearance** offers Comfortable (default) or Compact spacing, Default/Teal/Violet/Amber column accents, and a Show descriptions checkbox. Reset defaults restores Comfortable, Default and visible descriptions. Existing task controls, statuses, counts, recurrence and drag/drop behavior are unchanged. Accents affect only column top borders; drop indicators and status colors retain their meaning.

Preferences are local to the signed-in account in this browser, stored under `task-board-appearance:` plus the JSON-encoded username. Only density, accent and description visibility are saved, never task contents or tokens. Invalid or inaccessible storage falls back to defaults; blocked writes leave the current view usable and display a message. An account change remounts the appearance wrapper and reads that account's choices without writing the previous account's preferences.

These preferences are not in the account database or account exports and do not sync between devices or browsers. Clearing browser storage removes them. Hiding descriptions changes presentation only; descriptions remain loaded and available when shown again.

Implementation: `apps/web/src/pages/Tasks/BoardAppearance.tsx` and its scoped CSS, mounted by `TaskBoard.tsx`.

The expanded board also supports account-synced column colors and workflow settings; see [Customizable Tasks board](kanban-workflows.md). Choosing a nondefault appearance accent overrides column top-border colors in this browser; return to Default to show each column's own color.

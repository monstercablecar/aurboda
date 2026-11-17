import type { AddReminderBody, Reminder } from '@aurboda/api-spec'

export const reminderRepeatLabels: Record<AddReminderBody['recurrence'], string> = {
  once: 'Once',
  daily: 'Every day',
  weekdays: 'Weekdays',
  weekly: 'Every week',
}

export const reminderCalendarLink = (reminder: Reminder, origin: string): string | null => {
  if (!reminder.next_due_at) return null
  const start = new Date(reminder.next_due_at)
  if (!Number.isFinite(start.getTime())) return null
  const stamp = (date: Date) =>
    date
      .toISOString()
      .replaceAll(/[-:]/g, '')
      .replace(/\.\d{3}/, '')
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: reminder.title,
    dates: `${stamp(start)}/${stamp(new Date(start.getTime() + 5 * 60_000))}`,
    details: 'A copy of the next Aurboda reminder. Changes in Aurboda do not update this calendar event.',
  })
  if (reminder.link) {
    const target = new URL(reminder.link, origin)
    if (target.origin === new URL(origin).origin) params.set('location', target.href)
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export const reminderFormError = (form: AddReminderBody): string | null => {
  if (!form.title.trim()) return 'Give the notification a name.'
  if (form.title.trim().length > 120) return 'Use a name of 120 characters or fewer.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.start_date)) return 'Choose a start date.'
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.time_of_day)) return 'Choose a time.'
  try {
    new Intl.DateTimeFormat('en', { timeZone: form.timezone }).format()
  } catch {
    return 'Enter a valid time zone, such as America/Denver.'
  }
  if (form.link && (!form.link.startsWith('/') || form.link.startsWith('//') || /[\\\r\n]/.test(form.link))) {
    return 'Use a page path on this server, such as /journal.'
  }
  return null
}

export const localReminderDate = (timezone: string, now = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

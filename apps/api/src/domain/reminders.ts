export interface GroupableReminder {
  dueOn: string;
  completedAt: Date | string | null;
}

export interface ReminderGroups<T> {
  overdue: T[];
  dueToday: T[];
  upcoming: T[];
  completed: T[];
}

/**
 * Splits reminders into overdue / today / upcoming relative to `today` (a date in the user's
 * time zone). Input order is preserved within each group, so callers sort beforehand.
 */
export function groupReminders<T extends GroupableReminder>(
  reminders: readonly T[],
  today: string,
): ReminderGroups<T> {
  const groups: ReminderGroups<T> = { overdue: [], dueToday: [], upcoming: [], completed: [] };
  for (const reminder of reminders) {
    if (reminder.completedAt) groups.completed.push(reminder);
    else if (reminder.dueOn < today) groups.overdue.push(reminder);
    else if (reminder.dueOn === today) groups.dueToday.push(reminder);
    else groups.upcoming.push(reminder);
  }
  return groups;
}

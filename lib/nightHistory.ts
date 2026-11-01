/**
 * Counts consecutive calendar dates on which Curfy recorded a bedtime
 * restriction window, NOT nights slept. Deduplicates legacy duplicate logs.
 * Local calendar date boundaries are projected to UTC ordinal DAYS solely
 * for stable arithmetic across DST; no UTC timestamp is used as the date key.
 */
export function countLoggedNightStreak(
  entries: ReadonlyArray<{ date: string }>,
  now = new Date()
): number {
  const validDates = new Set(
    entries.map((entry) => entry.date).filter((key) =>
      /^\d{4}-\d{2}-\d{2}$/.test(key)
    )
  );
  const todayDay = Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000
  );
  const keyForDay = (ordinal: number) =>
    new Date(ordinal * 86_400_000).toISOString().slice(0, 10);
  // Before tonight's interval starts, yesterday may still be the latest
  // recorded night. A stale earlier entry must not start a fresh streak.
  let day = validDates.has(keyForDay(todayDay))
    ? todayDay
    : todayDay - 1;
  let count = 0;
  while (validDates.has(keyForDay(day))) {
    count++;
    day--;
  }
  return count;
}

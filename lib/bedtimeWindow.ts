/**
 * Pure local-calendar calculations shared by the home UI and native exception flow.
 * Native monitoring accepts calendar components rather than elapsed JS timers.
 * Using Date constructors/setDate preserves local midnight/DST boundaries.
 */
function parseTime(time: string): { hour: number; minute: number; minuteOfDay: number } {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) throw new Error("Invalid time; expected HH:MM.");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error("Time is outside the 24-hour clock.");
  return { hour, minute, minuteOfDay: hour * 60 + minute };
}

function onLocalDate(reference: Date, hour: number, minute: number, dateOffset = 0): Date {
  const date = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  date.setDate(date.getDate() + dateOffset);
  date.setHours(hour, minute, 0, 0);
  return date;
}

export interface BedtimeWindow {
  start: Date;
  end: Date;
}

/** Returns the current bedtime window, or null when selected apps should be unshielded. */
export function currentBedtimeWindow(
  at: Date,
  bedtime: string,
  wakeTime: string
): BedtimeWindow | null {
  const startClock = parseTime(bedtime);
  const endClock = parseTime(wakeTime);
  if (startClock.minuteOfDay === endClock.minuteOfDay) {
    throw new Error("Bedtime and wake time must be different.");
  }

  const todayStart = onLocalDate(at, startClock.hour, startClock.minute);
  const todayEnd = onLocalDate(at, endClock.hour, endClock.minute);
  if (startClock.minuteOfDay < endClock.minuteOfDay) {
    return at >= todayStart && at < todayEnd
      ? { start: todayStart, end: todayEnd }
      : null;
  }

  if (at >= todayStart) {
    return {
      start: todayStart,
      end: onLocalDate(at, endClock.hour, endClock.minute, 1),
    };
  }
  if (at < todayEnd) {
    return {
      start: onLocalDate(at, startClock.hour, startClock.minute, -1),
      end: todayEnd,
    };
  }
  return null;
}

/** Safe for display paths: a corrupted saved preference must not crash Home. */
export function isBedtimeWindowActive(at: Date, bedtime: string, wakeTime: string): boolean {
  try {
    return currentBedtimeWindow(at, bedtime, wakeTime) !== null;
  } catch {
    return false;
  }
}

export function nativeDateComponents(date: Date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
    // A one-shot exception is an elapsed-time interval. Preserve the
    // offset of each endpoint so repeated local hours on DST fall-back
    // resolve to the intended distinct instants in Apple's DateComponents.
    timeZoneOffsetInSeconds: -date.getTimezoneOffset() * 60,
  };
}

/** Calendar key for a nightly restriction, anchored to the bedtime START.
 *  A night from 23:00 to 06:00 stays on the same date after midnight.
 *  Uses device-local calendar fields, never UTC ISO slicing.
 */
export function bedtimeNightKey(
  at: Date,
  bedtime: string,
  wakeTime: string
): string {
  const active = currentBedtimeWindow(at, bedtime, wakeTime);
  const day = active?.start ?? at;
  const year = day.getFullYear();
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const date = String(day.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

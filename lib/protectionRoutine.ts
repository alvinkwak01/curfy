/** Legacy routine identifiers are retained for existing installations.
 * New onboarding defines the only native restriction window directly from
 * user-selected start and end clocks; no routine question is needed.
 */
export type ProtectionRoutine = "evening" | "morning" | "both";

export const PROTECTION_ROUTINES: ReadonlyArray<{
  id: ProtectionRoutine;
  title: string;
  description: string;
  icon: "moon-outline" | "sunny-outline" | "partly-sunny-outline";
}> = [
  { id: "evening", title: "In the evening", description: "Keep selected apps away during your evening.", icon: "moon-outline" },
  { id: "morning", title: "In the morning", description: "Keep distracting apps out of your morning.", icon: "sunny-outline" },
  { id: "both", title: "Both", description: "Continue through the evening and morning until your chosen cutoff.", icon: "partly-sunny-outline" },
];

const DEFAULTS: Record<ProtectionRoutine, { start: string; end: string }> = {
  evening: { start: "23:00", end: "06:00" },
  morning: { start: "06:00", end: "09:00" },
  both: { start: "23:00", end: "09:00" },
};

export function routineDefaults(routine: ProtectionRoutine) {
  return { ...DEFAULTS[routine] };
}

export function parseProtectionRoutine(raw: string | null | undefined): ProtectionRoutine {
  return raw === "morning" || raw === "both" ? raw : "evening";
}

export function clockLabel(time: string): string {
  const [hours, minute] = time.split(":").map(Number);
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

export function startQuestion(routine: ProtectionRoutine): string {
  return routine === "morning"
    ? "When should your morning protection start?"
    : "When should your evening protection start?";
}

export function routineExplainer(routine: ProtectionRoutine): string {
  if (routine === "morning") return "You don't need to predict your wake-up time. Choose when distracting apps should first be blocked.";
  if (routine === "both") return "Your selected app stays protected continuously through the night and morning, until your chosen cutoff.";
  return "Choose when you'd like to put the distracting app away for the night.";
}

export function routineIsEveningBased(routine: ProtectionRoutine): boolean {
  return routine !== "morning";
}

/** Explain which day's clock time ends the continuous daily window. */
export function cutoffDayLabel(start: string, end: string): "same day" | "next day" {
  const minutes = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return hour * 60 + minute;
  };
  return minutes(end) <= minutes(start) ? "next day" : "same day";
}

export function protectionWindowLabel(start: string, end: string): string {
  return `${clockLabel(start)} → ${clockLabel(end)} (${cutoffDayLabel(start, end)})`;
}

/**
 * Legacy compatibility only: treat morning/afternoon starts as non-bedtime.
 * This prevents scheduling bedtime-style reminder notifications at 5:50 AM.
 * It does NOT determine the protection window or infer sleep.
 */
export function inferRoutineFromStart(start: string): ProtectionRoutine {
  const hour = Number(start.split(":")[0]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error("Invalid protection start time.");
  }
  return hour >= 18 || hour < 4 ? "evening" : "morning";
}

/**
 * Curfy's three user-facing reasons share ONE selected-app restriction window.
 * These defaults are suggestions; the user can customize both endpoints.
 * No sleep/wake time or app use is inferred or measured.
 */
export type ProtectionRoutine = "evening" | "morning" | "both";

export const PROTECTION_ROUTINES: ReadonlyArray<{
  id: ProtectionRoutine;
  title: string;
  description: string;
  icon: "moon-outline" | "sunny-outline" | "partly-sunny-outline";
}> = [
  { id: "evening", title: "In the evening", description: "Put distracting apps away at bedtime.", icon: "moon-outline" },
  { id: "morning", title: "In the morning", description: "Keep distracting apps out of your morning.", icon: "sunny-outline" },
  { id: "both", title: "Both", description: "From bedtime until your morning cutoff.", icon: "partly-sunny-outline" },
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

/**
 * The same math drives both swipeable Curfy clock columns.
 * A swipe UP (negative dy) advances the time; DOWN reverses it.
 */
export function wrapTimeUnit(value: number, count: number): number {
  if (!Number.isInteger(count) || count < 1) throw new Error("Invalid time wheel size");
  return ((Math.round(value) % count) + count) % count;
}

export function swipeSteps(dy: number, pixelsPerStep: number): number {
  if (!Number.isFinite(dy) || !Number.isFinite(pixelsPerStep) || pixelsPerStep <= 0) {
    return 0;
  }
  return Math.round(-dy / pixelsPerStep);
}

/** Add a short coast on release; capped so one flick remains controllable. */
export function flingSteps(velocityY: number): number {
  if (!Number.isFinite(velocityY) || Math.abs(velocityY) < 0.7) return 0;
  return Math.max(-6, Math.min(6, Math.round(-velocityY * 1.8)));
}

export function clockString(hour: number, minute: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(wrapTimeUnit(hour, 24))}:${pad(wrapTimeUnit(minute, 60))}`;
}

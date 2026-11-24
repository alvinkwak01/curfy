/**
 * Restarting onboarding must not become a one-tap escape from an active
 * protection window. Users can still manage Screen Time permissions in iOS
 * and can delete their account via a separate, clearly destructive action.
 */
export function mayRestartSetup({
  insideBedtime,
  screenTimeAuthorized,
  hasSelectedMode,
  activeException,
}: {
  insideBedtime: boolean;
  screenTimeAuthorized: boolean;
  hasSelectedMode: boolean;
  activeException: boolean;
}): boolean {
  return !insideBedtime || !screenTimeAuthorized || !hasSelectedMode || activeException;
}

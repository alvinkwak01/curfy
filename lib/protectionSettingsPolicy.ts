/**
 * Only changes to a protected schedule or app tokens need native Screen Time
 * reconfiguration. Purely cosmetic Settings edits must not clear a shield,
 * reschedule a monitor, or cancel a temporary exception.
 */
export type ProtectionSettingsSnapshot = {
  bedtime: string;
  wakeTime: string;
  blockMode: string | null;
  routine?: string;
};

export function protectionSettingsChanged(
  saved: ProtectionSettingsSnapshot,
  draft: ProtectionSettingsSnapshot,
  pickerEdited: boolean
): boolean {
  return pickerEdited ||
    saved.bedtime !== draft.bedtime ||
    saved.wakeTime !== draft.wakeTime ||
    saved.blockMode !== draft.blockMode ||
    saved.routine !== draft.routine;
}

export function allowProtectionReconfiguration({
  changingProtection,
  insideCurrentBedtime,
  authorized,
  hasConfiguredApp,
  activeException,
}: {
  changingProtection: boolean;
  insideCurrentBedtime: boolean;
  authorized: boolean;
  hasConfiguredApp: boolean;
  activeException: boolean;
}): boolean {
  // User can always change profile text; permission revocation still needs
  // a recoverable path through Settings and iOS Settings.
  return !changingProtection || !insideCurrentBedtime || !authorized ||
    !hasConfiguredApp || activeException;
}

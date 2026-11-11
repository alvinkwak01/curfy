/**
 * react-native-device-activity@0.6.1 persists the native FamilyActivityPicker
 * selection in a Combine sink debounced by 100ms. Its onDismissRequest fires
 * as soon as the native sheet closes. If React unmounts immediately, the
 * Combine subscription is destroyed before the last selection can be saved.
 *
 * Keep the picker mounted at least 250ms AFTER dismissal, and briefly longer
 * if no native onSelectionChange (which follows persistence) was observed.
 * The timeout is defensive; it never declares an app valid. Continue always
 * validates the persisted native tokens again against the one-app policy.
 */
export async function waitForPersistedPickerCommit(
  sawPersistedSelectionEvent: () => boolean,
  delay: (ms: number) => Promise<void> = (ms) =>
    new Promise(resolve => setTimeout(resolve, ms))
): Promise<void> {
  await delay(250);
  if (sawPersistedSelectionEvent()) return;
  await delay(250);
  if (sawPersistedSelectionEvent()) return;
  await delay(250);
}

/** Serializes JS-originated native mutations across Free, Premium and Settings.
 * Native extension callbacks remain independent and require device testing.
 */
let pending = false;
export function protectionOperationPending(): boolean { return pending; }
export function beginProtectionOperation(): () => void {
  if (pending) throw new Error("Curfy is still preparing a protection change. Wait for it to finish and try again.");
  pending = true;
  return () => { pending = false; };
}

/** Serializes JS-originated native mutations across Free, Premium and Settings.
 * An explicit owner allows the journal and its native commit to share a lock.
 * Native extension callbacks remain independent and require device testing.
 */
let pendingOwner: object | null = null;
let depth = 0;
export function protectionOperationPending(): boolean { return pendingOwner !== null; }
export function beginProtectionOperation(owner: object = {}): () => void {
  if (pendingOwner && pendingOwner !== owner) throw new Error("Curfy is still preparing a protection change. Wait for it to finish and try again.");
  pendingOwner = owner;
  depth++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--depth === 0) pendingOwner = null;
  };
}

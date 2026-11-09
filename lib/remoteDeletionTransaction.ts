/** Transport-independent deletion protocol. Never fall back to the legacy
 * one-shot endpoint: preparation MUST precede every destructive commit.
 * The recovery proof is a sensitive, deletion-only credential; never log it.
 */
export const REMOTE_DELETION_PENDING_KEY = "@curfy/remote_deletion_pending_v1";
export interface DeletionIntent {
  version: 1;
  userId: string;
  requestId: string;
  proof: string;
}
interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export class DeletionProofRejected extends Error {}

export interface DeletionTransport {
  // Must authenticate using the live session; server derives userId itself.
  prepare(): Promise<Omit<DeletionIntent, "version">>;
  // Both authenticate with the narrowly scoped proof, not the session.
  status(intent: DeletionIntent): Promise<"pending" | "deleted">;
  commit(intent: DeletionIntent): Promise<"deleted">;
}
const failure = () => new Error("Curfy couldn't verify the pending account deletion. Please retry.");
function valid(value: unknown): value is DeletionIntent {
  if (!value || typeof value !== "object") return false;
  const v = value as DeletionIntent;
  return v.version === 1 && [v.userId, v.requestId, v.proof].every(
    field => typeof field === "string" && field.length > 0 && field.length <= 4096
  );
}
export async function readDeletionIntent(storage: Storage): Promise<DeletionIntent | null> {
  const raw = await storage.getItem(REMOTE_DELETION_PENDING_KEY);
  if (raw === null) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw failure(); }
  if (!valid(value)) throw failure();
  return value;
}

/** One coordinator per AuthProvider. Its pending journal must be loaded before
 * allowing profile creation, and retained until confirmed local finalization.
 */
export function createDeletionTransaction(storage: Storage, transport: DeletionTransport) {
  let busy = false;
  return {
    async run(currentUserId: string | null, confirm: (userId: string) => Promise<void>): Promise<void> {
      if (busy) throw new Error("Curfy is already processing an account deletion.");
      busy = true;
      try {
        let intent = await readDeletionIntent(storage);
        if (intent && currentUserId !== null && intent.userId !== currentUserId) throw failure();
        if (!intent) {
          // No session does not prove a previously created account is absent.
          // Caller may choose a local-only flow only with its own stronger evidence.
          if (!currentUserId) throw failure();
          const prepared = await transport.prepare();
          intent = { ...prepared, version: 1 };
          if (!valid(intent) || intent.userId !== currentUserId) throw failure();
          const serialized = JSON.stringify(intent);
          await storage.setItem(REMOTE_DELETION_PENDING_KEY, serialized);
          if (await storage.getItem(REMOTE_DELETION_PENDING_KEY) !== serialized) throw failure();
        }
        // Reassert and verify existing intent too: a caller must not commit
        // using a proof it cannot read back before a process exit.
        const saved = await readDeletionIntent(storage);
        if (!saved || JSON.stringify(saved) !== JSON.stringify(intent)) throw failure();
        let status: "pending" | "deleted";
        try {
          status = await transport.status(intent);
        } catch (error) {
          // Only an explicit proof rejection permits renewal, and only via
          // fresh server authentication of the SAME account. Never replace a
          // journal after a timeout or with a newly created anonymous identity.
          if (!(error instanceof DeletionProofRejected) || !currentUserId) throw error;
          const prepared = { ...await transport.prepare(), version: 1 as const };
          if (!valid(prepared) || prepared.userId !== intent.userId || prepared.userId !== currentUserId) throw failure();
          const serialized = JSON.stringify(prepared);
          await storage.setItem(REMOTE_DELETION_PENDING_KEY, serialized);
          if (await storage.getItem(REMOTE_DELETION_PENDING_KEY) !== serialized) throw failure();
          intent = prepared;
          status = await transport.status(intent);
        }
        if (status !== "deleted") {
          if (status !== "pending" || await transport.commit(intent) !== "deleted") throw failure();
        }
        // The journal remains if receipt persistence/signout/local cleanup fails.
        await confirm(intent.userId);
      } finally { busy = false; }
    },
    async finish(confirmedUserId: string): Promise<void> {
      if (busy) throw new Error("Curfy is already processing an account deletion.");
      busy = true;
      try {
        const intent = await readDeletionIntent(storage);
        if (intent && intent.userId !== confirmedUserId) throw failure();
        await storage.removeItem(REMOTE_DELETION_PENDING_KEY);
        if (await storage.getItem(REMOTE_DELETION_PENDING_KEY) !== null) throw failure();
      } finally { busy = false; }
    },
  };
}

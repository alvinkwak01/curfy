/** Narrow deletion-only capabilities. No database receipt table or user data
 * survives deletion on our behalf. Signing keys must remain available through
 * the last capability's expiry; never reuse Supabase's service-role key.
 */
interface Dependencies {
  audience: string;
  currentKey: string;
  previousKey?: string;
  now(): number;
  authenticate(bearer: string): Promise<string | null>;
  exists(userId: string): Promise<boolean>;
  deleteUser(userId: string): Promise<void>;
}
const TTL = 30 * 24 * 60 * 60 * 1000;
const enc = new TextEncoder();
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const decode = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
async function key(value: string) {
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error("Missing recovery signing configuration");
  return crypto.subtle.importKey("raw", Uint8Array.from(value.match(/../g)!, s => parseInt(s, 16)), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
interface Capability { v: 1; aud: string; userId: string; requestId: string; issued: number; expires: number }
const reply = (status: number, data: object) => new Response(JSON.stringify(data), { status, headers: {
  "Content-Type": "application/json", "Cache-Control": "no-store", "Allow": "POST",
} });
export function deletionHandler(deps: Dependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return reply(405, { error: "Method not allowed" });
    try {
      // Bound memory use even when Content-Length is absent or dishonest.
      const reader = req.body?.getReader();
      let body = "", size = 0;
      if (reader) {
        const decoder = new TextDecoder();
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 8192) { await reader.cancel(); return reply(413, { error: "Request too large" }); }
          body += decoder.decode(chunk.value, { stream: true });
        }
        body += decoder.decode();
      }
      let input;
      try { input = JSON.parse(body); } catch { return reply(400, { error: "Invalid request" }); }
      if (!input || typeof input !== "object") return reply(400, { error: "Invalid request" });
      if (input.action === "prepare") {
        const bearer = req.headers.get("Authorization") ?? "";
        if (!/^Bearer\s+\S+$/i.test(bearer)) return reply(401, { error: "Invalid session" });
        const userId = await deps.authenticate(bearer);
        if (!userId) return reply(401, { error: "Invalid session" });
        const issued = deps.now();
        const payload: Capability = { v: 1, aud: deps.audience, userId, requestId: crypto.randomUUID(), issued, expires: issued + TTL };
        const encoded = encode(enc.encode(JSON.stringify(payload)));
        const signature = await crypto.subtle.sign("HMAC", await key(deps.currentKey), enc.encode(encoded));
        return reply(200, { userId, requestId: payload.requestId, proof: `${encoded}.${encode(new Uint8Array(signature))}` });
      }
      if (input.action !== "status" && input.action !== "commit") return reply(400, { error: "Invalid action" });
      if (typeof input.proof !== "string" || input.proof.length > 4096) return reply(401, { error: "Invalid recovery proof" });
      let payload: Capability;
      try {
        const parts = input.proof.split(".");
        if (parts.length !== 2 || parts.some((s: string) => !/^[A-Za-z0-9_-]+$/.test(s))) throw Error();
        const [encoded, signature] = parts;
        let verified = false;
        for (const secret of [deps.currentKey, deps.previousKey].filter(Boolean) as string[]) {
          if (await crypto.subtle.verify("HMAC", await key(secret), decode(signature), enc.encode(encoded))) { verified = true; break; }
        }
        if (!verified) throw Error();
        payload = JSON.parse(new TextDecoder().decode(decode(encoded)));
        if (payload.v !== 1 || payload.aud !== deps.audience || typeof payload.userId !== "string" || !payload.userId ||
          typeof payload.requestId !== "string" || !payload.requestId || !Number.isSafeInteger(payload.issued) ||
          payload.issued > deps.now() || payload.expires !== payload.issued + TTL) throw Error();
      } catch { return reply(401, { error: "Invalid recovery proof" }); }
      if (payload.expires <= deps.now()) return reply(410, { error: "Recovery proof expired; deletion is not confirmed" });
      // Only the verified signed subject is ever used; ignore body IDs entirely.
      if (!await deps.exists(payload.userId)) return reply(200, { status: "deleted" });
      if (input.action === "status") return reply(200, { status: "pending" });
      try { await deps.deleteUser(payload.userId); } catch {
        // Concurrent valid retries may both observe an existing user, then one
        // deletes first. Independently check absence; an arbitrary error is not proof.
        if (await deps.exists(payload.userId)) return reply(503, { error: "Deletion unavailable; retry" });
      }
      if (await deps.exists(payload.userId)) return reply(503, { error: "Deletion not confirmed; retry" });
      return reply(200, { status: "deleted" });
    } catch { return reply(503, { error: "Deletion unavailable; retry" }); }
  };
}

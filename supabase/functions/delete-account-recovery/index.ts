import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.7";
import { deletionHandler } from "./protocol.ts";

// Deploy this NEW endpoint with verify_jwt=false: prepare explicitly validates
// a live user through Auth; status/commit validate our scoped recovery proof.
// The existing delete-account endpoint's JWT gateway must remain enabled.
const url = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
Deno.serve(deletionHandler({
  audience: `${url}/delete-account-recovery/v1`,
  currentKey: Deno.env.get("CURFY_DELETION_RECOVERY_KEY") ?? "",
  previousKey: Deno.env.get("CURFY_DELETION_RECOVERY_PREVIOUS_KEY"),
  now: () => Date.now(),
  authenticate: async bearer => {
    const { data, error } = await admin.auth.getUser(bearer.replace(/^Bearer\s+/i, ""));
    if (error) return null;
    return data.user?.id ?? null;
  },
  exists: async userId => {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    // Only the Auth service's specific absence result establishes deletion.
    // Never interpret generic 401/404/network/database failures as absence.
    if (error?.code === "user_not_found") return false;
    if (error || !data.user || data.user.id !== userId) throw Error("Auth lookup unavailable");
    return true;
  },
  deleteUser: async userId => {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw Error("Auth deletion unavailable");
  },
}));

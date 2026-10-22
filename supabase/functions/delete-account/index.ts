// Deletes the calling user's Supabase auth account entirely — the piece
// SleepContext.deleteAccount() (client-side) never could do on its own,
// since removing an auth user requires the service-role key, which must
// never ship inside the app. This function is the only place that key is
// used. Deploy with: supabase functions deploy delete-account
//
// Deleting the auth user cascades to `profiles` automatically (see
// `on delete cascade` on profiles.id in supabase/schema.sql) — no separate
// delete against `profiles` is needed here.
//
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are
// auto-injected into every Edge Function by the platform; nothing to
// configure manually for this to run once deployed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Scoped to the caller's own access token. This is what actually
    // establishes *who* is asking — never trust a client-supplied user id
    // for a destructive admin action like this.
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Service-role client — the only client in this codebase with
    // permission to delete an auth user outright.
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userData.user.id);
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

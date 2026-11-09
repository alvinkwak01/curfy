import { DeletionProofRejected, type DeletionTransport } from "./remoteDeletionTransaction";
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

// Filled in from .env (see .env.example) — do not hardcode real values here.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// True once real values are in place. Everything that touches auth or the
// leaderboard (context/AuthContext.tsx) checks this first and no-ops
// instead of calling into Supabase when it's false — accounts are an
// add-on to a bedtime lock app, not something its startup should depend on.
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    "[Curfy] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. " +
      "Copy .env.example to .env and fill in your project's values, then restart Metro. " +
      "The app runs fine without it — sign-up/leaderboard just stay inactive until it's set."
  );
}

// createClient() throws synchronously on an empty/invalid URL, which would
// crash the entire app at import time before the warning above even helps.
// A syntactically-valid placeholder keeps the client constructible; actual
// network calls are what get gated on isSupabaseConfigured, not this.
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key",
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

export interface LeaderboardProfile {
  id: string;
  display_name: string;
  current_streak: number;
  longest_streak: number;
}

// Raw transport deliberately avoids functions.invoke's session refresh on
// recovery calls. A deleted/expired session must not prevent proof verification.
export const remoteDeletionTransport: DeletionTransport = {
  prepare: async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new Error("Curfy couldn't verify your session. Please retry.");
    return deletionRequest({ action: "prepare" }, data.session.access_token);
  },
  status: async intent => (await deletionRequest({ action: "status", proof: intent.proof })).status,
  commit: async intent => (await deletionRequest({ action: "commit", proof: intent.proof })).status,
};
async function deletionRequest(body: object, token?: string) {
  if (!isSupabaseConfigured) throw new Error("Leaderboard is unavailable.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/delete-account-recovery`, {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", apikey: supabaseAnonKey!,
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    if (response.status === 401 || response.status === 410) throw new DeletionProofRejected("Curfy needs to verify your deletion request again.");
    if (!response.ok) throw new Error("Curfy couldn't confirm online account deletion. Please retry.");
    return await response.json();
  } finally { clearTimeout(timeout); }
}

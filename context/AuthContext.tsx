import { isSupabaseConfigured, LeaderboardProfile, supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

interface AuthContextType {
  session: Session | null;
  isSignedIn: boolean;
  isAuthLoading: boolean;
  // No email/password screen — every install gets a silent, anonymous
  // Supabase auth session and a matching `profiles` row the first time
  // onboarding finishes (see EnsureLeaderboardIdentity in app/_layout.tsx).
  // Safe to call repeatedly: no-ops once a session already exists.
  // Trade-off worth knowing: an anonymous session lives only on this
  // device/install. There's no email+password to sign back in with, so
  // deleting the app or switching devices orphans that leaderboard row —
  // it's not recoverable the way a real account would be. Accepted
  // deliberately for zero-friction participation; revisit if that trade-off
  // stops being fine (e.g. a "claim this profile with an email" upgrade path).
  ensureAnonymousProfile: (displayName: string) => Promise<void>;
  // Real, server-side sign out — distinct from SleepContext's signOut(),
  // which only resets the local onboarding flag and never touched a
  // backend because there wasn't one. Call both when the user signs out.
  signOutRemote: () => Promise<void>;
  // Permanently deletes the auth user (and, via cascade, its `profiles`
  // row) on the server. Requires the service-role key, which never ships
  // in the app — this calls the `delete-account` Edge Function instead.
  // Best-effort: local wipe (SleepContext.deleteAccount) proceeds either
  // way, so a failed/offline call here doesn't block the device-side
  // reset, it just leaves the remote row behind until it succeeds later.
  deleteRemoteAccount: () => Promise<void>;
  // Pushes bedtime, the two streak numbers, and the current display name
  // to this user's profile row. Safe to call when signed out — it's a
  // no-op.
  syncProfile: (
    bedtime: string,
    currentStreak: number,
    longestStreak: number,
    displayName: string
  ) => Promise<void>;
  fetchLeaderboard: (metric: "current_streak" | "longest_streak") => Promise<LeaderboardProfile[]>;
  // 1-indexed global rank for a given streak value — a plain count query
  // (`how many people beat this number`), not a stored/precomputed field.
  // Used for a signed-in viewer who isn't in the top-50 fetched above.
  fetchMyRank: (metric: "current_streak" | "longest_streak", myValue: number) => Promise<number | null>;
  // Every synced user's bedtime, for the community bedtime tracker chart.
  // Capped — see the function body for why.
  fetchCommunityBedtimes: () => Promise<string[]>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  // Avoids pushing a redundant identical update on every streak render.
  const lastSynced = useRef<{
    bedtime: string;
    current: number;
    longest: number;
    name: string;
  } | null>(null);
  // Guards against firing signInAnonymously() twice from a double-mount
  // or a fast re-render before the first call's session has come back.
  const ensuringProfile = useRef(false);

  useEffect(() => {
    // No project configured yet (see lib/supabase.ts) — skip touching the
    // placeholder client entirely rather than issuing real calls against
    // https://placeholder.supabase.co. Auth just stays permanently
    // "loaded, signed out" until real keys land in .env.
    if (!isSupabaseConfigured) {
      setIsAuthLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsAuthLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const ensureAnonymousProfile = async (displayName: string) => {
    if (!isSupabaseConfigured) return;
    if (session || ensuringProfile.current) return;
    ensuringProfile.current = true;
    try {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error || !data.session) return;
      // upsert, not insert — safe to call more than once for the same
      // anonymous user (e.g. a retry) without a duplicate-key error.
      await supabase
        .from("profiles")
        .upsert({ id: data.session.user.id, display_name: displayName || "Sleeper" });
    } finally {
      ensuringProfile.current = false;
    }
  };

  const signOutRemote = async () => {
    if (!isSupabaseConfigured) return;
    lastSynced.current = null;
    await supabase.auth.signOut();
  };

  const deleteRemoteAccount = async () => {
    if (!isSupabaseConfigured) return;
    if (!session?.user) return;
    try {
      // supabase-js attaches the current session's access token as the
      // Authorization header automatically — the Edge Function derives
      // which user to delete from that token, not from anything sent here.
      await supabase.functions.invoke("delete-account");
    } catch (_) {
      // Swallowed deliberately — see the interface comment above.
    }
    lastSynced.current = null;
  };

  const syncProfile = async (
    bedtime: string,
    currentStreak: number,
    longestStreak: number,
    displayName: string
  ) => {
    if (!isSupabaseConfigured) return;
    if (!session?.user) return;
    const name = displayName || "Sleeper";
    if (
      lastSynced.current?.bedtime === bedtime &&
      lastSynced.current?.current === currentStreak &&
      lastSynced.current?.longest === longestStreak &&
      lastSynced.current?.name === name
    ) {
      return;
    }
    lastSynced.current = { bedtime, current: currentStreak, longest: longestStreak, name };
    await supabase
      .from("profiles")
      .update({
        bedtime,
        current_streak: currentStreak,
        longest_streak: longestStreak,
        display_name: name,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.user.id);
  };

  const fetchLeaderboard = async (
    metric: "current_streak" | "longest_streak"
  ): Promise<LeaderboardProfile[]> => {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
      .from("profiles")
      .select("id,display_name,current_streak,longest_streak")
      .order(metric, { ascending: false })
      .limit(50);
    if (error || !data) return [];
    return data;
  };

  const fetchMyRank = async (
    metric: "current_streak" | "longest_streak",
    myValue: number
  ): Promise<number | null> => {
    if (!isSupabaseConfigured) return null;
    // Rank = 1 + however many people strictly beat this value. A plain
    // count query, not a stored/precomputed leaderboard position — fine
    // at this scale, would need a real materialized rank at real scale.
    const { count, error } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gt(metric, myValue);
    if (error || count == null) return null;
    return count + 1;
  };

  const fetchCommunityBedtimes = async (): Promise<string[]> => {
    if (!isSupabaseConfigured) return [];
    // Capped at 500 — this reduces client-side (see BedtimeHistogram),
    // which is fine at hobby scale but would need a server-side
    // aggregation (a Postgres function grouping by hour) to hold up at
    // real scale. Not built; not needed yet.
    const { data, error } = await supabase.from("profiles").select("bedtime").limit(500);
    if (error || !data) return [];
    return data.map((row) => row.bedtime as string);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        isSignedIn: !!session,
        isAuthLoading,
        ensureAnonymousProfile,
        signOutRemote,
        deleteRemoteAccount,
        syncProfile,
        fetchLeaderboard,
        fetchMyRank,
        fetchCommunityBedtimes,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

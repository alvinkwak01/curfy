import { isSupabaseConfigured, LeaderboardProfile, supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

interface AuthResult {
  error: string | null;
}

interface AuthContextType {
  session: Session | null;
  isSignedIn: boolean;
  isAuthLoading: boolean;
  // Creates a real account and a matching `profiles` row (using the
  // display name already set locally in onboarding, so we don't ask twice).
  signUp: (email: string, password: string, displayName: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  // Real, server-side sign out — distinct from SleepContext's signOut(),
  // which only resets the local onboarding flag and never touched a
  // backend because there wasn't one. Call both when the user signs out.
  signOutRemote: () => Promise<void>;
  // Pushes bedtime + the two streak numbers to this user's profile row.
  // Safe to call when signed out — it's a no-op.
  syncProfile: (bedtime: string, currentStreak: number, longestStreak: number) => Promise<void>;
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
  const lastSynced = useRef<{ bedtime: string; current: number; longest: number } | null>(null);

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

  const NOT_CONFIGURED_ERROR =
    "The leaderboard isn't set up yet — ask whoever's building this to finish the Supabase setup.";

  const signUp = async (
    email: string,
    password: string,
    displayName: string
  ): Promise<AuthResult> => {
    if (!isSupabaseConfigured) return { error: NOT_CONFIGURED_ERROR };
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    if (!data.user) {
      // Email confirmation is required by the project's auth settings —
      // there's no session yet, but there is a user id we can attach a
      // profile row to.
      return { error: "Check your email to confirm your account, then sign in." };
    }
    const { error: profileError } = await supabase
      .from("profiles")
      .insert({ id: data.user.id, display_name: displayName || "Sleeper" });
    if (profileError) return { error: profileError.message };
    return { error: null };
  };

  const signIn = async (email: string, password: string): Promise<AuthResult> => {
    if (!isSupabaseConfigured) return { error: NOT_CONFIGURED_ERROR };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOutRemote = async () => {
    if (!isSupabaseConfigured) return;
    lastSynced.current = null;
    await supabase.auth.signOut();
  };

  const syncProfile = async (
    bedtime: string,
    currentStreak: number,
    longestStreak: number
  ) => {
    if (!isSupabaseConfigured) return;
    if (!session?.user) return;
    if (
      lastSynced.current?.bedtime === bedtime &&
      lastSynced.current?.current === currentStreak &&
      lastSynced.current?.longest === longestStreak
    ) {
      return;
    }
    lastSynced.current = { bedtime, current: currentStreak, longest: longestStreak };
    await supabase
      .from("profiles")
      .update({
        bedtime,
        current_streak: currentStreak,
        longest_streak: longestStreak,
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
        signUp,
        signIn,
        signOutRemote,
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

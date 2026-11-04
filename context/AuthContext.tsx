import { isSupabaseConfigured, LeaderboardProfile, supabase } from "@/lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
  // Explicit Supabase sign out for future authenticated flows. Curfy's
  // current "Restart Setup" intentionally preserves the anonymous session
  // to avoid orphaning a nonrecoverable online profile.
  signOutRemote: () => Promise<void>;
  // Permanently deletes the auth user (and, via cascade, its `profiles`
  // row) on the server. Requires the service-role key, which never ships
  // in the app — this calls the `delete-account` Edge Function instead.
  // Required, not best-effort: a network/server deletion error stops the
  // local wipe. SleepContext also verifies native shields stopped before
  // deleting on-device recovery state.
  deleteRemoteAccount: () => Promise<void>;
  // Until local deletion is confirmed, never create another anonymous
  // account or sync a fresh profile into the just-deleted identity.
  isDeletingAccount: boolean;
  finishAccountDeletion: () => Promise<void>;
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
  // Historical profile start times. Mixed Evening/Morning cohorts cannot
  // be compared as "average bedtime"; the old chart is hidden from UI.
  fetchCommunityBedtimes: () => Promise<string[]>;
}

const AuthContext = createContext<AuthContextType | null>(null);
const REMOTE_DELETION_CONFIRMED_KEY = "@curfy/remote_deletion_confirmed_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const deletionInProgress = useRef(false);
  // A success receipt for the specific deleted remote user. It MUST be
  // written only after Supabase's deletion endpoint confirms success.
  const remoteDeletedUserId = useRef<string | null>(null);
  const authRecoveryFailed = useRef(false);
  // Avoids pushing a redundant identical update on every streak render.
  const lastSynced = useRef<{
    userId: string;
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
    let active = true;
    // Load the deletion receipt before exposing auth as "ready"; otherwise
    // app restart after remote deletion could silently create a fresh
    // anonymous public profile while private local deletion is incomplete.
    void Promise.all([
      supabase.auth.getSession(),
      AsyncStorage.getItem(REMOTE_DELETION_CONFIRMED_KEY),
    ])
      .then(([{ data, error }, confirmedId]) => {
        if (!active) return;
        if (error) console.warn("[Curfy] Could not restore leaderboard session", error);
        if (confirmedId) {
          remoteDeletedUserId.current = confirmedId;
          deletionInProgress.current = true;
          setIsDeletingAccount(true);
        }
        setSession(data.session ?? null);
      })
      .catch((error) => {
        // If the local deletion receipt cannot be read, do not create a new
        // remote identity until storage becomes available to verify it.
        authRecoveryFailed.current = true;
        deletionInProgress.current = true;
        if (active) setIsDeletingAccount(true);
        console.warn("[Curfy] Could not restore leaderboard session or deletion receipt", error);
      })
      .finally(() => {
        if (active) setIsAuthLoading(false);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (active) setSession(newSession);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const ensureAnonymousProfile = async (displayName: string) => {
    if (!isSupabaseConfigured || deletionInProgress.current) return;
    if (session || ensuringProfile.current) return;
    ensuringProfile.current = true;
    try {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error || !data.session) return;
      // A successful auth session does not guarantee the profile row exists.
      // If this write fails, later syncProfile() must also be able to
      // create/repair the row rather than silently updating zero rows.
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({ id: data.session.user.id, display_name: displayName || "Sleeper" });
      if (profileError) throw new Error("Curfy couldn't create the online leaderboard profile.");
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
    // If startup could not read the auth session/deletion receipt, treating
    // a null session as no account would falsely allow a local-only wipe.
    if (authRecoveryFailed.current) {
      throw new Error("Curfy couldn't verify your online account or a previous deletion. Reopen Curfy when local storage is available.");
    }
    // A persisted receipt means a previous attempt has already deleted the
    // server account. Retrying the Edge Function would now get 401 because
    // that remote user no longer exists, leaving local private data stranded.
    const confirmedId = remoteDeletedUserId.current;
    if (confirmedId) {
      if (session?.user && session.user.id !== confirmedId) {
        throw new Error("A different Curfy account is active. Cannot reuse a prior deletion receipt.");
      }
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) {
        throw new Error("Curfy couldn't clear its local cloud session. Retry Delete Account.");
      }
      lastSynced.current = null;
      return;
    }
    if (!session?.user) return;
    if (deletionInProgress.current) {
      throw new Error("Curfy is already processing an account deletion.");
    }
    deletionInProgress.current = true;
    setIsDeletingAccount(true);
    try {
      // Authenticated POST to the deployed server, which must prove caller
      // identity independently. A response or network failure is NOT proof.
      const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>(
        "delete-account", { method: "POST" }
      );
      if (error) throw new Error("Curfy couldn't delete your online account. Check your connection and retry.");
      if (data?.success !== true) {
        throw new Error(data?.error || "Online account deletion wasn't confirmed. Please retry.");
      }
      // Persist the server-confirmed result before local sign-out. If signOut
      // fails, the user can retry deletion without reusing an invalid JWT.
      remoteDeletedUserId.current = session.user.id;
      await AsyncStorage.setItem(REMOTE_DELETION_CONFIRMED_KEY, session.user.id);
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) {
        throw new Error("Curfy couldn't clear its local cloud session. Retry Delete Account.");
      }
      lastSynced.current = null;
    } catch (error) {
      if (remoteDeletedUserId.current === null) {
        // Only a genuinely unconfirmed remote deletion may allow future
        // anonymous profile operations.
        deletionInProgress.current = false;
        setIsDeletingAccount(false);
      }
      throw error;
    }
  };

  const finishAccountDeletion = async () => {
    // Called only after protection, native tickets, journal, and all local
    // preferences have been removed. If this write fails, keep the receipt
    // so a retry does not call the now-invalid remote account again.
    await AsyncStorage.removeItem(REMOTE_DELETION_CONFIRMED_KEY);
    if (await AsyncStorage.getItem(REMOTE_DELETION_CONFIRMED_KEY) != null) {
      throw new Error("Curfy could not clear the confirmed deletion receipt.");
    }
    remoteDeletedUserId.current = null;
    deletionInProgress.current = false;
    setIsDeletingAccount(false);
  };

  const syncProfile = async (
    bedtime: string,
    currentStreak: number,
    longestStreak: number,
    displayName: string
  ) => {
    if (!isSupabaseConfigured) return;
    if (!session?.user) return;
    const userId = session.user.id;
    const name = displayName || "Sleeper";
    if (
      lastSynced.current?.userId === userId &&
      lastSynced.current?.bedtime === bedtime &&
      lastSynced.current?.current === currentStreak &&
      lastSynced.current?.longest === longestStreak &&
      lastSynced.current?.name === name
    ) {
      return;
    }
    // The account can exist without a profile row if the first anonymous
    // sign-in succeeded but the initial insert failed (e.g. offline).
    // Upsert repairs that case; update() would silently touch zero rows.
    const { error } = await supabase
      .from("profiles")
      .upsert({
        id: userId,
        bedtime,
        current_streak: currentStreak,
        longest_streak: longestStreak,
        display_name: name,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
    if (error) {
      // A rejected network/database write is NOT a successful sync.
      // Do not poison the equality cache: future retries must be possible.
      throw new Error("Curfy couldn't sync the online leaderboard profile.");
    }
    lastSynced.current = {
      userId, bedtime, current: currentStreak, longest: longestStreak, name,
    };
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
        isDeletingAccount,
        ensureAnonymousProfile,
        signOutRemote,
        deleteRemoteAccount,
        finishAccountDeletion,
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

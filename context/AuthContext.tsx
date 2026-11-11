import { createDeletionTransaction, readDeletionIntent } from "@/lib/remoteDeletionTransaction";
import { isSupabaseConfigured, LeaderboardProfile, remoteDeletionTransport, supabase } from "@/lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export type LeaderboardConsent = "unknown" | "joined" | "declined" | "leaving";
interface AuthContextType {
  leaderboardConsent: LeaderboardConsent;
  isConsentLoading: boolean;
  consentError: boolean;
  retryConsent: () => Promise<void>;
  setLeaderboardParticipation: (join: boolean) => Promise<void>;
  session: Session | null;
  isSignedIn: boolean;
  isAuthLoading: boolean;
  // After explicit leaderboard consent, maintain an anonymous cloud profile.
  // No email/password or cloud account is required for app protection/Premium.
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
const LEADERBOARD_CONSENT_KEY = "@curfy/leaderboard_consent_v1";
const REMOTE_DELETION_CONFIRMED_KEY = "@curfy/remote_deletion_confirmed_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [leaderboardConsent, setConsent] = useState<LeaderboardConsent>("unknown");
  const [isConsentLoading, setConsentLoading] = useState(true);
  const [consentError, setConsentError] = useState(false);
  const consentRef = useRef<LeaderboardConsent>("unknown");
  const consentChangePending = useRef(false);
  const profileWork = useRef<Promise<void>>(Promise.resolve());
  const sessionRef = useRef<Session | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const deletionInProgress = useRef(false);
  // A success receipt for the specific deleted remote user. It MUST be
  // written only after Supabase's deletion endpoint confirms success.
  const remoteDeletedUserId = useRef<string | null>(null);
  const authRecoveryFailed = useRef(false);
  const authReady = useRef(false);
  const deletionTransaction = useRef(createDeletionTransaction(AsyncStorage, remoteDeletionTransport));
  const pendingDeletion = useRef(false);
  const deletionCallPending = useRef(false);
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

  const retryConsent = useCallback(async () => {
    setConsentLoading(true); setConsentError(false);
    try {
      const saved = await AsyncStorage.getItem(LEADERBOARD_CONSENT_KEY);
      const value: LeaderboardConsent = saved === "joined" || saved === "declined" || saved === "leaving" ? saved : "unknown";
      consentRef.current = value; setConsent(value);
    } catch {
      consentRef.current = "unknown"; setConsent("unknown"); setConsentError(true);
    } finally { setConsentLoading(false); }
  }, []);
  useEffect(() => { void retryConsent(); }, [retryConsent]);

  const persistConsent = async (value: LeaderboardConsent) => {
    await AsyncStorage.setItem(LEADERBOARD_CONSENT_KEY, value);
    if (await AsyncStorage.getItem(LEADERBOARD_CONSENT_KEY) !== value) throw new Error("Curfy couldn't save your leaderboard preference. Please retry.");
    consentRef.current = value; setConsent(value); setConsentError(false);
  };
  const queueProfileWork = (work: () => Promise<void>): Promise<void> => {
    const next = profileWork.current.then(async () => {
      if (!authReady.current || consentRef.current !== "joined" || deletionInProgress.current) return;
      await work();
    });
    profileWork.current = next.catch(() => {});
    return next;
  };

  useEffect(() => {
    // No project configured yet (see lib/supabase.ts) — skip touching the
    // placeholder client entirely rather than issuing real calls against
    // https://placeholder.supabase.co. Auth just stays permanently
    // "loaded, signed out" until real keys land in .env.
    if (!isSupabaseConfigured) {
      authReady.current = true;
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
      readDeletionIntent(AsyncStorage),
    ])
      .then(([{ data, error }, confirmedId, pending]) => {
        if (!active) return;
        if (error) {
          // An unsuccessful session read is not evidence that a remote
          // account doesn't exist. Do not permit a local-only delete.
          authRecoveryFailed.current = true;
          deletionInProgress.current = true;
          setIsDeletingAccount(true);
          console.warn("[Curfy] Could not restore leaderboard session", error);
        }
        if (pending) {
          pendingDeletion.current = true;
          deletionInProgress.current = true;
          setIsDeletingAccount(true);
        }
        if (confirmedId) {
          remoteDeletedUserId.current = confirmedId;
          deletionInProgress.current = true;
          setIsDeletingAccount(true);
        }
        sessionRef.current = data.session ?? null;
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
        if (active) { authReady.current = true; setIsAuthLoading(false); }
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (active) { sessionRef.current = newSession; setSession(newSession); }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const ensureAnonymousProfile = (displayName: string) => queueProfileWork(async () => {
    if (!isSupabaseConfigured || deletionInProgress.current) return;
    if (sessionRef.current || ensuringProfile.current) return;
    ensuringProfile.current = true;
    try {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error || !data.session) throw new Error("Curfy couldn't connect your leaderboard profile. Please retry.");
      sessionRef.current = data.session; setSession(data.session);
      authRecoveryFailed.current = false;
      if (consentRef.current !== "joined" || deletionInProgress.current) return;
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
  });

  const signOutRemote = async () => {
    if (!isSupabaseConfigured) return;
    lastSynced.current = null;
    await supabase.auth.signOut();
  };

  const persistDeletionReceipt = async (userId: string) => {
    await AsyncStorage.setItem(REMOTE_DELETION_CONFIRMED_KEY, userId);
    if (await AsyncStorage.getItem(REMOTE_DELETION_CONFIRMED_KEY) !== userId) {
      throw new Error("Curfy couldn't confirm its deletion receipt. Retry Delete Account.");
    }
  };

  const deleteRemoteAccount = async () => {
    if (!isSupabaseConfigured) return;
    await profileWork.current;
    const session = sessionRef.current;
    // A persisted, server-confirmed receipt is stronger evidence than a
    // failed session read. The deleted user cannot authenticate again, so
    // retries must NOT depend on refreshing the invalidated Supabase JWT.
    const confirmedId = remoteDeletedUserId.current;
    if (confirmedId) {
      if (session?.user && session.user.id !== confirmedId) {
        throw new Error("A different Curfy account is active. Cannot reuse a prior deletion receipt.");
      }
      // Reassert the receipt before continuing. A previous attempt may have
      // confirmed the server deletion but failed its first disk write.
      await persistDeletionReceipt(confirmedId);
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) {
        throw new Error("Curfy couldn't clear its local cloud session. Retry Delete Account.");
      }
      lastSynced.current = null;
      return;
    }
    // A pending proof can recover without a normal session. Storage/auth
    // restoration failures still fail closed unless the journal is readable.
    const pending = await readDeletionIntent(AsyncStorage).catch(() => {
      throw new Error("Curfy couldn't verify your online account or a previous deletion. Reopen Curfy when local storage is available.");
    });
    if (authRecoveryFailed.current && !pending) {
      throw new Error("Curfy couldn't verify your online account or a previous deletion. Reopen Curfy when local storage is available.");
    }
    if (!session?.user && !pending) return;
    if (deletionCallPending.current) throw new Error("Curfy is already processing an account deletion.");
    deletionCallPending.current = true;
    deletionInProgress.current = true;
    setIsDeletingAccount(true);
    try {
      await deletionTransaction.current.run(session?.user.id ?? null, async userId => {
        remoteDeletedUserId.current = userId;
        await persistDeletionReceipt(userId);
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (error) throw new Error("Curfy couldn't clear its local cloud session. Retry Delete Account.");
        lastSynced.current = null;
      });
    } catch (error) {
      if (remoteDeletedUserId.current) throw error;
      throw new Error("Curfy couldn't delete your online account. Check your connection and retry.");
    } finally {
      deletionCallPending.current = false;
      // Even a failed request may already have deleted the server identity.
      // Keep uploads paused whenever a journal exists or cannot be read.
      try { pendingDeletion.current = !!await readDeletionIntent(AsyncStorage); }
      catch { pendingDeletion.current = true; }
      if (!pendingDeletion.current && remoteDeletedUserId.current === null) {
        deletionInProgress.current = false;
        setIsDeletingAccount(false);
      }
    }
  };

  const finishAccountDeletion = async () => {
    // Persist a non-uploading, retryable consent state BEFORE retiring the
    // receipt. If the final declined write fails (or the process exits), a
    // restart still shows Finish leaving and cannot recreate a public identity.
    // Delete Everything calls this after local cleanup; Leave calls it after
    // cloud-only removal, preserving native protection and local history.
    await persistConsent("leaving");
    // Retire the pending proof while the stronger confirmed receipt remains.
    if (remoteDeletedUserId.current) {
      await deletionTransaction.current.finish(remoteDeletedUserId.current);
    } else if (await readDeletionIntent(AsyncStorage)) {
      throw new Error("Online account deletion is not confirmed. Please retry.");
    }
    pendingDeletion.current = false;
    await AsyncStorage.removeItem(REMOTE_DELETION_CONFIRMED_KEY);
    if (await AsyncStorage.getItem(REMOTE_DELETION_CONFIRMED_KEY) != null) {
      throw new Error("Curfy could not clear the confirmed deletion receipt.");
    }
    await persistConsent("declined");
    authRecoveryFailed.current = false;
    remoteDeletedUserId.current = null;
    deletionInProgress.current = false;
    setIsDeletingAccount(false);
  };

  const setLeaderboardParticipation = async (join: boolean) => {
    if (isConsentLoading || consentChangePending.current) throw new Error("A leaderboard preference is already being checked.");
    if (join && (!isSupabaseConfigured || consentRef.current === "leaving" || deletionInProgress.current)) {
      throw new Error("Finish removing the previous cloud profile before joining again, or retry when the leaderboard is available.");
    }
    consentChangePending.current = true;
    try {
      if (join) { await persistConsent("joined"); return; }
      // Stop uploads immediately, including work queued before the user's tap.
      consentRef.current = "leaving"; setConsent("leaving");
      await persistConsent("leaving");
      await deleteRemoteAccount();
      await finishAccountDeletion();
      // Only cloud identity is removed: no native protection or journal wipe.
    } finally { consentChangePending.current = false; }
  };

  const syncProfile = (
    bedtime: string,
    currentStreak: number,
    longestStreak: number,
    displayName: string
  ) => queueProfileWork(async () => {
    if (!isSupabaseConfigured || deletionInProgress.current || consentRef.current !== "joined") return;
    const session = sessionRef.current;
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
  });

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
        leaderboardConsent, isConsentLoading, consentError, retryConsent, setLeaderboardParticipation,
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

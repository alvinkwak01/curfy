import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import {
  BlockModeId,
  activeExceptionExpiresAt,
  getScreenTimeAccessStatus,
  grantBedtimeException,
  reconcileBedtimeException,
  reconcileProtectionWindow,
  refreshBedtimeShieldAppearance,
  stopBedtimeBlocking,
} from "@/lib/screenTime";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, Platform } from "react-native";
import { bedtimeNightKey, isBedtimeWindowActive } from "@/lib/bedtimeWindow";
import { ProtectionRoutine, parseProtectionRoutine, routineIsEveningBased } from "@/lib/protectionRoutine";
import { countLoggedNightStreak, shouldStartNightLog } from "@/lib/nightHistory";
import { mayRestartSetup } from "@/lib/restartProtectionPolicy";
import { useAuth } from "./AuthContext";
import { useJournal } from "./JournalContext";

const BEDTIME_KEY = "@dusk/bedtime";
const WAKE_TIME_KEY = "@dusk/wake_time";
const PROTECTION_ROUTINE_KEY = "@curfy/protection_routine";
const BLOCK_MODE_KEY = "@dusk/block_mode";
const USERNAME_KEY = "@dusk/username";
const ONBOARDING_KEY = "@dusk/onboarding_complete";
const SLEEP_LOG_KEY = "@dusk/sleep_log";
const COOLDOWN_KEY = "@dusk/unlock_cooldown";
const TODAY_UNLOCKS_KEY = "@dusk/today_unlocks";
const MORNING_SENT_KEY = "@dusk/morning_sent_date";
const MOTIVATION_KEY = "@dusk/motivation";
const LONGEST_STREAK_KEY = "@dusk/longest_streak";
// Dev-only escape hatch — see the `__DEV__` gate on checkLock() below.
// Persisted so it survives Expo Go reloads while you're testing, but it
// can never take effect in a real production build regardless of what's
// sitting in storage, since every read of it is also gated on `__DEV__`.
const DEV_SKIP_LOCK_KEY = "@dusk/dev_skip_lock";

// All keys wiped by deleteAccount(). Keep this in sync when adding new
// persisted fields, or Delete Account will silently leave data behind.
const ALL_STORAGE_KEYS = [
  BEDTIME_KEY,
  WAKE_TIME_KEY,
  PROTECTION_ROUTINE_KEY,
  BLOCK_MODE_KEY,
  USERNAME_KEY,
  ONBOARDING_KEY,
  SLEEP_LOG_KEY,
  COOLDOWN_KEY,
  TODAY_UNLOCKS_KEY,
  MORNING_SENT_KEY,
  MOTIVATION_KEY,
  LONGEST_STREAK_KEY,
  DEV_SKIP_LOCK_KEY,
];

export interface SleepEntry {
  id: string;
  date: string;
  targetBedtime: string;
  unlockAttempts: number;
  onTime: boolean;
  createdAt: number;
}

interface SleepContextType {
  bedtime: string;
  setBedtime: (time: string, routine?: ProtectionRoutine) => Promise<void>;
  // Legacy storage names: bedtime = protection start, wakeTime = apps
  // available again. They are NOT measurements of when someone sleeps.
  wakeTime: string;
  setWakeTime: (time: string) => Promise<void>;
  protectionRoutine: ProtectionRoutine;
  setProtectionRoutine: (routine: ProtectionRoutine) => Promise<void>;
  // Which preset ("social" / "most" / "custom") the user picked during
  // onboarding — null until they've been through that step at least once.
  // The actual selected-apps token lives natively (see lib/screenTime.ts's
  // selectionIdForMode), this is just which preset id to reference. Kept
  // as a plain string here (not the BlockModeId type) so SleepContext
  // doesn't need to import from lib/screenTime — it's opaque data to this
  // context, only meaningful to the Screen Time integration that reads it.
  blockMode: string | null;
  setBlockMode: (mode: string) => Promise<void>;
  userName: string;
  setUserName: (name: string) => Promise<void>;
  motivation: string;
  setMotivation: (note: string) => Promise<void>;
  isOnboardingComplete: boolean;
  completeOnboarding: () => Promise<void>;
  sleepLog: SleepEntry[];
  isLocked: boolean;
  lockScreen: () => void;
  unlockScreen: () => Promise<void>;
  todayUnlocks: number;
  streak: number;
  // Highest streak ever reached, independent of the current one — this is
  // what backs the "All-Time Best" leaderboard sort. Never decreases,
  // including when the current streak breaks.
  longestStreak: number;
  isLoading: boolean;
  // No real account system yet (see CONTEXT.md — local-only, no backend).
  // signOut() re-triggers onboarding but keeps sleep history intact —
  // it's the closest local equivalent until real sign-in exists.
  signOut: () => Promise<void>;
  // deleteAccount() wipes every persisted field back to a blank install.
  deleteAccount: () => Promise<void>;
  // Dev-build-only toggle (Settings screen only renders the switch when
  // `__DEV__`) to stop the real bedtime window from auto-locking the app
  // while testing other screens. Has zero effect in a production build —
  // checkLock() only honors it when `__DEV__` is also true at runtime, not
  // just at render time. Use "Preview Lock Screen" in Settings to still
  // test the lock UI itself on demand while this is on.
  devSkipLock: boolean;
  setDevSkipLock: (skip: boolean) => Promise<void>;
  // Dev-only escape hatch for the deadlock devSkipLock alone can't solve:
  // the toggle above lives in Settings, but Settings is unreachable while
  // the real LockScreen modal is covering the whole app — there was no way
  // to get to the switch in the first place. This dismisses the current
  // lock immediately AND turns devSkipLock on so it doesn't just re-lock
  // 30 seconds later, without recording a real escape/unlock the way
  // completing the 120-second hold does (todayUnlocks/sleepLog untouched).
  // Rendered only on the LockScreen itself when `__DEV__`.
  devDismissLock: () => void;
}

const SleepContext = createContext<SleepContextType | null>(null);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function sendMorningSummary(
  name: string,
  escapes: number,
  streak: number
) {
  if (Platform.OS === "web") return;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;

    const todayDate = new Date();
    const today = `${todayDate.getFullYear()}-${String(todayDate.getMonth()+1).padStart(2, "0")}-${String(todayDate.getDate()).padStart(2, "0")}`;
    const alreadySent = await AsyncStorage.getItem(MORNING_SENT_KEY);
    if (alreadySent === today) return;
    await AsyncStorage.setItem(MORNING_SENT_KEY, today);

    // This is only an optional reminder, never a measurement of sleep or
    // proof that Screen Time blocked every app without interruption.
    const title = "Your Curfy window ended";
    const body = escapes === 0
      ? "Your selected-app boundary has ended. Open Curfy to review your routine."
      : `Your boundary ended. You requested ${escapes} temporary ${escapes === 1 ? "exception" : "exceptions"} in Curfy.`;

    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: null,
    });
  } catch (_) {}
}

async function scheduleBedtimeNotifications(bedtime: string) {
  if (Platform.OS === "web") return;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;

    await Notifications.cancelAllScheduledNotificationsAsync();

    const [hours, minutes] = bedtime.split(":").map(Number);
    const total = hours * 60 + minutes;

    const ten = total - 10;
    const tenH = Math.floor(((ten % 1440) + 1440) % 1440 / 60);
    const tenM = (((ten % 1440) + 1440) % 1440) % 60;

    const two = total - 2;
    const twoH = Math.floor(((two % 1440) + 1440) % 1440 / 60);
    const twoM = (((two % 1440) + 1440) % 1440) % 60;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Curfy starts in 10 minutes",
        body: "Your selected app will be shielded soon.",
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: tenH,
        minute: tenM,
      },
    });

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Curfy starts in two minutes",
        body: "Your selected app will be shielded at the scheduled time.",
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: twoH,
        minute: twoM,
      },
    });
  } catch (_) {}
}

// This counts recorded protection nights, never nights of measured sleep.
function computeStreak(log: SleepEntry[]): number {
  return countLoggedNightStreak(log);
}

// Collapses duplicate same-date entries into one. These shouldn't get
// created going forward (see the guard in checkLock() below), but this
// cleans up any that already exist on a device from before that fix —
// keeps the earliest createdAt (so date/streak math doesn't shift) and
// the worst unlockAttempts count seen for that date (so a real escape
// recorded on one duplicate isn't lost).
function dedupeSleepLog(log: SleepEntry[]): SleepEntry[] {
  const byDate = new Map<string, SleepEntry>();
  for (const entry of log) {
    const existing = byDate.get(entry.date);
    if (!existing) {
      byDate.set(entry.date, entry);
      continue;
    }
    const unlockAttempts = Math.max(existing.unlockAttempts, entry.unlockAttempts);
    byDate.set(entry.date, {
      ...existing,
      unlockAttempts,
      onTime: unlockAttempts === 0,
      createdAt: Math.min(existing.createdAt, entry.createdAt),
    });
  }
  return Array.from(byDate.values()).sort((a, b) => b.createdAt - a.createdAt);
}

/** iOS may defer native start/end callbacks; reopen Curfy to repair
 * missing starts and stale restrictions without invalidating an active escape.
 */
function reconcileNativeProtection(bedtime: string, wakeTime: string, blockMode: string | null): void {
  try {
    reconcileBedtimeException(bedtime, wakeTime);
  } catch (error) {
    console.warn("[Curfy] Exception recovery needs retry", error);
  }
  if (blockMode === "social" || blockMode === "most" || blockMode === "custom") {
    try {
      reconcileProtectionWindow(bedtime, wakeTime, blockMode);
    } catch (error) {
      console.warn("[Curfy] Protection-window recovery needs retry", error);
    }
  }
}

export function SleepProvider({ children }: { children: React.ReactNode }) {
  const [bedtime, setBedtimeState] = useState("23:00");
  const [wakeTime, setWakeTimeState] = useState("06:00");
  const [protectionRoutine, setProtectionRoutineState] = useState<ProtectionRoutine>("evening");
  const [blockMode, setBlockModeState] = useState<string | null>(null);
  const [userName, setUserNameState] = useState("Sleeper");
  const [motivation, setMotivationState] = useState("");
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false);
  const [sleepLog, setSleepLog] = useState<SleepEntry[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [todayUnlocks, setTodayUnlocks] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [devSkipLock, setDevSkipLockState] = useState(false);
  const cooldownUntil = useRef<number>(0);
  const lockedToday = useRef(false);
  const sleepLogRef = useRef<SleepEntry[]>([]);
  const todayUnlocksRef = useRef(0);
  const userNameRef = useRef("Sleeper");
  // AuthProvider must be an ancestor of SleepProvider (see app/_layout.tsx)
  // so signOut()/deleteAccount() here can also touch the real Supabase
  // session/account, not just reset local state.
  const { deleteRemoteAccount } = useAuth();
  // JournalProvider must also be an ancestor (see app/_layout.tsx) so
  // deleteAccount() below can wipe diary entries too — they're stored
  // separately from ALL_STORAGE_KEYS since they're a different context,
  // but a full account delete still needs to take them with it.
  const { clearAll: clearJournal } = useJournal();

  useEffect(() => {
    (async () => {
      const [bt, wt, bm, un, oc, sl, cd, tu, mo, ls, dsl, pr] = await Promise.all([
        AsyncStorage.getItem(BEDTIME_KEY),
        AsyncStorage.getItem(WAKE_TIME_KEY),
        AsyncStorage.getItem(BLOCK_MODE_KEY),
        AsyncStorage.getItem(USERNAME_KEY),
        AsyncStorage.getItem(ONBOARDING_KEY),
        AsyncStorage.getItem(SLEEP_LOG_KEY),
        AsyncStorage.getItem(COOLDOWN_KEY),
        AsyncStorage.getItem(TODAY_UNLOCKS_KEY),
        AsyncStorage.getItem(MOTIVATION_KEY),
        AsyncStorage.getItem(LONGEST_STREAK_KEY),
        AsyncStorage.getItem(DEV_SKIP_LOCK_KEY),
        AsyncStorage.getItem(PROTECTION_ROUTINE_KEY),
      ]);
      if (bt) setBedtimeState(bt);
      if (wt) setWakeTimeState(wt);
      setProtectionRoutineState(parseProtectionRoutine(pr));
      if (bm) setBlockModeState(bm);
      if (un) setUserNameState(un);
      if (mo) setMotivationState(mo);
      if (oc === "true") setIsOnboardingComplete(true);
      if (sl) {
        try {
          const parsed: SleepEntry[] = JSON.parse(sl);
          const deduped = dedupeSleepLog(parsed);
          setSleepLog(deduped);
          // Self-heal: if this load found and merged duplicates, persist
          // the cleaned version immediately so the corrupted data doesn't
          // keep coming back on every future load.
          if (deduped.length !== parsed.length) {
            AsyncStorage.setItem(SLEEP_LOG_KEY, JSON.stringify(deduped));
          }
        } catch (_) {}
      }
      if (cd) cooldownUntil.current = parseInt(cd, 10);
      if (tu) {
        try {
          const data = JSON.parse(tu);
          if (data.date === bedtimeNightKey(new Date(), bt || bedtime, wt || wakeTime)) {
            setTodayUnlocks(data.count);
            lockedToday.current = data.lockedToday ?? false;
          }
        } catch (_) {}
      }
      if (ls) setLongestStreak(parseInt(ls, 10) || 0);
      if (__DEV__ && dsl === "true") setDevSkipLockState(true);
      setIsLoading(false);
    })();
  }, []);

  useEffect(() => { sleepLogRef.current = sleepLog; }, [sleepLog]);
  useEffect(() => { todayUnlocksRef.current = todayUnlocks; }, [todayUnlocks]);
  useEffect(() => { userNameRef.current = userName; }, [userName]);

  const checkLock = useCallback(() => {
    if (!isOnboardingComplete) return;
    // Dev-only escape hatch so the real bedtime window doesn't lock you
    // out of testing other screens. `__DEV__` is compiled to `false` in
    // every production/release bundle, so this branch is dead code in the
    // real shipped app regardless of what's in storage — it can't become
    // a real-user cheat toggle. Preview Lock Screen (Settings) still works
    // normally for testing the lock UI itself while this is on.
    if (__DEV__ && devSkipLock) return;
    // The local record is independent of a 15-minute Screen Time
    // exception. The former cooldown gate skipped night logging entirely.
    const inWindow = isBedtimeWindowActive(new Date(), bedtime, wakeTime);
    // The native Screen Time shield protects selected apps. Never auto-lock
    // Curfy itself: users must be able to open Settings and manage protection.
    // Keep the daily log independent of the optional hold-screen preview.
    if (inWindow) {
      const today = bedtimeNightKey(new Date(), bedtime, wakeTime);
      // Use the local bedtime night KEY, not yesterday's boolean. If Curfy
      // stays backgrounded all day, the morning callback may never reset
      // lockedToday; today's log must still be created on return.
      if (shouldStartNightLog(sleepLogRef.current, today)) {
        lockedToday.current = true;
        // New local bedtime night: never carry yesterday's unlock count
        // forward into a brand-new evening.
        todayUnlocksRef.current = 0;
        setTodayUnlocks(0);
        AsyncStorage.setItem(TODAY_UNLOCKS_KEY, JSON.stringify({
          date: today, count: 0, lockedToday: true,
        }));
        const entry: SleepEntry = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 6),
          date: today,
          targetBedtime: bedtime,
          unlockAttempts: 0,
          onTime: true,
          createdAt: Date.now(),
        };
        // Update the ref synchronously so two close calls to checkLock
        // cannot both create an entry before React flushes state.
        const updated = [entry, ...sleepLogRef.current];
        sleepLogRef.current = updated;
        setSleepLog(updated);
        void AsyncStorage.setItem(SLEEP_LOG_KEY, JSON.stringify(updated));
      } else {
        lockedToday.current = true;
      }
    } else if (!inWindow && lockedToday.current) {
      lockedToday.current = false;
      const currentLog = sleepLogRef.current;
      const escapes = todayUnlocksRef.current;
      const streak = computeStreak(currentLog);
      sendMorningSummary(userNameRef.current, escapes, streak);
    }
  }, [bedtime, wakeTime, isOnboardingComplete, devSkipLock]);

  useEffect(() => {
    checkLock();
    const interval = setInterval(checkLock, 30000);
    return () => clearInterval(interval);
  }, [checkLock]);

  // DeviceActivity callbacks can be deferred until the user next uses
  // the device. Reconcile missed exception expiry whenever Curfy reopens.
  useEffect(() => {
    if (isLoading || !isOnboardingComplete) return;
    try {
      // Updating an installed preview does not automatically replace native
      // shield actions stored in the shared app-group UserDefaults.
      refreshBedtimeShieldAppearance();
    } catch (error) {
      console.warn("[Curfy] Could not refresh native shield appearance", error);
    }
    reconcileNativeProtection(bedtime, wakeTime, blockMode);
  }, [isLoading, isOnboardingComplete, bedtime, wakeTime, blockMode]);

  // Foreground-only safety net. The real re-shield is in iOS's native
  // extension, so this interval is not required for a closed app to work.
  useEffect(() => {
    if (isLoading || !isOnboardingComplete) return;
    const id = setInterval(() => {
      if (AppState.currentState !== "active") return;
      reconcileNativeProtection(bedtime, wakeTime, blockMode);
    }, 30000);
    return () => clearInterval(id);
  }, [isLoading, isOnboardingComplete, bedtime, wakeTime, blockMode]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        checkLock();
        if (isOnboardingComplete) {
          reconcileNativeProtection(bedtime, wakeTime, blockMode);
        }
      }
    });
    return () => sub.remove();
  }, [checkLock, isOnboardingComplete, bedtime, wakeTime, blockMode]);

  const setBedtime = async (time: string, routine = protectionRoutine) => {
    await AsyncStorage.setItem(BEDTIME_KEY, time);
    setBedtimeState(time);
    if (routineIsEveningBased(routine)) {
      await scheduleBedtimeNotifications(time);
    } else if (Platform.OS !== "web") {
      // A morning-only routine must not trigger 05:50 AM bedtime alerts
      // left over from a previous evening routine. A notification-service
      // failure must not make an otherwise valid native schedule look unsaved.
      try {
        await Notifications.cancelAllScheduledNotificationsAsync();
      } catch (error) {
        console.warn("[Curfy] Couldn't clear old evening reminders", error);
      }
    }
  };

  const setWakeTime = async (time: string) => {
    setWakeTimeState(time);
    await AsyncStorage.setItem(WAKE_TIME_KEY, time);
  };

  const setProtectionRoutine = async (routine: ProtectionRoutine) => {
    await AsyncStorage.setItem(PROTECTION_ROUTINE_KEY, routine);
    setProtectionRoutineState(routine);
  };

  const setBlockMode = async (mode: string) => {
    setBlockModeState(mode);
    await AsyncStorage.setItem(BLOCK_MODE_KEY, mode);
  };

  const setUserName = async (name: string) => {
    setUserNameState(name);
    await AsyncStorage.setItem(USERNAME_KEY, name);
  };

  const setMotivation = async (note: string) => {
    setMotivationState(note);
    await AsyncStorage.setItem(MOTIVATION_KEY, note);
  };

  const completeOnboarding = async () => {
    // Onboarding already awaited setBedtime(userChosenTime), which scheduled
    // reminders. Repeating that call here uses this render's stale bedtime
    // (often the default) and silently replaces the user's chosen schedule.
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    setIsOnboardingComplete(true);
  };

  const setDevSkipLock = async (skip: boolean) => {
    setDevSkipLockState(skip);
    await AsyncStorage.setItem(DEV_SKIP_LOCK_KEY, skip ? "true" : "false");
  };

  const devDismissLock = () => {
    if (!__DEV__) return;
    setDevSkipLockState(true);
    AsyncStorage.setItem(DEV_SKIP_LOCK_KEY, "true");
    setIsLocked(false);
  };

  const lockScreen = () => {
    setIsLocked(true);
  };

  const unlockScreen = useCallback(async () => {
    if (blockMode !== "social" && blockMode !== "most" && blockMode !== "custom") {
      throw new Error("Choose a protected app in Settings first.");
    }
    // Grant the actual OS-level exception BEFORE incrementing the escape
    // counter or dismissing the hold UI. Failure must stay visible.
    await grantBedtimeException({
      bedtime,
      wakeTime,
      mode: blockMode as BlockModeId,
    });
    const newCount = todayUnlocks + 1;
    setTodayUnlocks(newCount);
    setIsLocked(false);
    cooldownUntil.current = Date.now() + 15 * 60 * 1000;
    AsyncStorage.setItem(
      COOLDOWN_KEY,
      cooldownUntil.current.toString()
    );
    AsyncStorage.setItem(
      TODAY_UNLOCKS_KEY,
      JSON.stringify({
        date: bedtimeNightKey(new Date(), bedtime, wakeTime),
        count: newCount,
        lockedToday: true,
      })
    );
    setSleepLog((prev) => {
      const updated = prev.map((entry, idx) =>
        idx === 0 && entry.date === bedtimeNightKey(new Date(), bedtime, wakeTime)
          ? { ...entry, unlockAttempts: newCount, onTime: false }
          : entry
      );
      AsyncStorage.setItem(SLEEP_LOG_KEY, JSON.stringify(updated));
      return updated;
    });
  }, [todayUnlocks, bedtime, wakeTime, blockMode]);

  // Sends the user back through onboarding, but deliberately does NOT
  // touch bedtime, name, motivation, or the sleep log — that's local
  // history, not account data, and it survives a sign-out the same way it
  // would on a device that's never been signed in at all.
  //
  // Also deliberately does NOT end the remote Supabase session anymore.
  // There's no email/password now (see AuthContext.ensureAnonymousProfile)
  // — an anonymous session can't be signed back into, so ending it here
  // would just orphan the current leaderboard row permanently, and then
  // re-completing onboarding would silently create a brand new anonymous
  // profile, leaving an abandoned duplicate entry on the public
  // leaderboard every time someone uses this button. Leaving the session
  // alone means redoing onboarding just keeps updating the same row.
  const signOut = async () => {
    // Prevent a one-tap bypass: restarting setup would stop the native
    // schedule. During active protection it requires the same 120-second
    // exception as any other temporary access. Permission-denied users and
    // anyone outside bedtime can still reset/recover their setup.
    const canRestart = mayRestartSetup({
      insideBedtime: isBedtimeWindowActive(new Date(), bedtime, wakeTime),
      screenTimeAuthorized: getScreenTimeAccessStatus() === "authorized",
      hasSelectedMode: blockMode === "social" || blockMode === "most" || blockMode === "custom",
      activeException: activeExceptionExpiresAt() !== null,
    });
    if (!canRestart) {
      throw new Error("During bedtime, complete the 120-second hold from Curfy Home before restarting setup, or wait until your morning end time.");
    }
    stopBedtimeBlocking();
    setIsLocked(false);
    lockedToday.current = false;
    setIsOnboardingComplete(false);
    await AsyncStorage.setItem(ONBOARDING_KEY, "false");
    if (Platform.OS !== "web") {
      try {
        await Notifications.cancelAllScheduledNotificationsAsync();
      } catch (_) {}
    }
  };

  // Full wipe: local storage plus the real remote auth user (via the
  // delete-account Edge Function — see AuthContext.deleteRemoteAccount).
  // The remote call is best-effort and never blocks the local wipe below,
  // so the device always ends up clean even if that call fails (e.g.
  // offline) — see the App Store 5.1.1(v) note in CONTEXT.md for why the
  // remote half exists at all.
  const deleteAccount = async () => {
    // Deleting an automatically-created Supabase account is not optional.
    // If the server is offline or rejects deletion, keep the local session
    // and Settings so the user can retry. Never report a false success.
    await deleteRemoteAccount();
    setIsLocked(false);
    lockedToday.current = false;
    cooldownUntil.current = 0;
    setBedtimeState("23:00");
    setWakeTimeState("06:00");
    setProtectionRoutineState("evening");
    setBlockModeState(null);
    setUserNameState("Sleeper");
    setMotivationState("");
    setIsOnboardingComplete(false);
    setSleepLog([]);
    setTodayUnlocks(0);
    setLongestStreak(0);
    setDevSkipLockState(false);
    await AsyncStorage.multiRemove(ALL_STORAGE_KEYS);
    try {
      // Stops the native schedule too — otherwise the block keeps running
      // forever on-device, orphaned, after every trace of it is gone from
      // the app itself. Platform-guarded implicitly: this is a no-op shape
      // on a device where the module was never authorized/configured.
      stopBedtimeBlocking();
    } catch (_) {}
    try {
      await clearJournal();
    } catch (_) {}
    if (Platform.OS !== "web") {
      try {
        await Notifications.cancelAllScheduledNotificationsAsync();
      } catch (_) {}
    }
  };

  const streak = computeStreak(sleepLog);

  // Longest-ever streak never decreases, even when the current one
  // breaks — this is what the "All-Time Best" leaderboard sorts on.
  useEffect(() => {
    if (streak > longestStreak) {
      setLongestStreak(streak);
      AsyncStorage.setItem(LONGEST_STREAK_KEY, streak.toString());
    }
  }, [streak, longestStreak]);

  return (
    <SleepContext.Provider
      value={{
        bedtime,
        setBedtime,
        wakeTime,
        setWakeTime,
        protectionRoutine,
        setProtectionRoutine,
        blockMode,
        setBlockMode,
        userName,
        setUserName,
        motivation,
        setMotivation,
        isOnboardingComplete,
        completeOnboarding,
        sleepLog,
        isLocked,
        lockScreen,
        unlockScreen,
        todayUnlocks,
        streak,
        longestStreak,
        isLoading,
        signOut,
        deleteAccount,
        devSkipLock,
        setDevSkipLock,
        devDismissLock,
      }}
    >
      {children}
    </SleepContext.Provider>
  );
}

export function useSleep(): SleepContextType {
  const ctx = useContext(SleepContext);
  if (!ctx) throw new Error("useSleep must be used inside SleepProvider");
  return ctx;
}

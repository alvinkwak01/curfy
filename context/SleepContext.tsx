import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { stopBedtimeBlocking } from "@/lib/screenTime";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, Platform } from "react-native";
import { useAuth } from "./AuthContext";
import { useJournal } from "./JournalContext";

const BEDTIME_KEY = "@dusk/bedtime";
const WAKE_TIME_KEY = "@dusk/wake_time";
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
  setBedtime: (time: string) => Promise<void>;
  // Collected during onboarding alongside bedtime, mainly to compute the
  // "here's how much sleep you're losing" reveal there. Also generally
  // useful (e.g. a future "you got Xh of sleep last night" summary)
  // without needing anything from the Screen Time integration.
  wakeTime: string;
  setWakeTime: (time: string) => Promise<void>;
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
  unlockScreen: () => void;
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

function getMinutesFromMidnight(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function isInBedtimeWindow(bedtime: string): boolean {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const bedtimeMinutes = getMinutesFromMidnight(bedtime);
  const wakeMinutes = 6 * 60;

  if (bedtimeMinutes >= wakeMinutes) {
    return currentMinutes >= bedtimeMinutes || currentMinutes < wakeMinutes;
  } else {
    return currentMinutes >= bedtimeMinutes && currentMinutes < wakeMinutes;
  }
}

async function sendMorningSummary(
  name: string,
  escapes: number,
  streak: number
) {
  if (Platform.OS === "web") return;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;

    const today = new Date().toISOString().split("T")[0];
    const alreadySent = await AsyncStorage.getItem(MORNING_SENT_KEY);
    if (alreadySent === today) return;
    await AsyncStorage.setItem(MORNING_SENT_KEY, today);

    let title = "";
    let body = "";

    if (streak >= 30 && escapes === 0) {
      title = `${streak} nights. Legendary.`;
      body = `Flawless night, ${name}. Actually impressive.`;
    } else if (streak >= 7 && escapes === 0) {
      title = "Last night's verdict: Flawless.";
      body = `${streak}-night streak. Not a single escape. Look at you.`;
    } else if (escapes === 0) {
      title = "Clean night.";
      body = streak > 1
        ? `${streak}-night streak and counting, ${name}.`
        : `First clean night, ${name}. That's how it starts.`;
    } else if (escapes === 1) {
      title = "One slip. Still standing.";
      body = streak > 0
        ? `${streak}-night streak survives, ${name}. Barely.`
        : `You escaped once. No streak. Fresh start tonight, ${name}.`;
    } else if (escapes === 2) {
      title = "Twice. Interesting choice.";
      body = streak > 0
        ? `${streak}-night streak lives — barely. We need to talk.`
        : `Two escapes. No streak. That's rough, ${name}.`;
    } else {
      title = `${escapes} escapes. Wow.`;
      body = streak > 0
        ? `${streak}-night streak somehow survives. How, ${name}? How.`
        : `No streak. ${escapes} escapes. Let's regroup, ${name}.`;
    }

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
        title: "Bedtime in 10",
        body: "Wrap it up. You know what's coming.",
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
        title: "Two minutes.",
        body: "Last call. Go to sleep.",
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

function computeStreak(log: SleepEntry[]): number {
  if (log.length === 0) return 0;
  const sorted = [...log].sort((a, b) => b.createdAt - a.createdAt);
  let streak = 0;
  let expectedDate = new Date();
  expectedDate.setHours(0, 0, 0, 0);

  for (const entry of sorted) {
    const entryDate = new Date(entry.date);
    entryDate.setHours(0, 0, 0, 0);
    const diff = Math.round(
      (expectedDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diff === 0 || diff === 1) {
      streak++;
      expectedDate = entryDate;
    } else {
      break;
    }
  }
  return streak;
}

function todayDateString(): string {
  return new Date().toISOString().split("T")[0];
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

export function SleepProvider({ children }: { children: React.ReactNode }) {
  const [bedtime, setBedtimeState] = useState("23:00");
  const [wakeTime, setWakeTimeState] = useState("07:00");
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
      const [bt, wt, bm, un, oc, sl, cd, tu, mo, ls, dsl] = await Promise.all([
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
      ]);
      if (bt) setBedtimeState(bt);
      if (wt) setWakeTimeState(wt);
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
          if (data.date === todayDateString()) {
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
    const now = Date.now();
    if (cooldownUntil.current > now) return;

    const inWindow = isInBedtimeWindow(bedtime);
    if (inWindow && !isLocked) {
      setIsLocked(true);
      const today = todayDateString();
      // The persisted log is the real source of truth for "already
      // logged tonight" — lockedToday is just an in-memory fast path.
      // It resets to false on any JS restart (Expo Go reload, force-quit,
      // dev fast-refresh) while still inside the bedtime window, which
      // used to cause a duplicate entry for the same night. Checking the
      // actual log closes that gap regardless of why the flag drifted.
      const alreadyLoggedToday = sleepLogRef.current.some((e) => e.date === today);
      if (!lockedToday.current && !alreadyLoggedToday) {
        lockedToday.current = true;
        const entry: SleepEntry = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 6),
          date: today,
          targetBedtime: bedtime,
          unlockAttempts: 0,
          onTime: true,
          createdAt: Date.now(),
        };
        setSleepLog((prev) => {
          const updated = [entry, ...prev];
          AsyncStorage.setItem(SLEEP_LOG_KEY, JSON.stringify(updated));
          return updated;
        });
      } else {
        lockedToday.current = true;
      }
    } else if (!inWindow && isLocked) {
      setIsLocked(false);
      lockedToday.current = false;
      const currentLog = sleepLogRef.current;
      const escapes = todayUnlocksRef.current;
      const streak = computeStreak(currentLog);
      sendMorningSummary(userNameRef.current, escapes, streak);
    }
  }, [bedtime, isOnboardingComplete, isLocked, devSkipLock]);

  useEffect(() => {
    checkLock();
    const interval = setInterval(checkLock, 30000);
    return () => clearInterval(interval);
  }, [checkLock]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") checkLock();
    });
    return () => sub.remove();
  }, [checkLock]);

  const setBedtime = async (time: string) => {
    setBedtimeState(time);
    await AsyncStorage.setItem(BEDTIME_KEY, time);
    await scheduleBedtimeNotifications(time);
  };

  const setWakeTime = async (time: string) => {
    setWakeTimeState(time);
    await AsyncStorage.setItem(WAKE_TIME_KEY, time);
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
    setIsOnboardingComplete(true);
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    await scheduleBedtimeNotifications(bedtime);
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

  const unlockScreen = useCallback(() => {
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
        date: todayDateString(),
        count: newCount,
        lockedToday: true,
      })
    );
    setSleepLog((prev) => {
      const updated = prev.map((entry, idx) =>
        idx === 0 && entry.date === todayDateString()
          ? { ...entry, unlockAttempts: newCount, onTime: false }
          : entry
      );
      AsyncStorage.setItem(SLEEP_LOG_KEY, JSON.stringify(updated));
      return updated;
    });
  }, [todayUnlocks]);

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
    setIsLocked(false);
    lockedToday.current = false;
    cooldownUntil.current = 0;
    setBedtimeState("23:00");
    setWakeTimeState("07:00");
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
    try {
      await deleteRemoteAccount();
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

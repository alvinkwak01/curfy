import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
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

const BEDTIME_KEY = "@dusk/bedtime";
const USERNAME_KEY = "@dusk/username";
const ONBOARDING_KEY = "@dusk/onboarding_complete";
const SLEEP_LOG_KEY = "@dusk/sleep_log";
const COOLDOWN_KEY = "@dusk/unlock_cooldown";
const TODAY_UNLOCKS_KEY = "@dusk/today_unlocks";
const MORNING_SENT_KEY = "@dusk/morning_sent_date";
const MOTIVATION_KEY = "@dusk/motivation";
const LONGEST_STREAK_KEY = "@dusk/longest_streak";

// All keys wiped by deleteAccount(). Keep this in sync when adding new
// persisted fields, or Delete Account will silently leave data behind.
const ALL_STORAGE_KEYS = [
  BEDTIME_KEY,
  USERNAME_KEY,
  ONBOARDING_KEY,
  SLEEP_LOG_KEY,
  COOLDOWN_KEY,
  TODAY_UNLOCKS_KEY,
  MORNING_SENT_KEY,
  MOTIVATION_KEY,
  LONGEST_STREAK_KEY,
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
  const [userName, setUserNameState] = useState("Sleeper");
  const [motivation, setMotivationState] = useState("");
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false);
  const [sleepLog, setSleepLog] = useState<SleepEntry[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [todayUnlocks, setTodayUnlocks] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const cooldownUntil = useRef<number>(0);
  const lockedToday = useRef(false);
  const sleepLogRef = useRef<SleepEntry[]>([]);
  const todayUnlocksRef = useRef(0);
  const userNameRef = useRef("Sleeper");
  // AuthProvider must be an ancestor of SleepProvider (see app/_layout.tsx)
  // so signOut() here can also end the real Supabase session, not just
  // reset the local onboarding flag.
  const { signOutRemote } = useAuth();

  useEffect(() => {
    (async () => {
      const [bt, un, oc, sl, cd, tu, mo, ls] = await Promise.all([
        AsyncStorage.getItem(BEDTIME_KEY),
        AsyncStorage.getItem(USERNAME_KEY),
        AsyncStorage.getItem(ONBOARDING_KEY),
        AsyncStorage.getItem(SLEEP_LOG_KEY),
        AsyncStorage.getItem(COOLDOWN_KEY),
        AsyncStorage.getItem(TODAY_UNLOCKS_KEY),
        AsyncStorage.getItem(MOTIVATION_KEY),
        AsyncStorage.getItem(LONGEST_STREAK_KEY),
      ]);
      if (bt) setBedtimeState(bt);
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
      setIsLoading(false);
    })();
  }, []);

  useEffect(() => { sleepLogRef.current = sleepLog; }, [sleepLog]);
  useEffect(() => { todayUnlocksRef.current = todayUnlocks; }, [todayUnlocks]);
  useEffect(() => { userNameRef.current = userName; }, [userName]);

  const checkLock = useCallback(() => {
    if (!isOnboardingComplete) return;
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
  }, [bedtime, isOnboardingComplete, isLocked]);

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

  // Sends the user back through onboarding and ends the real Supabase
  // session (if any), but deliberately does NOT touch bedtime, name,
  // motivation, or the sleep log — that's local history, not account
  // data, and it survives a sign-out the same way it would on a device
  // that's never been signed in at all.
  const signOut = async () => {
    setIsLocked(false);
    lockedToday.current = false;
    setIsOnboardingComplete(false);
    await AsyncStorage.setItem(ONBOARDING_KEY, "false");
    try {
      await signOutRemote();
    } catch (_) {}
    if (Platform.OS !== "web") {
      try {
        await Notifications.cancelAllScheduledNotificationsAsync();
      } catch (_) {}
    }
  };

  // Full local wipe. Deliberately does NOT delete the remote account or
  // profile row — deleting a Supabase auth user requires an admin-level
  // call that can't run from the client with just the anon key. Logged
  // as a follow-up in CONTEXT.md rather than silently left out.
  const deleteAccount = async () => {
    setIsLocked(false);
    lockedToday.current = false;
    cooldownUntil.current = 0;
    setBedtimeState("23:00");
    setUserNameState("Sleeper");
    setMotivationState("");
    setIsOnboardingComplete(false);
    setSleepLog([]);
    setTodayUnlocks(0);
    setLongestStreak(0);
    await AsyncStorage.multiRemove(ALL_STORAGE_KEYS);
    try {
      await signOutRemote();
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

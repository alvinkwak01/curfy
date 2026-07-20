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

const BEDTIME_KEY = "@dusk/bedtime";
const USERNAME_KEY = "@dusk/username";
const ONBOARDING_KEY = "@dusk/onboarding_complete";
const SLEEP_LOG_KEY = "@dusk/sleep_log";
const COOLDOWN_KEY = "@dusk/unlock_cooldown";
const TODAY_UNLOCKS_KEY = "@dusk/today_unlocks";
const MORNING_SENT_KEY = "@dusk/morning_sent_date";

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
  isOnboardingComplete: boolean;
  completeOnboarding: () => Promise<void>;
  sleepLog: SleepEntry[];
  isLocked: boolean;
  lockScreen: () => void;
  unlockScreen: () => void;
  todayUnlocks: number;
  streak: number;
  isLoading: boolean;
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
      body = `Flawless night, ${name}. There's nothing left to say.`;
    } else if (streak >= 7 && escapes === 0) {
      title = "Last night's verdict: Flawless.";
      body = `${streak}-night streak. Not a single escape. Genuinely impressive.`;
    } else if (escapes === 0) {
      title = "Clean night.";
      body = streak > 1
        ? `${streak}-night streak and counting, ${name}.`
        : `First clean night, ${name}. That's how it starts.`;
    } else if (escapes === 1) {
      title = "One slip. Still standing.";
      body = streak > 0
        ? `${streak}-night streak survives, ${name}. Don't make it a habit.`
        : `You escaped once. No streak. Tonight's a fresh start, ${name}.`;
    } else if (escapes === 2) {
      title = "Twice. Really.";
      body = streak > 0
        ? `${streak}-night streak lives — barely. Someone's watching closer tonight.`
        : `Two escapes. No streak. Disappointing, but not surprising.`;
    } else {
      title = `${escapes} escapes. Chaotic.`;
      body = streak > 0
        ? `${streak}-night streak somehow survives. How, ${name}? How.`
        : `No streak. ${escapes} escapes. A formal complaint has been filed.`;
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
        title: "Bedtime soon",
        body: "Your bedtime is in 10 minutes. Finish up.",
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
        title: "DUSK activates in 2 minutes",
        body: "Wrap it up. Lockdown starts soon.",
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

export function SleepProvider({ children }: { children: React.ReactNode }) {
  const [bedtime, setBedtimeState] = useState("23:00");
  const [userName, setUserNameState] = useState("Sleeper");
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false);
  const [sleepLog, setSleepLog] = useState<SleepEntry[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [todayUnlocks, setTodayUnlocks] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const cooldownUntil = useRef<number>(0);
  const lockedToday = useRef(false);
  const sleepLogRef = useRef<SleepEntry[]>([]);
  const todayUnlocksRef = useRef(0);
  const userNameRef = useRef("Sleeper");

  useEffect(() => {
    (async () => {
      const [bt, un, oc, sl, cd, tu] = await Promise.all([
        AsyncStorage.getItem(BEDTIME_KEY),
        AsyncStorage.getItem(USERNAME_KEY),
        AsyncStorage.getItem(ONBOARDING_KEY),
        AsyncStorage.getItem(SLEEP_LOG_KEY),
        AsyncStorage.getItem(COOLDOWN_KEY),
        AsyncStorage.getItem(TODAY_UNLOCKS_KEY),
      ]);
      if (bt) setBedtimeState(bt);
      if (un) setUserNameState(un);
      if (oc === "true") setIsOnboardingComplete(true);
      if (sl) {
        try {
          setSleepLog(JSON.parse(sl));
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
      if (!lockedToday.current) {
        lockedToday.current = true;
        const entry: SleepEntry = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 6),
          date: todayDateString(),
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

  const streak = computeStreak(sleepLog);

  return (
    <SleepContext.Provider
      value={{
        bedtime,
        setBedtime,
        userName,
        setUserName,
        isOnboardingComplete,
        completeOnboarding,
        sleepLog,
        isLocked,
        lockScreen,
        unlockScreen,
        todayUnlocks,
        streak,
        isLoading,
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

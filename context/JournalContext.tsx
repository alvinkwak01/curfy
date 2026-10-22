import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

const JOURNAL_KEY = "@dusk/journal_entries";
// Whether the "why journal before bed" intro card has been dismissed once.
const JOURNAL_INTRO_SEEN_KEY = "@dusk/journal_intro_seen";

export interface JournalEntry {
  id: string;
  // "YYYY-MM-DD" — the night this thought belongs to, not necessarily
  // the calendar day it was physically typed (lets a 1am entry still
  // count toward "tonight" rather than rolling into tomorrow).
  date: string;
  text: string;
  createdAt: number;
  updatedAt: number;
}

interface JournalContextType {
  entries: JournalEntry[];
  isLoading: boolean;
  addEntry: (date: string, text: string) => Promise<JournalEntry>;
  updateEntry: (id: string, text: string) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  getEntriesForDate: (date: string) => JournalEntry[];
  // Local-only by design (see CONTEXT.md) — diary content never touches
  // Supabase or the public profiles table, unlike streaks/leaderboard
  // data. Wiped alongside everything else on deleteAccount().
  clearAll: () => Promise<void>;
  // Whether the one-time "why journal before bed" intro card has already
  // been shown. The Journal tab also exposes a help icon that reopens the
  // same card on demand regardless of this flag.
  hasSeenIntro: boolean;
  markIntroSeen: () => Promise<void>;
}

const JournalContext = createContext<JournalContextType | null>(null);

export function JournalProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasSeenIntro, setHasSeenIntro] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [raw, introSeen] = await Promise.all([
          AsyncStorage.getItem(JOURNAL_KEY),
          AsyncStorage.getItem(JOURNAL_INTRO_SEEN_KEY),
        ]);
        if (raw) {
          const parsed: JournalEntry[] = JSON.parse(raw);
          setEntries(parsed.sort((a, b) => b.createdAt - a.createdAt));
        }
        if (introSeen === "true") setHasSeenIntro(true);
      } catch (_) {}
      setIsLoading(false);
    })();
  }, []);

  const persist = (next: JournalEntry[]) => {
    const sorted = [...next].sort((a, b) => b.createdAt - a.createdAt);
    setEntries(sorted);
    AsyncStorage.setItem(JOURNAL_KEY, JSON.stringify(sorted));
  };

  const addEntry = async (date: string, text: string) => {
    const entry: JournalEntry = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 6),
      date,
      text,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    persist([entry, ...entries]);
    return entry;
  };

  const updateEntry = async (id: string, text: string) => {
    persist(
      entries.map((e) => (e.id === id ? { ...e, text, updatedAt: Date.now() } : e))
    );
  };

  const deleteEntry = async (id: string) => {
    persist(entries.filter((e) => e.id !== id));
  };

  const getEntriesForDate = (date: string) => entries.filter((e) => e.date === date);

  const clearAll = async () => {
    setEntries([]);
    setHasSeenIntro(false);
    await AsyncStorage.multiRemove([JOURNAL_KEY, JOURNAL_INTRO_SEEN_KEY]);
  };

  const markIntroSeen = async () => {
    setHasSeenIntro(true);
    await AsyncStorage.setItem(JOURNAL_INTRO_SEEN_KEY, "true");
  };

  return (
    <JournalContext.Provider
      value={{
        entries,
        isLoading,
        addEntry,
        updateEntry,
        deleteEntry,
        getEntriesForDate,
        clearAll,
        hasSeenIntro,
        markIntroSeen,
      }}
    >
      {children}
    </JournalContext.Provider>
  );
}

export function useJournal(): JournalContextType {
  const ctx = useContext(JournalContext);
  if (!ctx) throw new Error("useJournal must be used inside JournalProvider");
  return ctx;
}

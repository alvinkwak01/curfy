import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

const JOURNAL_KEY = "@dusk/journal_entries";
// Whether the "why journal before bed" intro card has been dismissed once.
const JOURNAL_INTRO_SEEN_KEY = "@dusk/journal_intro_seen";

export interface JournalEntry {
  id: string;
  date: string;
  text: string;
  createdAt: number;
  updatedAt: number;
}

interface JournalContextType {
  entries: JournalEntry[];
  isLoading: boolean;
  loadError: string | null;
  retryLoad: () => Promise<void>;
  addEntry: (date: string, text: string) => Promise<JournalEntry>;
  updateEntry: (id: string, text: string) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  getEntriesForDate: (date: string) => JournalEntry[];
  // Local-only by design: journal text never syncs to Supabase.
  // Wiped with the rest of Curfy only after Delete Account is confirmed.
  clearAll: () => Promise<void>;
  hasSeenIntro: boolean;
  markIntroSeen: () => Promise<void>;
}

const JournalContext = createContext<JournalContextType | null>(null);

function sortEntries(entries: JournalEntry[]): JournalEntry[] {
  return [...entries].sort((a, b) => b.createdAt - a.createdAt);
}

function parseEntries(raw: string | null): JournalEntry[] {
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every(item => {
    if (!item || typeof item !== "object") return false;
    const entry = item as Partial<JournalEntry>;
    return typeof entry.id === "string" && typeof entry.date === "string" &&
      typeof entry.text === "string" &&
      Number.isFinite(entry.createdAt) && Number.isFinite(entry.updatedAt);
  })) {
    throw new Error("Saved journal entries are unreadable.");
  }
  return sortEntries(parsed as JournalEntry[]);
}

export function JournalProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasSeenIntro, setHasSeenIntro] = useState(false);
  const entriesRef = useRef<JournalEntry[]>([]);
  const loadedRef = useRef(false);
  // Serialize writes so two fast actions cannot overwrite one another or
  // resurrect entries after Delete Account has wiped local history.
  const writeQueue = useRef<Promise<void>>(Promise.resolve());

  const retryLoad = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      await writeQueue.current;
      const [raw, introSeen] = await Promise.all([
        AsyncStorage.getItem(JOURNAL_KEY),
        AsyncStorage.getItem(JOURNAL_INTRO_SEEN_KEY),
      ]);
      const loaded = parseEntries(raw);
      entriesRef.current = loaded;
      setEntries(loaded);
      setHasSeenIntro(introSeen === "true");
      loadedRef.current = true;
    } catch (error) {
      loadedRef.current = false;
      console.warn("[Curfy] Could not load local journal", error);
      // Never show an empty editable journal after failed hydration:
      // doing so would overwrite legitimate saved entries on the next write.
      setLoadError("Curfy couldn't read your journal. Your entries were not erased.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void retryLoad(); }, [retryLoad]);

  const persist = (update: (current: JournalEntry[]) => JournalEntry[]): Promise<void> => {
    const operation = writeQueue.current.then(async () => {
      if (!loadedRef.current) {
        throw new Error("Journal isn't ready. Retry loading it before editing.");
      }
      const next = sortEntries(update(entriesRef.current));
      // Write FIRST: never tell the user a diary change succeeded when
      // AsyncStorage rejected it. The old entries remain intact on error.
      await AsyncStorage.setItem(JOURNAL_KEY, JSON.stringify(next));
      entriesRef.current = next;
      setEntries(next);
    });
    // A failed operation must not poison the next write queue forever.
    writeQueue.current = operation.catch(() => {});
    return operation;
  };

  const addEntry = async (date: string, text: string): Promise<JournalEntry> => {
    const at = Date.now();
    const entry: JournalEntry = {
      id: at.toString() + Math.random().toString(36).substr(2, 6),
      date, text, createdAt: at, updatedAt: at,
    };
    await persist(current => [entry, ...current]);
    return entry;
  };

  const updateEntry = async (id: string, text: string): Promise<void> => {
    await persist(current => current.map(entry =>
      entry.id === id ? { ...entry, text, updatedAt: Date.now() } : entry
    ));
  };

  const deleteEntry = async (id: string): Promise<void> => {
    await persist(current => current.filter(entry => entry.id !== id));
  };

  const getEntriesForDate = (date: string): JournalEntry[] =>
    entries.filter(entry => entry.date === date);

  const clearAll = async (): Promise<void> => {
    const operation = writeQueue.current.then(async () => {
      // Wait for all earlier saves. Clearing first would allow an in-flight
      // save to resurrect data after the user chose Delete Account.
      await AsyncStorage.multiRemove([JOURNAL_KEY, JOURNAL_INTRO_SEEN_KEY]);
      entriesRef.current = [];
      setEntries([]);
      setHasSeenIntro(false);
      loadedRef.current = true;
      setLoadError(null);
    });
    writeQueue.current = operation.catch(() => {});
    await operation;
  };

  const markIntroSeen = async (): Promise<void> => {
    await AsyncStorage.setItem(JOURNAL_INTRO_SEEN_KEY, "true");
    setHasSeenIntro(true);
  };

  return (
    <JournalContext.Provider
      value={{
        entries, isLoading, loadError, retryLoad,
        addEntry, updateEntry, deleteEntry, getEntriesForDate,
        clearAll, hasSeenIntro, markIntroSeen,
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

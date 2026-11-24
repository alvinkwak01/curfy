import AsyncStorage from "@react-native-async-storage/async-storage";
import { beginProtectionOperation } from "./protectionOperation";
import type { ProtectionRoutine } from "./protectionRoutine";
import type { BlockModeId } from "./screenTime";

export const SETTINGS_JOURNAL_KEY = "@curfy/settings_transaction_v1";
export type SavedSettings = {
  bedtime: string; wakeTime: string; blockMode: BlockModeId;
  routine: ProtectionRoutine; userName: string; motivation: string;
};
type Journal = { version: 1; id: string; settings: SavedSettings; protectionChanged: boolean; draftSelectionId?: string };
type Configure = (input: {
  bedtime: string; wakeTime: string; mode: BlockModeId; draftSelectionId?: string;
  settingsTransactionId: string; operationOwner: object; settingsRecovery: boolean;
}) => Promise<void>;
const keys: Record<keyof SavedSettings, string> = {
  bedtime: "@dusk/bedtime", wakeTime: "@dusk/wake_time", blockMode: "@dusk/block_mode",
  routine: "@curfy/protection_routine", userName: "@dusk/username", motivation: "@dusk/motivation",
};
function parse(raw: string): Journal {
  const value = JSON.parse(raw) as Journal;
  const s = value?.settings;
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (value.version !== 1 || typeof value.id !== "string" || !value.id || !s ||
      !clock.test(s.bedtime) || !clock.test(s.wakeTime) ||
      !["custom", "social", "most"].includes(s.blockMode) ||
      !["evening", "morning", "both"].includes(s.routine) ||
      typeof s.userName !== "string" || typeof s.motivation !== "string" ||
      typeof value.protectionChanged !== "boolean" ||
      (value.draftSelectionId !== undefined && value.draftSelectionId !== `curfy-draft-${s.blockMode}`)) {
    throw new Error("Curfy couldn't verify the pending Settings save. Nothing was erased.");
  }
  return value;
}
async function finish(journal: Journal, configure: Configure, operationOwner: object, settingsRecovery: boolean) {
  if (journal.protectionChanged) {
    try {
      await configure({ bedtime: journal.settings.bedtime, wakeTime: journal.settings.wakeTime,
        mode: journal.settings.blockMode, draftSelectionId: journal.draftSelectionId,
        settingsTransactionId: journal.id, operationOwner, settingsRecovery });
    } catch (error) {
      if ((error as { settingsRollbackConfirmed?: boolean })?.settingsRollbackConfirmed) {
        // No local keys have changed yet. A confirmed native rollback aborts
        // this attempt, rather than unexpectedly applying it on a later launch.
        await AsyncStorage.removeItem(SETTINGS_JOURNAL_KEY);
      }
      throw error;
    }
  }
  // Deliberately tolerate partial writes: the journal remains authoritative
  // until every key has been read back. Replaying never repeats a committed
  // native configuration, so it cannot cancel a later earned exception.
  for (const field of Object.keys(keys) as (keyof SavedSettings)[]) {
    await AsyncStorage.setItem(keys[field], journal.settings[field]);
  }
  for (const field of Object.keys(keys) as (keyof SavedSettings)[]) {
    if (await AsyncStorage.getItem(keys[field]) !== journal.settings[field]) {
      throw new Error("Curfy couldn't confirm your saved Settings. Please retry.");
    }
  }
  await AsyncStorage.removeItem(SETTINGS_JOURNAL_KEY);
  if (await AsyncStorage.getItem(SETTINGS_JOURNAL_KEY) !== null) {
    throw new Error("Curfy couldn't finish saving Settings. Please retry.");
  }
  return journal.settings;
}
export async function recoverSettingsTransaction(configure: Configure): Promise<SavedSettings | null> {
  const owner = {};
  const release = beginProtectionOperation(owner);
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_JOURNAL_KEY);
    return raw === null ? null : await finish(parse(raw), configure, owner, true);
  } finally { release(); }
}
export async function saveSettingsTransaction(settings: SavedSettings, protectionChanged: boolean,
  draftSelectionId: string | undefined, configure: Configure): Promise<SavedSettings> {
  const owner = {};
  const release = beginProtectionOperation(owner);
  try {
    if (await AsyncStorage.getItem(SETTINGS_JOURNAL_KEY) !== null) {
      throw new Error("Finish recovering the previous Settings save before making another change.");
    }
    const journal: Journal = { version: 1, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      settings: { ...settings }, protectionChanged, draftSelectionId };
    const raw = JSON.stringify(journal);
    parse(raw);
    await AsyncStorage.setItem(SETTINGS_JOURNAL_KEY, raw);
    if (await AsyncStorage.getItem(SETTINGS_JOURNAL_KEY) !== raw) {
      throw new Error("Curfy couldn't prepare your Settings save. Please retry.");
    }
    return await finish(journal, configure, owner, false);
  } finally { release(); }
}

import { StarBackground } from "@/components/StarBackground";
import { Colors, Fonts } from "@/constants/theme";
import { JournalEntry, useJournal } from "@/context/JournalContext";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

type ViewMode = "list" | "calendar";

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function todayISO(): string {
  return isoDate(new Date());
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDayLabel(dateStr: string): string {
  const d = parseISODate(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function buildMonthMatrix(monthStart: Date): (Date | null)[][] {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  // Pad to a full 6-row grid so the calendar's height never jumps
  // between months with 4, 5, or 6 visible weeks.
  while (cells.length < 42) cells.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// The compose box — the one primary write action in this whole tab.
// Scoped to whichever date is passed in: "today" at the top of List view,
// or whatever day is selected in Calendar view.
function Composer({ date }: { date: string }) {
  const { addEntry } = useJournal();
  const [text, setText] = useState("");
  const canSave = text.trim().length > 0;

  const save = async () => {
    if (!canSave) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await addEntry(date, text.trim());
    setText("");
  };

  return (
    <View style={styles.composerCard}>
      <TextInput
        style={styles.composerInput}
        value={text}
        onChangeText={setText}
        placeholder="What's keeping you up tonight?"
        placeholderTextColor={Colors.textGhost}
        multiline
        textAlignVertical="top"
      />
      <TouchableOpacity
        onPress={save}
        disabled={!canSave}
        style={[styles.saveChip, !canSave && styles.saveChipDisabled]}
      >
        <Text style={[styles.saveChipText, !canSave && styles.saveChipTextDisabled]}>
          Save thought
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function EntryCard({ entry, onPress }: { entry: JournalEntry; onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.entryCard}>
      <View style={styles.entryCardHeader}>
        <Text style={styles.entryCardDate}>{formatDayLabel(entry.date)}</Text>
        <Text style={styles.entryCardTime}>{formatTime(entry.createdAt)}</Text>
      </View>
      <Text style={styles.entryCardText} numberOfLines={5}>
        {entry.text}
      </Text>
    </TouchableOpacity>
  );
}

// Full-screen edit/delete sheet for an existing entry. Kept local to this
// file (a plain RN Modal, same pattern as the lock screen modal in
// app/_layout.tsx) rather than a router route — there's nothing here that
// needs back/forward stack behavior.
function EntryEditor({
  entry,
  onClose,
}: {
  entry: JournalEntry | null;
  onClose: () => void;
}) {
  const { updateEntry, deleteEntry } = useJournal();
  const [text, setText] = useState(entry?.text ?? "");

  // Reset draft text whenever a new entry is opened for editing.
  React.useEffect(() => {
    setText(entry?.text ?? "");
  }, [entry]);

  if (!entry) return null;

  const save = async () => {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      remove();
      return;
    }
    await updateEntry(entry.id, trimmed);
    onClose();
  };

  const remove = () => {
    Alert.alert("Delete this thought?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteEntry(entry.id);
          onClose();
        },
      },
    ]);
  };

  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <SafeAreaView style={styles.editorSafe} edges={["top", "bottom"]}>
        <StarBackground />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.editorHeader}>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
            <Text style={styles.editorDate}>{formatDayLabel(entry.date)}</Text>
            <TouchableOpacity onPress={remove} hitSlop={12}>
              <Ionicons name="trash-outline" size={20} color={Colors.dangerRed} />
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.editorInput}
            value={text}
            onChangeText={setText}
            multiline
            textAlignVertical="top"
            autoFocus
          />

          <View style={styles.editorFooter}>
            <TouchableOpacity onPress={save} style={styles.editorSaveBtn}>
              <Text style={styles.editorSaveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// Shown once automatically the first time this tab is ever opened (see
// the `hasSeenIntro` effect in the Journal component below), and reopenable
// any time via the help icon in the header. A real technique, not just
// flavor copy — see CONTEXT.md for the source (Scullin et al., Journal of
// Experimental Psychology: General, 2018) behind the "cognitive offloading"
// framing here.
function JournalIntroModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.introBackdrop}>
        <View style={styles.introCard}>
          <Text style={styles.introTitle}>Why journal before bed?</Text>
          <Text style={styles.introBody}>
            Writing down what's on your mind — worries, loose ends,
            tomorrow's to-dos — is a real technique called cognitive
            offloading, the same idea behind CBT-I (cognitive behavioral
            therapy for insomnia). Getting it out of your head and onto the
            page signals to your brain that it's been saved, so it can stop
            running the loop and let you actually fall asleep.
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.introBtn}>
            <Text style={styles.introBtnText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function ModeToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <View style={styles.modeToggle}>
      {(["list", "calendar"] as ViewMode[]).map((m) => (
        <TouchableOpacity
          key={m}
          onPress={() => onChange(m)}
          style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
        >
          <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
            {m === "list" ? "List" : "Calendar"}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function JournalListView({ onOpenEntry }: { onOpenEntry: (e: JournalEntry) => void }) {
  const { entries } = useJournal();

  return (
    <FlatList
      data={entries}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.scroll}
      ListHeaderComponent={
        <View style={{ gap: 16, marginBottom: 16 }}>
          <Composer date={todayISO()} />
          {entries.length > 0 && <Text style={styles.sectionTitle}>YOUR THOUGHTS</Text>}
        </View>
      }
      renderItem={({ item, index }) => (
        <Animated.View entering={FadeInDown.duration(350).delay(Math.min(index, 6) * 50)}>
          <EntryCard entry={item} onPress={() => onOpenEntry(item)} />
        </Animated.View>
      )}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Nothing written yet</Text>
          <Text style={styles.emptySub}>
            Clear your head before you lock in for the night.
          </Text>
        </View>
      }
    />
  );
}

function JournalCalendarView({ onOpenEntry }: { onOpenEntry: (e: JournalEntry) => void }) {
  const { getEntriesForDate } = useJournal();
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(todayISO());

  const weeks = useMemo(() => buildMonthMatrix(monthCursor), [monthCursor]);
  const monthLabel = monthCursor.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const today = new Date();
  const selectedEntries = getEntriesForDate(selectedDate);

  const shiftMonth = (delta: number) => {
    setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const selectDay = (d: Date) => {
    Haptics.selectionAsync();
    setSelectedDate(isoDate(d));
  };

  return (
    <FlatList
      data={selectedEntries}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.scroll}
      ListHeaderComponent={
        <View style={{ gap: 16, marginBottom: 16 }}>
          <View style={styles.calendarCard}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity onPress={() => shiftMonth(-1)} hitSlop={10}>
                <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
              <Text style={styles.calendarMonth}>{monthLabel}</Text>
              <TouchableOpacity onPress={() => shiftMonth(1)} hitSlop={10}>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.weekdayRow}>
              {["S", "M", "T", "W", "T", "F", "S"].map((label, i) => (
                <Text key={i} style={styles.weekdayLabel}>
                  {label}
                </Text>
              ))}
            </View>

            {weeks.map((week, wi) => (
              <View key={wi} style={styles.weekRow}>
                {week.map((day, di) => {
                  if (!day) return <View key={di} style={styles.dayCell} />;
                  const iso = isoDate(day);
                  const isToday = sameDay(day, today);
                  const isSelected = iso === selectedDate;
                  const hasEntries = getEntriesForDate(iso).length > 0;
                  return (
                    <TouchableOpacity
                      key={di}
                      style={styles.dayCell}
                      onPress={() => selectDay(day)}
                    >
                      <View
                        style={[
                          styles.dayNumWrap,
                          isSelected && styles.dayNumWrapSelected,
                          !isSelected && isToday && styles.dayNumWrapToday,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayNum,
                            isSelected && styles.dayNumSelected,
                            !isSelected && isToday && styles.dayNumToday,
                          ]}
                        >
                          {day.getDate()}
                        </Text>
                      </View>
                      <View
                        style={[styles.dayDot, hasEntries && styles.dayDotActive]}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>

          <View>
            <Text style={styles.sectionTitle}>{formatDayLabel(selectedDate).toUpperCase()}</Text>
          </View>

          <Composer date={selectedDate} />
        </View>
      }
      renderItem={({ item }) => <EntryCard entry={item} onPress={() => onOpenEntry(item)} />}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListEmptyComponent={
        <Text style={styles.lbEmpty}>No thoughts logged this night.</Text>
      }
    />
  );
}

export default function Journal() {
  const { isLoading, hasSeenIntro, markIntroSeen } = useJournal();
  const [mode, setMode] = useState<ViewMode>("list");
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [introVisible, setIntroVisible] = useState(false);

  // First-ever visit to this tab: show the intro once automatically. The
  // help icon below reopens it any time regardless of hasSeenIntro.
  useEffect(() => {
    if (isLoading || hasSeenIntro) return;
    setIntroVisible(true);
  }, [isLoading, hasSeenIntro]);

  const closeIntro = () => {
    setIntroVisible(false);
    markIntroSeen();
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StarBackground />
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Journal</Text>
          <Text style={styles.subtitle}>Clear your head before lights out.</Text>
        </View>
        <TouchableOpacity
          onPress={() => setIntroVisible(true)}
          hitSlop={12}
          style={styles.helpBtn}
        >
          <Ionicons name="help-circle-outline" size={24} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.toggleRow}>
        <ModeToggle mode={mode} onChange={setMode} />
      </View>

      {mode === "list" ? (
        <JournalListView onOpenEntry={setEditingEntry} />
      ) : (
        <JournalCalendarView onOpenEntry={setEditingEntry} />
      )}

      <EntryEditor entry={editingEntry} onClose={() => setEditingEntry(null)} />
      <JournalIntroModal visible={introVisible} onClose={closeIntro} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  helpBtn: { paddingTop: 4 },
  title: { color: Colors.textPrimary, fontSize: 28, fontFamily: Fonts.bold, letterSpacing: -0.5 },
  subtitle: { color: Colors.textMuted, fontSize: 14, fontFamily: Fonts.regular, marginTop: 2 },
  toggleRow: { paddingHorizontal: 24, marginTop: 16, marginBottom: 4 },
  scroll: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40 },

  sectionTitle: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: Fonts.medium,
    letterSpacing: 1,
    textTransform: "uppercase",
  },

  modeToggle: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 3,
    alignSelf: "stretch",
  },
  modeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  modeBtnActive: { backgroundColor: Colors.border },
  modeBtnText: { color: Colors.textMuted, fontSize: 13, fontFamily: Fonts.semiBold },
  modeBtnTextActive: { color: Colors.textPrimary },

  composerCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  composerInput: {
    color: Colors.textPrimary,
    fontFamily: Fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 70,
    maxHeight: 160,
  },
  saveChip: {
    alignSelf: "flex-end",
    backgroundColor: Colors.primaryCyan,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  saveChipDisabled: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  saveChipText: { color: "#000814", fontSize: 13, fontFamily: Fonts.bold },
  saveChipTextDisabled: { color: Colors.textGhost },

  entryCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  entryCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  entryCardDate: { color: Colors.textPrimary, fontSize: 13, fontFamily: Fonts.semiBold },
  entryCardTime: { color: Colors.textGhost, fontSize: 12, fontFamily: Fonts.regular },
  entryCardText: { color: Colors.textMuted, fontSize: 14, fontFamily: Fonts.regular, lineHeight: 21 },

  emptyState: { alignItems: "center", paddingTop: 40, gap: 6 },
  emptyTitle: { color: Colors.textGhost, fontSize: 16, fontFamily: Fonts.medium },
  emptySub: { color: Colors.textGhost, fontSize: 13, fontFamily: Fonts.regular, textAlign: "center" },
  lbEmpty: {
    color: Colors.textGhost,
    fontSize: 13,
    fontFamily: Fonts.regular,
    textAlign: "center",
    paddingVertical: 20,
  },

  // Calendar
  calendarCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  calendarHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  calendarMonth: { color: Colors.textPrimary, fontSize: 15, fontFamily: Fonts.semiBold },
  weekdayRow: { flexDirection: "row" },
  weekdayLabel: {
    flex: 1,
    textAlign: "center",
    color: Colors.textGhost,
    fontSize: 11,
    fontFamily: Fonts.medium,
    letterSpacing: 0.5,
  },
  weekRow: { flexDirection: "row" },
  dayCell: { flex: 1, alignItems: "center", paddingVertical: 4, gap: 3 },
  dayNumWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dayNumWrapSelected: { backgroundColor: Colors.primaryCyan },
  dayNumWrapToday: { borderWidth: 1, borderColor: Colors.primaryCyan },
  dayNum: { color: Colors.textPrimary, fontSize: 13, fontFamily: Fonts.medium },
  dayNumSelected: { color: "#000814", fontFamily: Fonts.bold },
  dayNumToday: { color: Colors.primaryCyan, fontFamily: Fonts.semiBold },
  dayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "transparent" },
  dayDotActive: { backgroundColor: Colors.primaryCyan },

  // Editor modal
  editorSafe: { flex: 1, backgroundColor: Colors.background },
  editorHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  editorDate: { color: Colors.textPrimary, fontSize: 15, fontFamily: Fonts.semiBold },
  editorInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontFamily: Fonts.regular,
    fontSize: 17,
    lineHeight: 26,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  editorFooter: { paddingHorizontal: 24, paddingBottom: 24, paddingTop: 8 },
  editorSaveBtn: {
    backgroundColor: Colors.primaryCyan,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
  },
  editorSaveText: { color: "#000814", fontSize: 16, fontFamily: Fonts.bold },

  // Intro / help card
  introBackdrop: {
    flex: 1,
    backgroundColor: "rgba(3, 3, 10, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  introCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    padding: 24,
    gap: 14,
  },
  introTitle: { color: Colors.textPrimary, fontSize: 19, fontFamily: Fonts.bold },
  introBody: { color: Colors.textMuted, fontSize: 14, fontFamily: Fonts.regular, lineHeight: 21 },
  introBtn: {
    backgroundColor: Colors.primaryCyan,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  introBtnText: { color: "#000814", fontSize: 15, fontFamily: Fonts.bold },
});

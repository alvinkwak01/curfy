import { LeaderboardSettings } from "@/components/LeaderboardConsent";
import { PremiumSettings } from "@/components/PremiumSettings";
import { usePremium } from "@/context/PremiumContext";
import { allPremiumAppsHaveActiveExceptions } from "@/lib/premiumProtection";
import { StarBackground } from "@/components/StarBackground";
import { TimePicker } from "@/components/TimePicker";
import { ProtectionRoutine, cutoffDayLabel, clockLabel, inferRoutineFromStart } from "@/lib/protectionRoutine";
import { Colors, Fonts, Layout } from "@/constants/theme";
import { useSleep } from "@/context/SleepContext";
import {
  BLOCK_MODE_PRESETS,
  BlockModeId,
  configureBedtimeBlocking,
  getSelectionCount,
  draftSelectionIdForMode,
  prepareSelectionDraft,
  selectionDraftChanged,
  selectionIdForMode,
  activeExceptionExpiresAt,
  getScreenTimeAccessStatus,
} from "@/lib/screenTime";
import { isBedtimeWindowActive } from "@/lib/bedtimeWindow";
import { normalizeActivitySelectionMetadata, selectionIssueForEntitlement, type SelectionPolicyIssue } from "@/lib/premiumPolicy";
import { waitForPersistedPickerCommit } from "@/lib/pickerSettlement";
import { allowProtectionReconfiguration, protectionSettingsChanged } from "@/lib/protectionSettingsPolicy";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivitySelectionMetadata,
  DeviceActivitySelectionSheetViewPersisted,
  activitySelectionMetadata,
} from "react-native-device-activity";
import {
  Alert,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Settings() {
  const { entitlement } = usePremium();
  const selectionIssue = (metadata: ActivitySelectionMetadata | null | undefined) => selectionIssueForEntitlement(metadata, entitlement);
  const {
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
    signOut,
    deleteAccount,
    devSkipLock,
    setDevSkipLock,
  } = useSleep();
  const [localBedtime, setLocalBedtime] = useState(bedtime);
  const [localWakeTime, setLocalWakeTime] = useState(wakeTime);
  const [localRoutine, setLocalRoutine] = useState<ProtectionRoutine>(protectionRoutine);
  const [localBlockMode, setLocalBlockMode] = useState<BlockModeId | null>(
    (blockMode as BlockModeId) || null
  );
  const [localName, setLocalName] = useState(userName);
  const [localMotivation, setLocalMotivation] = useState(motivation);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const [pickerMode, setPickerMode] = useState<BlockModeId | null>(null);
  const pendingPickerCommit = useRef<Promise<void> | null>(null);
  const sawNativeSelectionEvent = useRef(false);
  const pickerIsClosing = useRef(false);
  const [stagedMode, setStagedMode] = useState<BlockModeId | null>(null);
  const [pickerIssue, setPickerIssue] = useState<SelectionPolicyIssue | null>(null);
  // Read once on mount from the native side (not persisted app state) —
  // this is what actually lets the UI show "N apps blocked" without
  // reopening the picker. Refreshed locally after any picker session.
  const [appCounts, setAppCounts] = useState<Partial<Record<BlockModeId, number>>>(() => {
    const counts: Partial<Record<BlockModeId, number>> = {};
    for (const preset of BLOCK_MODE_PRESETS) {
      const count = getSelectionCount(preset.id);
      if (count !== null) counts[preset.id] = count;
    }
    return counts;
  });

  const onSave = async () => {
    if (saveInFlight.current || saved || deleting) return;
    if (!localBlockMode) {
      Alert.alert("Choose an app", "Select an app to protect before saving.");
      return;
    }
    // The native picker persists with a 100ms debounce; wait before reading
    // its opaque draft and never trust potentially stale React state.
    if (pendingPickerCommit.current) {
      try {
        await pendingPickerCommit.current;
      } catch {
        Alert.alert("Selection wasn't confirmed",
          "Curfy couldn't verify Apple's saved app choice. Reopen the picker and try again.");
        return;
      }
    }
    let confirmedPickerIssue: SelectionPolicyIssue | null = null;
    try {
      confirmedPickerIssue = stagedMode === localBlockMode
        ? selectionIssue(activitySelectionMetadata({ activitySelectionId: draftSelectionIdForMode(localBlockMode) }))
        : null;
    } catch (error) {
      console.warn("[Curfy] Couldn't verify saved Settings app choice", error);
      Alert.alert("Can't verify selected app",
        "iOS couldn't confirm the saved app selection. Reopen Apple's picker and try again.");
      return;
    }
    setPickerIssue(confirmedPickerIssue);
    if (confirmedPickerIssue) {
      Alert.alert("Check your app selection",
        confirmedPickerIssue === "categories-and-websites-not-supported"
          ? "Choose individual apps only. Categories and websites aren't supported."
          : confirmedPickerIssue === "choose-one-app" ? "Choose at least one individual app."
          : "Verify or restore Curfy Premium to protect multiple apps. Free protects one app.");
      return;
    }
    const pickerEdited = stagedMode === localBlockMode &&
      selectionDraftChanged(localBlockMode);
    const protectionChanged = protectionSettingsChanged(
      { bedtime, wakeTime, blockMode, routine: protectionRoutine },
      { bedtime: localBedtime, wakeTime: localWakeTime, blockMode: localBlockMode, routine: localRoutine },
      pickerEdited
    );
    if (!allowProtectionReconfiguration({
      changingProtection: protectionChanged,
      insideCurrentBedtime: isBedtimeWindowActive(new Date(), bedtime, wakeTime),
      authorized: getScreenTimeAccessStatus() === "authorized",
      hasConfiguredApp: blockMode === "custom" || blockMode === "social" || blockMode === "most",
      activeException: activeExceptionExpiresAt() !== null ||
        (!!blockMode && allPremiumAppsHaveActiveExceptions(selectionIdForMode(blockMode as BlockModeId))),
    })) {
      Alert.alert(
        "Your bedtime boundary is active",
        "To change protected apps or your protection hours, complete the 120-second hold for each protected app from Curfy Home first, or wait until this window ends. Name and motivation remain editable."
      );
      return;
    }
    saveInFlight.current = true;
    setSaving(true);
    try {
      // Name/motivation edits must not reset the native shield, cancel an
      // exception, or restart DeviceActivity monitoring.
      if (protectionChanged) {
        await configureBedtimeBlocking({
          bedtime: localBedtime,
          wakeTime: localWakeTime,
          mode: localBlockMode,
          draftSelectionId: pickerEdited
            ? draftSelectionIdForMode(localBlockMode)
            : undefined,
        });
        if (localBedtime !== bedtime || localRoutine !== protectionRoutine) {
          await setBedtime(localBedtime, localRoutine);
        }
        if (localWakeTime !== wakeTime) await setWakeTime(localWakeTime);
        if (localBlockMode !== blockMode) await setBlockMode(localBlockMode);
        if (localRoutine !== protectionRoutine) await setProtectionRoutine(localRoutine);
      }
      if (localName.trim() !== userName) await setUserName(localName.trim());
      if (localMotivation.trim() !== motivation) await setMotivation(localMotivation.trim());
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(true);
      setTimeout(() => router.back(), 800);
    } catch (error) {
      console.warn("[Curfy] Failed to save Settings", error);
      Alert.alert("Settings couldn't be fully saved",
        error instanceof Error ? error.message : "Please try saving again.");
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };

  const handlePickApps = (mode: BlockModeId) => {
    try {
      // The picker edits a distinct opaque selection. Leaving Settings
      // without Save cannot change tokens used by the active iOS monitor.
      if (stagedMode !== mode) prepareSelectionDraft(mode);
      pendingPickerCommit.current = null;
      sawNativeSelectionEvent.current = false;
      pickerIsClosing.current = false;
      setPickerIssue(selectionIssue(activitySelectionMetadata({ activitySelectionId: draftSelectionIdForMode(mode) })));
      setStagedMode(mode);
      setLocalBlockMode(mode);
      setPickerMode(mode);
    } catch (error) {
      Alert.alert("Couldn't open app picker",
        error instanceof Error ? error.message : "Please try again.");
    }
  };

  const applySelectionMetadata = (mode: BlockModeId, metadata: ActivitySelectionMetadata) => {
    const counts = normalizeActivitySelectionMetadata(metadata);
    setAppCounts((prev) => {
      const next = { ...prev };
      if (counts) {
        next[mode] = counts.applicationCount + counts.categoryCount + counts.webDomainCount;
      } else {
        delete next[mode]; // Never display NaN as "number of apps".
      }
      return next;
    });
    setPickerIssue(selectionIssue(metadata));
  };

  const handleSelectionChange = (event: NativeSyntheticEvent<ActivitySelectionMetadata>) => {
    if (!pickerMode) return;
    sawNativeSelectionEvent.current = true;
    applySelectionMetadata(pickerMode, event.nativeEvent);
  };

  const activePreset = BLOCK_MODE_PRESETS.find((p) => p.id === pickerMode);

  const onSignOut = () => {
    if (saveInFlight.current || deleting) return;
    Alert.alert(
      "Restart setup?",
      "This restarts onboarding and ends the current protection schedule. During bedtime, complete the 120-second hold from Home first. Your saved history and online profile remain.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restart Setup",
          style: "default",
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            signOut().catch((error) => {
              Alert.alert("Couldn't restart setup",
                error instanceof Error ? error.message : "Please try again.");
            });
          },
        },
      ]
    );
  };

  const onDeleteAccount = () => {
    if (saveInFlight.current || deleting) return;
    Alert.alert(
      "Delete everything?",
      "Delete your online Curfy account and local history? If online deletion cannot be confirmed, nothing on this device will be erased. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Everything",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            if (deleting) return;
            setDeleting(true);
            deleteAccount()
              .catch((error) => {
                Alert.alert("Account deletion wasn't completed",
                  error instanceof Error ? error.message : "Please try again while online.");
              })
              .finally(() => setDeleting(false));
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <StarBackground />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <PremiumSettings />
        <LeaderboardSettings />

        <View style={styles.section}>
          <Text style={styles.label}>YOUR NAME</Text>
          <Text style={styles.hint}>Optional display name for your Curfy activity log</Text>
          <TextInput
            style={styles.input}
            value={localName}
            onChangeText={setLocalName}
            placeholder="Your name"
            placeholderTextColor={Colors.textGhost}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>PROTECTION START</Text>
          <Text style={styles.hint}>Curfy starts shielding your selected app at this time every day.</Text>
          <View style={{ marginTop: 12 }}>
            <TimePicker value={localBedtime} onChange={value => { setLocalBedtime(value); setLocalRoutine(inferRoutineFromStart(value)); }} digitSize={48} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>APPS AVAILABLE AGAIN</Text>
          <Text style={styles.hint}>Your app becomes available again at {clockLabel(localWakeTime)} ({cutoffDayLabel(localBedtime, localWakeTime)}).</Text>
          <View style={{ marginTop: 12 }}>
            <TimePicker value={localWakeTime} onChange={setLocalWakeTime} digitSize={48} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>BLOCKED APPS</Text>
          <Text style={styles.hint}>Free protects one individual app. Premium protects multiple individual apps. Categories and websites aren't supported.</Text>
          <View style={{ gap: 8, marginTop: 12 }}>
            {BLOCK_MODE_PRESETS.filter((preset) => preset.id === "custom").map((preset) => {
              const isSelected = localBlockMode === preset.id;
              const count = appCounts[preset.id];
              return (
                <TouchableOpacity
                  key={preset.id}
                  onPress={() => handlePickApps(preset.id)}
                  activeOpacity={0.85}
                  style={[styles.presetCard, isSelected && styles.presetCardSelected]}
                >
                  <View style={[styles.presetIconWrap, isSelected && styles.presetIconWrapSelected]}>
                    <Ionicons
                      name={preset.icon}
                      size={18}
                      color={isSelected ? Colors.primaryCyan : Colors.textMuted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.presetTitle}>{preset.title}</Text>
                    <Text style={styles.presetDesc}>
                      {count != null
                        ? `${count} selection${count === 1 ? "" : "s"}${entitlement === "owned" ? "" : " — free protects one app"}`
                        : "Tap to choose apps"}
                    </Text>
                  </View>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={20} color={Colors.primaryCyan} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {stagedMode && pickerIssue && pickerIssue !== "choose-one-app" && (
            <View style={styles.freeLimitNotice}>
              <Text style={styles.freeLimitTitle}>{pickerIssue === "categories-and-websites-not-supported" ? "Choose individual apps" : "One app is included free"}</Text>
              <Text style={styles.hint}>
                {pickerIssue === "categories-and-websites-not-supported"
                  ? "Remove categories and websites before saving. Choose apps individually."
                  : "Keep one individual app, or verify Curfy Premium to save multiple apps."}
              </Text>
            </View>
          )}

          {pickerMode && (
            <DeviceActivitySelectionSheetViewPersisted
              style={{ width: 1, height: 1, position: "absolute" }}
              familyActivitySelectionId={draftSelectionIdForMode(pickerMode)}
              includeEntireCategory={false}
              headerText={activePreset?.pickerHint}
              onSelectionChange={handleSelectionChange}
              onDismissRequest={() => {
                if (pickerIsClosing.current) return;
                pickerIsClosing.current = true;
                const closingMode = pickerMode;
                const commit = (async () => {
                  await waitForPersistedPickerCommit(() => sawNativeSelectionEvent.current);
                  const metadata = activitySelectionMetadata({
                    activitySelectionId: draftSelectionIdForMode(closingMode),
                  });
                  if (!metadata) {
                    throw new Error("iOS did not provide a saved app selection.");
                  }
                  applySelectionMetadata(closingMode, metadata);
                  if (selectionIssue(metadata) === "categories-and-websites-not-supported") {
                    Alert.alert("Choose individual apps",
                      "Remove categories and websites before saving Curfy protection.");
                  }
                })();
                pendingPickerCommit.current = commit;
                void commit.catch(error => {
                  console.warn("[Curfy] Settings picker save/metadata unavailable", error);
                  Alert.alert("Selection wasn't confirmed",
                    "Curfy couldn't verify Apple's saved app choice. Reopen the picker and try again.");
                }).finally(() => {
                  if (pendingPickerCommit.current === commit) pendingPickerCommit.current = null;
                  setPickerMode(null);
                  pickerIsClosing.current = false;
                });
              }}
            />
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>WHY ARE YOU DOING THIS?</Text>
          <Text style={styles.hint}>
            An optional reminder of why you chose this boundary.
          </Text>
          <TextInput
            style={[styles.input, styles.motivationInput]}
            value={localMotivation}
            onChangeText={setLocalMotivation}
            placeholder="e.g. I want to start the day on my terms"
            placeholderTextColor={Colors.textGhost}
            multiline
          />
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            {localRoutine === "morning"
              ? "Morning-only mode doesn't send bedtime reminders."
              : "Curfy can remind you 10 and 2 minutes before evening protection starts, if notifications are enabled."}
          </Text>
        </View>

        <View style={styles.previewSection}>
          <TouchableOpacity
            style={styles.previewBtn}
            onPress={() => router.push("/preview-lock")}
          >
            <Text style={styles.previewBtnText}>Preview Lock Screen</Text>
          </TouchableOpacity>
          <Text style={styles.previewHint}>
            Preview only — no apps will unlock, even after the full
            120-second hold. Use Exit to return to Settings.
          </Text>
        </View>

        {__DEV__ && (
          <View style={styles.devSection}>
            <View style={styles.devRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>DISABLE AUTO-LOCK</Text>
                <Text style={styles.hint}>
                  Dev builds only — stops the real bedtime window from
                  locking you out while you test other screens. Use
                  "Preview Lock Screen" above to still see the lock UI.
                </Text>
              </View>
              <Switch
                value={devSkipLock}
                onValueChange={setDevSkipLock}
                trackColor={{ false: Colors.border, true: Colors.primaryCyan }}
                thumbColor={Colors.textPrimary}
              />
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.saveBtn, saved && styles.saveBtnSaved]}
          onPress={onSave}
          disabled={saved || saving || deleting}
        >
          <Text style={styles.saveBtnText}>
            {saved ? "Saved" : saving ? "Saving..." : "Save"}
          </Text>
        </TouchableOpacity>

        <View style={styles.accountSection}>
          <TouchableOpacity style={styles.signOutBtn} onPress={onSignOut} disabled={deleting || saving}>
            <Text style={styles.signOutText}>Restart Setup</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.deleteLink} onPress={onDeleteAccount} disabled={deleting || saving}>
            <Text style={styles.deleteLinkText}>{deleting ? "Deleting Account..." : "Delete Account"}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  body: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40, gap: 28 },
  back: { color: Colors.primaryCyan, fontSize: 15, fontFamily: Fonts.medium },
  title: { color: Colors.textPrimary, fontSize: 28, fontFamily: Fonts.bold },
  section: { gap: 2 },
  label: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: Fonts.medium,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  hint: { color: Colors.textGhost, fontSize: 12, fontFamily: Fonts.regular },
  input: {
    marginTop: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 18,
    fontSize: 18,
    fontFamily: Fonts.medium,
    color: Colors.textPrimary,
  },
  motivationInput: {
    fontSize: 15,
    minHeight: 60,
    textAlignVertical: "top",
  },
  presetCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Layout.cardRadius,
    padding: 12,
  },
  presetCardSelected: { borderColor: Colors.primaryCyan },
  freeLimitNotice: {
    marginTop: 12, borderRadius: 12, padding: 12, gap: 6,
    borderWidth: 1, borderColor: Colors.warningAmber,
    backgroundColor: "rgba(255,178,74,0.07)",
  },
  freeLimitTitle: {
    fontFamily: Fonts.semiBold, color: Colors.warningAmber, fontSize: 14,
  },
  presetIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  presetIconWrapSelected: { backgroundColor: "rgba(0,229,255,0.1)" },
  presetTitle: { color: Colors.textPrimary, fontSize: 14, fontFamily: Fonts.semiBold, marginBottom: 1 },
  presetDesc: { color: Colors.textMuted, fontSize: 12, fontFamily: Fonts.regular },
  notice: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
  },
  noticeText: { color: Colors.textMuted, fontSize: 13, fontFamily: Fonts.regular, lineHeight: 19 },
  previewSection: { gap: 8 },
  previewBtn: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  previewBtnText: { color: Colors.primaryCyan, fontSize: 15, fontFamily: Fonts.semiBold },
  previewHint: {
    color: Colors.textGhost,
    fontSize: 12,
    fontFamily: Fonts.regular,
    lineHeight: 17,
  },
  devSection: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.warningAmber,
    borderRadius: 14,
    padding: 16,
  },
  devRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  saveBtn: {
    backgroundColor: Colors.primaryCyan,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
  },
  saveBtnSaved: { backgroundColor: Colors.successGreen },
  saveBtnText: { color: "#000814", fontSize: 16, fontFamily: Fonts.bold },
  accountSection: { gap: 12 },
  signOutBtn: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  signOutText: { color: Colors.textPrimary, fontSize: 15, fontFamily: Fonts.semiBold },
  deleteLink: {
    alignItems: "center",
    paddingVertical: 4,
  },
  deleteLinkText: {
    color: Colors.textGhost,
    fontSize: 12,
    fontFamily: Fonts.regular,
  },
});

import { StarBackground } from "@/components/StarBackground";
import { TimePicker } from "@/components/TimePicker";
import { Colors, Fonts, Layout } from "@/constants/theme";
import { useSleep } from "@/context/SleepContext";
import {
  BLOCK_MODE_PRESETS,
  BlockModeId,
  configureBedtimeBlocking,
  getSelectionCount,
  draftSelectionIdForMode,
  prepareSelectionDraft,
  freeSelectionIssue,
  freeSelectionIssueForMetadata,
  FreeSelectionIssue,
} from "@/lib/screenTime";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivitySelectionMetadata,
  DeviceActivitySelectionSheetViewPersisted,
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
  const {
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
    signOut,
    deleteAccount,
    devSkipLock,
    setDevSkipLock,
  } = useSleep();
  const [localBedtime, setLocalBedtime] = useState(bedtime);
  const [localWakeTime, setLocalWakeTime] = useState(wakeTime);
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
  const [stagedMode, setStagedMode] = useState<BlockModeId | null>(null);
  const [pickerIssue, setPickerIssue] = useState<FreeSelectionIssue | null>(null);
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
    if (saveInFlight.current || saved) return;
    if (!localBlockMode) {
      Alert.alert("Choose an app", "Select an app to protect before saving.");
      return;
    }
    if (stagedMode === localBlockMode && pickerIssue) {
      Alert.alert("Start with one app",
        pickerIssue === "too-many-apps-or-categories"
          ? "Free protection covers one individual app. Return to the picker and remove extra apps, categories and websites. Premium purchases aren't available yet."
          : "Choose one individual app before saving.");
      return;
    }
    saveInFlight.current = true;
    setSaving(true);
    try {
      await configureBedtimeBlocking({
        bedtime: localBedtime,
        wakeTime: localWakeTime,
        mode: localBlockMode,
        draftSelectionId: stagedMode === localBlockMode
          ? draftSelectionIdForMode(localBlockMode)
          : undefined,
      });
      // Native state must be committed before Settings claims "Saved".
      await setBedtime(localBedtime);
      await setWakeTime(localWakeTime);
      await setUserName(localName.trim());
      await setMotivation(localMotivation.trim());
      await setBlockMode(localBlockMode);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(true);
      setTimeout(() => router.back(), 800);
    } catch (error) {
      console.warn("[Curfy] Failed to save bedtime protection", error);
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
      setPickerIssue(freeSelectionIssue(draftSelectionIdForMode(mode)));
      setStagedMode(mode);
      setLocalBlockMode(mode);
      setPickerMode(mode);
    } catch (error) {
      Alert.alert("Couldn't open app picker",
        error instanceof Error ? error.message : "Please try again.");
    }
  };

  const handleSelectionChange = (event: NativeSyntheticEvent<ActivitySelectionMetadata>) => {
    if (!pickerMode) return;
    const { applicationCount, categoryCount, webDomainCount } = event.nativeEvent;
    setAppCounts((prev) => ({
      ...prev, [pickerMode]: applicationCount + categoryCount + webDomainCount,
    }));
    setPickerIssue(freeSelectionIssueForMetadata(event.nativeEvent));
  };

  const activePreset = BLOCK_MODE_PRESETS.find((p) => p.id === pickerMode);

  const onSignOut = () => {
    Alert.alert(
      "Sign out?",
      "Restarting setup stops Curfy's current app restrictions. Your local history and online profile remain. This does not sign out of the anonymous online account.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
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

        <View style={styles.section}>
          <Text style={styles.label}>YOUR NAME</Text>
          <Text style={styles.hint}>Used in your sleep log</Text>
          <TextInput
            style={styles.input}
            value={localName}
            onChangeText={setLocalName}
            placeholder="Your name"
            placeholderTextColor={Colors.textGhost}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>BEDTIME</Text>
          <Text style={styles.hint}>Curfy activates at this time every night</Text>
          <View style={{ marginTop: 12 }}>
            <TimePicker value={localBedtime} onChange={setLocalBedtime} digitSize={48} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>WAKE UP</Text>
          <Text style={styles.hint}>Blocked apps unlock at this time every morning</Text>
          <View style={{ marginTop: 12 }}>
            <TimePicker value={localWakeTime} onChange={setLocalWakeTime} digitSize={48} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>BLOCKED APPS</Text>
          <Text style={styles.hint}>Free protects one individual app. Categories, websites and multiple apps aren't available yet.</Text>
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
                        ? `${count} selection${count === 1 ? "" : "s"} — free protects one app`
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

          {stagedMode && pickerIssue === "too-many-apps-or-categories" && (
            <View style={styles.freeLimitNotice}>
              <Text style={styles.freeLimitTitle}>One app is included free</Text>
              <Text style={styles.hint}>
                Your current selection includes more than one app, a category, or a website.
                Keep just one individual app to save. Premium multi-app protection will
                require an App Store purchase; purchasing isn't available yet.
              </Text>
            </View>
          )}

          {pickerMode && (
            <DeviceActivitySelectionSheetViewPersisted
              style={{ width: 1, height: 1, position: "absolute" }}
              familyActivitySelectionId={draftSelectionIdForMode(pickerMode)}
              headerText={activePreset?.pickerHint}
              onSelectionChange={handleSelectionChange}
              onDismissRequest={() => setPickerMode(null)}
            />
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>WHY ARE YOU DOING THIS?</Text>
          <Text style={styles.hint}>
            Shown back to you on the nights this is hard. Optional.
          </Text>
          <TextInput
            style={[styles.input, styles.motivationInput]}
            value={localMotivation}
            onChangeText={setLocalMotivation}
            placeholder="e.g. I want to actually feel rested"
            placeholderTextColor={Colors.textGhost}
            multiline
          />
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Notifications are sent 10 and 2 minutes before your bedtime. Make
            sure notifications are enabled in your device settings.
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
          disabled={saved || saving}
        >
          <Text style={styles.saveBtnText}>
            {saved ? "Saved" : saving ? "Saving..." : "Save"}
          </Text>
        </TouchableOpacity>

        <View style={styles.accountSection}>
          <TouchableOpacity style={styles.signOutBtn} onPress={onSignOut} disabled={deleting}>
            <Text style={styles.signOutText}>Restart Setup</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.deleteLink} onPress={onDeleteAccount} disabled={deleting}>
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

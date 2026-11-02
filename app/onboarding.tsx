import Btn from "@/components/Btn";
 import { StarBackground } from "@/components/StarBackground";
import { TimePicker } from "@/components/TimePicker";
import { PROTECTION_ROUTINES, ProtectionRoutine, routineDefaults, routineExplainer, startQuestion, protectionWindowLabel } from "@/lib/protectionRoutine";
import { assertMonitorableBedtimeSchedule } from "@/lib/bedtimeWindow";
import { Colors, Fonts, Layout } from "@/constants/theme";
import { useSleep } from "@/context/SleepContext";
import {
  BLOCK_MODE_PRESETS,
  BlockModeId,
  ScreenTimeAuthStatus,
  configureBedtimeBlocking,
  freeSelectionIssueForMetadata,
  FreeSelectionIssue,
  requestScreenTimeAccess,
  selectionIdForMode,
} from "@/lib/screenTime";
import { Ionicons } from "@expo/vector-icons";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ActivitySelectionMetadata,
  DeviceActivitySelectionSheetViewPersisted,
  activitySelectionMetadata,
} from "react-native-device-activity";
import Animated, { SlideInRight, SlideOutLeft } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

const STEP_COUNT = 5;

function ProgressBar({ step }: { step: number }) {
  const progress = ((step + 1) / STEP_COUNT) * 100;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${progress}%` }]} />
    </View>
  );
}

function Badge({ children }: { children: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{children}</Text>
    </View>
  );
}

export default function Onboarding() {
  const {
    setBedtime,
    setWakeTime,
    setBlockMode: persistBlockMode,
    setProtectionRoutine,
    completeOnboarding,
  } = useSleep();
   const [step, setStep] = useState(0);
  const [routine, setRoutine] = useState<ProtectionRoutine | null>(null);
  const [localBedtime, setLocalBedtime] = useState("23:00");
  const [localWakeTime, setLocalWakeTime] = useState("06:00");
  const chooseRoutine = (selected: ProtectionRoutine) => {
    const defaults = routineDefaults(selected);
    setRoutine(selected);
    setLocalBedtime(defaults.start);
    setLocalWakeTime(defaults.end);
  };
  const [screenTimeStatus, setScreenTimeStatus] =
    useState<ScreenTimeAuthStatus>("notDetermined");
  const [blockMode, setBlockMode] = useState<BlockModeId | null>(null);
  const [selectedCount, setSelectedCount] = useState<number | null>(null);
  const [selectionIssue, setSelectionIssue] = useState<FreeSelectionIssue | null>("choose-one-app");
  const [finishing, setFinishing] = useState(false);
  const finishingRef = useRef(false);

  const next = async () => {
    if (step === 0 && !routine) {
      Alert.alert("Choose your routine", "Select Evening, Morning or Both to continue.");
      return;
    }
    if (step === 2) {
      try {
        assertMonitorableBedtimeSchedule(localBedtime, localWakeTime);
      } catch (error) {
        Alert.alert("Adjust the times", error instanceof Error ? error.message : "Choose a valid protection window.");
        return;
      }
    }
    if (step === 3 && screenTimeStatus !== "authorized") {
      Alert.alert("Screen Time needed", "Grant Screen Time access so Curfy can shield your chosen app.");
      return;
    }
    if (step === 4 && (selectionIssue || !blockMode)) {
      Alert.alert("Start with one app",
        selectionIssue === "too-many-apps-or-categories"
          ? "Your free Curfy plan protects one individual app. Reopen Apple's picker and keep only one app selected. Multiple apps will require Premium."
          : "Choose one individual app in Apple's picker to continue.");
      return;
    }
    if (step < STEP_COUNT - 1) {
      setStep(step + 1);
      return;
    }
    if (!blockMode || !routine) {
      Alert.alert("Finish setup", "Choose a routine and one individual app first.");
      return;
    }
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    try {
      await configureBedtimeBlocking({
        bedtime: localBedtime,
        wakeTime: localWakeTime,
        mode: blockMode,
      });
      await setBedtime(localBedtime, routine);
      await setWakeTime(localWakeTime);
      await persistBlockMode(blockMode);
      await setProtectionRoutine(routine);
      await completeOnboarding();
    } catch (error) {
      console.warn("[Curfy] Failed to finish onboarding", error);
      Alert.alert("Setup couldn't finish",
        error instanceof Error ? error.message : "Please try saving again.");
    } finally {
      finishingRef.current = false;
      setFinishing(false);
    }
  };

  const back = () => {
    if (step > 0) setStep(step - 1);
  };

  const isLastStep = step === STEP_COUNT - 1;
  // Leave Continue tappable so invalid selections get an explanation.
  const buttonDisabled = finishing;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <StarBackground />
      <View style={styles.header}>
        {step > 0 ? (
          <TouchableOpacity onPress={back} hitSlop={12} accessibilityRole="button" accessibilityLabel="Previous setup step">
            <Ionicons name="chevron-back" size={22} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : <View style={{ width: 22 }} />}
        <ProgressBar step={step} />
      </View>

      <KeyboardAvoidingView
        style={styles.stepFlow}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Animated.View
          key={step}
          entering={SlideInRight.duration(350)}
          exiting={SlideOutLeft.duration(300)}
          style={styles.stepContent}
        >
          {(() => {
            const stepNode = (
              <>
                {step === 0 && <StepRoutine routine={routine} onChange={chooseRoutine} />}
                {step === 1 && routine && <StepTimeStart routine={routine} value={localBedtime} onChange={setLocalBedtime} />}
                {step === 2 && routine && <StepTimeEnd routine={routine} value={localWakeTime} onChange={setLocalWakeTime} />}
                {step === 3 && <StepScreenTimeAccess status={screenTimeStatus} onStatusChange={setScreenTimeStatus} />}
                {step === 4 && (
                  <StepChooseApps
                    routine={routine}
                    start={localBedtime}
                    end={localWakeTime}
                    blockMode={blockMode}
                    selectedCount={selectedCount}
                    onSelect={setBlockMode}
                    selectionIssue={selectionIssue}
                    onSelectionChange={(metadata) => {
                      setSelectedCount(metadata.applicationCount + metadata.categoryCount + metadata.webDomainCount);
                      setSelectionIssue(freeSelectionIssueForMetadata(metadata));
                    }}
                  />
                )}
              </>
            );

            // The wheel now owns touch gestures inside each clock column,
            // while the surrounding form can scroll on smaller iPhones.
            return (
              <ScrollView
                contentContainerStyle={styles.stepScrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {stepNode}
              </ScrollView>
            );
          })()}
        </Animated.View>

        <View style={styles.btnWrap}>
          <Btn
            label={isLastStep ? (finishing ? "Setting up..." : "Start protecting") : "Continue"}
            onPress={next}
            disabled={buttonDisabled}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function StepRoutine({ routine, onChange }: {
  routine: ProtectionRoutine | null; onChange: (value: ProtectionRoutine) => void;
}) {
  return (
    <View style={styles.stepInner}>
      <Badge>YOUR ROUTINE</Badge>
      <Text style={styles.hero}>When do you want{"\n"}fewer distractions?</Text>
      <Text style={styles.bodyText}>Protect a distracting app, not your whole phone. Pick a starting point; adjust the times next.</Text>
      <View style={{ gap: 12, marginTop: 8 }}>
        {PROTECTION_ROUTINES.map((option) => {
          const selected = option.id === routine;
          const defaults = routineDefaults(option.id);
          return (
            <TouchableOpacity key={option.id} accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${option.title}. ${option.description}`}
              onPress={() => onChange(option.id)}
              activeOpacity={0.85}
              style={[styles.presetCard, selected && styles.presetCardSelected]}>
              <View style={[styles.presetIconWrap, selected && styles.presetIconWrapSelected]}>
                <Ionicons name={option.icon} size={23}
                  color={selected ? Colors.primaryCyan : Colors.textMuted} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.presetTitle}>{option.title}</Text>
                <Text style={styles.presetDesc}>{option.description}</Text>
                <Text style={styles.fineprint}>{protectionWindowLabel(defaults.start, defaults.end)} suggested</Text>
              </View>
              {selected && <Ionicons name="checkmark-circle" size={22} color={Colors.primaryCyan} />}
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.fineprint}>Each option uses one continuous daily protection window. Times are editable.</Text>
    </View>
  );
}

function StepTimeStart({ routine, value, onChange }: {
  routine: ProtectionRoutine; value: string; onChange: (v: string) => void;
}) {
  return (
    <View style={[styles.stepInner, { alignItems: "center" }]}>
      <Badge>START PROTECTING</Badge>
      <Text style={[styles.hero, { textAlign: "center", fontSize: 32, lineHeight: 40 }]}>{startQuestion(routine)}</Text>
      <Text style={[styles.bodyText, { textAlign: "center" }]}>{routineExplainer(routine)}</Text>
      <View style={{ marginVertical: 14 }}><TimePicker value={value} onChange={onChange} digitSize={52} /></View>
      <Text style={styles.fineprint}>Swipe to adjust. You can edit it later.</Text>
    </View>
  );
}

function StepTimeEnd({ routine, value, onChange }: {
  routine: ProtectionRoutine; value: string; onChange: (v: string) => void;
}) {
  return (
    <View style={[styles.stepInner, { alignItems: "center" }]}>
      <Badge>AVAILABLE AGAIN</Badge>
      <Text style={[styles.hero, { textAlign: "center", fontSize: 32, lineHeight: 40 }]}>When should your app be available again?</Text>
      <Text style={[styles.bodyText, { textAlign: "center" }]}>
        Choose your cutoff. Curfy doesn't need to know when you actually sleep or wake up.
        Your selected app stays shielded until this time.
      </Text>
      <View style={{ marginVertical: 14 }}><TimePicker value={value} onChange={onChange} digitSize={52} /></View>
      <Text style={styles.fineprint}>Suggested for {routine === "morning" ? "morning" : routine === "both" ? "night and morning" : "evening"} — fully adjustable.</Text>
    </View>
  );
}

function StepScreenTimeAccess({
  status,
  onStatusChange,
}: {
  status: ScreenTimeAuthStatus;
  onStatusChange: (s: ScreenTimeAuthStatus) => void;
}) {
  const [isRequesting, setIsRequesting] = useState(false);

  const handleEnable = async () => {
    setIsRequesting(true);
    const result = await requestScreenTimeAccess();
    onStatusChange(result);
    setIsRequesting(false);
  };

  return (
    <View style={styles.stepInner}>
      <Badge>SCREEN TIME ACCESS</Badge>
      <Text style={styles.hero}>We need{"\n"}your Screen{"\n"}Time access.</Text>
      <Text style={styles.bodyText}>
        This lets Curfy use Apple's own Screen Time system to lock the apps
        you choose — enforced by iOS itself, not just something inside
        this app.
      </Text>

      <View style={styles.trustCard}>
        <View style={styles.trustRow}>
          <Ionicons name="checkmark-circle" size={18} color={Colors.successGreen} />
          <Text style={styles.trustText}>Applies a real, iOS-level lock to apps you pick</Text>
        </View>
        <View style={styles.trustRow}>
          <Ionicons name="checkmark-circle" size={18} color={Colors.successGreen} />
          <Text style={styles.trustText}>Keeps working even if Curfy isn't open</Text>
        </View>
        <View style={[styles.trustRow, { marginTop: 4 }]}>
          <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          <Text style={styles.trustText}>Never sees your messages, browsing, or what's on screen</Text>
        </View>
      </View>

      {status === "authorized" ? (
        <View style={styles.grantedPill}>
          <Ionicons name="checkmark-circle" size={16} color={Colors.successGreen} />
          <Text style={styles.grantedText}>Access granted</Text>
        </View>
      ) : status === "denied" ? (
        <View style={styles.deniedWrap}>
          <TouchableOpacity onPress={handleEnable} style={styles.retryBtn}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
          <Text style={styles.deniedHint}>
            Screen Time permission is required to finish setup.
            If you denied access, update it in iOS Settings and retry.
          </Text>
        </View>
      ) : (
        <TouchableOpacity
          onPress={handleEnable}
          disabled={isRequesting}
          style={styles.enableBtn}
          activeOpacity={0.85}
        >
          {isRequesting ? (
            <ActivityIndicator color="#000814" />
          ) : (
            <Text style={styles.enableBtnText}>Enable Screen Time Access</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

function StepChooseApps({
  routine,
  start,
  end,
  blockMode,
  selectedCount,
  onSelect,
  onSelectionChange,
  selectionIssue,
}: {
  routine: ProtectionRoutine | null;
  start: string;
  end: string;
  blockMode: BlockModeId | null;
  selectedCount: number | null;
  onSelect: (m: BlockModeId) => void;
  onSelectionChange: (metadata: ActivitySelectionMetadata) => void;
  selectionIssue: FreeSelectionIssue | null;
}) {
  const [pickerMode, setPickerMode] = useState<BlockModeId | null>(null);

  const handlePick = (id: BlockModeId) => {
    onSelect(id);
    setPickerMode(id);
  };

  const handleSelectionChange = (
    event: NativeSyntheticEvent<ActivitySelectionMetadata>
  ) => {
    onSelectionChange(event.nativeEvent);
  };

  const activePreset = BLOCK_MODE_PRESETS.find((p) => p.id === pickerMode);

  return (
    <View style={styles.stepInner}>
      <Badge>CHOOSE WHAT TO BLOCK</Badge>
      <Text style={styles.hero}>What should{"\n"}stay off-limits?</Text>
      <Text style={styles.bodyText}>
        Choose one distracting app to shield during your chosen hours.
        Free protects one app. Multiple apps are planned for Premium.
      </Text>
      <View style={styles.trustCard}>
        <Text style={styles.featureTitle}>
          {routine === "morning" ? "Morning" : routine === "both" ? "Night + morning" : "Evening"} protection
        </Text>
        <Text style={styles.bodyText}>
          {protectionWindowLabel(start, end)} · every day
        </Text>
        <Text style={styles.fineprint}>
          Need temporary access? Open Curfy and hold for 120 uninterrupted seconds
          to request up to 15 minutes. Releasing early starts over.
        </Text>
      </View>

      <View style={{ gap: 10, marginTop: 4 }}>
        {BLOCK_MODE_PRESETS.filter((preset) => preset.id === "custom").map((preset) => {
          const isSelected = blockMode === preset.id;
          return (
            <TouchableOpacity
              key={preset.id}
              onPress={() => handlePick(preset.id)}
              activeOpacity={0.85}
              style={[styles.presetCard, isSelected && styles.presetCardSelected]}
            >
              <View style={[styles.presetIconWrap, isSelected && styles.presetIconWrapSelected]}>
                <Ionicons
                  name={preset.icon}
                  size={20}
                  color={isSelected ? Colors.primaryCyan : Colors.textMuted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.presetTitle}>{preset.title}</Text>
                <Text style={styles.presetDesc}>{preset.description}</Text>
              </View>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={22} color={Colors.primaryCyan} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {selectionIssue === "too-many-apps-or-categories" && (
        <View style={styles.selectionWarning}>
          <Text style={styles.selectionWarningTitle}>Start with one app</Text>
          <Text style={styles.fineprint}>
            Free protection covers one individual app. Return to Apple's picker
            and remove extra apps, categories and websites. Multi-app Premium
            requires an in-app purchase and isn't available yet.
          </Text>
        </View>
      )}

      {selectedCount !== null && blockMode && (
        <TouchableOpacity
          onPress={() => handlePick(blockMode)}
          style={styles.selectedChip}
        >
          <Text style={styles.selectedChipText}>
            {selectedCount === 1 ? "1 selection — tap to change" : `${selectedCount} selections — free protects one individual app`}
          </Text>
        </TouchableOpacity>
      )}

      {/* Apple's native picker sheet — mounted only while open, per the
          library's documented pattern. It's an invisible 1x1 anchor; the
          actual UI is presented natively by iOS itself. Persisted variant
          keyed by a stable per-preset id (see selectionIdForMode), so the
          same id can be referenced later by configureBedtimeBlocking's
          blockSelection/unblockSelection actions. */}
      {pickerMode && (
        <DeviceActivitySelectionSheetViewPersisted
          style={{ width: 1, height: 1, position: "absolute" }}
          familyActivitySelectionId={selectionIdForMode(pickerMode)}
          headerText={activePreset?.pickerHint}
          onSelectionChange={handleSelectionChange}
          onDismissRequest={() => {
            // Some iOS picker dismissals don't emit a final change event.
            // Re-read persisted opaque-token metadata before validating step 9.
            const metadata = activitySelectionMetadata({
              activitySelectionId: selectionIdForMode(pickerMode),
            });
            if (metadata) onSelectionChange(metadata);
            setPickerMode(null);
          }}
        />
      )}

      <Text style={styles.fineprint}>
        Choose exactly one individual app (no categories or websites).
        Apple's picker keeps app identities private; Curfy sees only opaque tokens and counts.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    height: 36,
    marginTop: 8,
    paddingHorizontal: 20,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: Colors.primaryCyan,
  },
  stepFlow: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  stepContent: { flex: 1 },
  // flexGrow (not flex) lets short steps stay vertically centered like
  // before, while tall ones (7-option list, 3 benefit cards) naturally
  // become scrollable instead of overflowing the screen or getting
  // covered by the fixed Continue button.
  stepScrollContent: { flexGrow: 1, justifyContent: "center", paddingBottom: 12 },
  stepInner: { gap: 16 },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: Colors.primaryCyan,
    fontSize: 10,
    fontFamily: Fonts.bold,
    letterSpacing: 2,
  },
  hero: {
    color: Colors.textPrimary,
    fontFamily: Fonts.bold,
    fontSize: 40,
    lineHeight: 48,
  },
  bodyText: {
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  // A short, forceful closing line (Wake Up Call step) — deliberately
  // brighter/heavier than bodyText, this is a statement, not a caption.
  featureTitle: { color: Colors.textPrimary, fontSize: 16, fontFamily: Fonts.semiBold, marginBottom: 2 },
  trustCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Layout.cardRadius,
    padding: 16,
    gap: 10,
    marginTop: 4,
  },
  trustRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  trustText: {
    flex: 1,
    color: Colors.textMuted,
    fontSize: 13,
    fontFamily: Fonts.regular,
    lineHeight: 18,
  },
  enableBtn: {
    backgroundColor: Colors.primaryCyan,
    borderRadius: Layout.buttonRadius,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  enableBtnText: {
    color: "#000814",
    fontFamily: Fonts.bold,
    fontSize: 15,
  },
  grantedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,255,157,0.1)",
    borderWidth: 1,
    borderColor: Colors.successGreen,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 4,
  },
  grantedText: {
    color: Colors.successGreen,
    fontFamily: Fonts.semiBold,
    fontSize: 13,
  },
  deniedWrap: { gap: 10, marginTop: 4 },
  retryBtn: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: Colors.primaryCyan,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  retryText: { color: Colors.primaryCyan, fontFamily: Fonts.semiBold, fontSize: 13 },
  deniedHint: { color: Colors.textMuted, fontSize: 12, fontFamily: Fonts.regular, lineHeight: 17 },
  presetCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Layout.cardRadius,
    padding: 14,
  },
  presetCardSelected: {
    borderColor: Colors.primaryCyan,
  },
  presetIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  presetIconWrapSelected: {
    backgroundColor: "rgba(0,229,255,0.1)",
  },
  presetTitle: { color: Colors.textPrimary, fontSize: 15, fontFamily: Fonts.semiBold, marginBottom: 2 },
  presetDesc: { color: Colors.textMuted, fontSize: 12.5, fontFamily: Fonts.regular, lineHeight: 17 },
  selectedChip: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,229,255,0.1)",
    borderWidth: 1,
    borderColor: Colors.primaryCyan,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginTop: 2,
  },
  selectedChipText: { color: Colors.primaryCyan, fontFamily: Fonts.semiBold, fontSize: 12.5 },
  selectionWarning: {
    padding: 12, borderWidth: 1, borderColor: Colors.warningAmber,
    borderRadius: 12, backgroundColor: "rgba(255,178,74,0.08)", gap: 4,
  },
  selectionWarningTitle: {
    color: Colors.warningAmber, fontFamily: Fonts.semiBold, fontSize: 13,
  },
  fineprint: {
    color: Colors.textGhost,
    fontSize: 11.5,
    fontFamily: Fonts.regular,
    lineHeight: 16,
    marginTop: 2,
  },
  btnWrap: { paddingBottom: 56 },
});

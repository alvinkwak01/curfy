import Btn from "@/components/Btn";
import { HoldRingPreview } from "@/components/HoldButton";
import { MoonGlyph } from "@/components/MoonGlyph";

import { StarBackground } from "@/components/StarBackground";
import { TimePicker } from "@/components/TimePicker";
import { clockLabel, protectionWindowLabel, inferRoutineFromStart } from "@/lib/protectionRoutine";
import { assertMonitorableBedtimeSchedule } from "@/lib/bedtimeWindow";
import { waitForPersistedPickerCommit } from "@/lib/pickerSettlement";
import { normalizeActivitySelectionMetadata, type IndividualAppSelectionMetadata } from "@/lib/premiumPolicy";
import { Colors, Fonts, Layout } from "@/constants/theme";
import { useSleep } from "@/context/SleepContext";
import {
  BlockModeId,
  ScreenTimeAuthStatus,
  configureBedtimeBlocking,
  freeSelectionIssueForMetadata,
  getScreenTimeAccessStatus,
  beginFreshOnboardingAppSelection,
  FreeSelectionIssue,
  requestScreenTimeAccess,
  selectionIdForMode,
  stopBedtimeBlocking,
} from "@/lib/screenTime";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ActivitySelectionMetadata,
  DeviceActivitySelectionSheetViewPersisted,
  activitySelectionMetadata,
} from "react-native-device-activity";
import { SafeAreaView } from "react-native-safe-area-context";

// Welcome is separate. Nine setup pages make ten screens total.
// Step 8 = original Curfy hold-ring preview; Step 9 = optional name and Finish.
const STEP_COUNT = 9;

function initialClockWindow(now = new Date()): { start: string; end: string } {
  const nextHour = ((now.getHours() + 1) % 24) * 60;
  const clock = (minutes: number) =>
    `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return { start: clock(nextHour), end: clock((nextHour + 120) % 1440) };
}

const REASON_OPTIONS: { id: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "social", label: "Social media scrolling", icon: "phone-portrait-outline" },
  { id: "video", label: "Watching videos", icon: "play-circle-outline" },
  { id: "chat", label: "Messages and group chats", icon: "chatbubble-ellipses-outline" },
  { id: "games", label: "Games", icon: "game-controller-outline" },
  { id: "browse", label: "Browsing out of habit", icon: "compass-outline" },
  { id: "work", label: "Work or school apps", icon: "briefcase-outline" },
  { id: "other", label: "Something else", icon: "ellipsis-horizontal-circle-outline" },
];

function reasonSummary(ids: string[]): string {
  const labels = ids
    .map(id => REASON_OPTIONS.find(option => option.id === id)?.label?.toLowerCase())
    .filter((label): label is string => Boolean(label))
    .slice(0, 3);
  if (!labels.length) return "the distractions you want to limit";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return labels.join(" and ");
  return `${labels[0]}, ${labels[1]}, and ${labels[2]}`;
}



/** Counts from Apple\'s opaque app tokens, never names or app identities. */
function selectionCountsText(counts: IndividualAppSelectionMetadata): string {
  const apps = `${counts.applicationCount} ${counts.applicationCount === 1 ? "app" : "apps"}`;
  const categories = `${counts.categoryCount} ${counts.categoryCount === 1 ? "category" : "categories"}`;
  const websites = `${counts.webDomainCount} ${counts.webDomainCount === 1 ? "website" : "websites"}`;
  return `${apps}, ${categories} and ${websites}`;
}

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
    setUserName,
    completeOnboarding,
  } = useSleep();
  // Restore the original branded first impression, including after Delete Everything.
  const [showWelcome, setShowWelcome] = useState(true);
  const [step, setStep] = useState(0);
  const [reasons, setReasons] = useState<string[]>([]);
  const [name, setName] = useState("");
  const firstPickerOpened = useRef(false);
  const pendingPickerCommit = useRef<Promise<void> | null>(null);
  // These clock positions are based on the user's current time, not bedtime advice.
  const [firstWindow] = useState(() => initialClockWindow());
  const [localBedtime, setLocalBedtime] = useState(firstWindow.start);
  const [localWakeTime, setLocalWakeTime] = useState(firstWindow.end);
  const [screenTimeStatus, setScreenTimeStatus] =
    useState<ScreenTimeAuthStatus>("notDetermined");
  const [blockMode, setBlockMode] = useState<BlockModeId | null>(null);
  const [selectedCount, setSelectedCount] = useState<number | null>(null);
  const [selectionIssue, setSelectionIssue] = useState<FreeSelectionIssue | null>("choose-one-app");
  // iOS Screen Time authorization survives deleting a Curfy account.
  // Check the actual device permission when the step becomes visible.
  useEffect(() => {
    if (step !== 5) return;
    try {
      setScreenTimeStatus(getScreenTimeAccessStatus());
    } catch (error) {
      console.warn("[Curfy] Screen Time status unavailable", error);
      setScreenTimeStatus("notDetermined");
    }
  }, [step]);
  const [finishing, setFinishing] = useState(false);
  const finishingRef = useRef(false);

  const next = async (skipName = false) => {
    if (step === 0 && reasons.length === 0) {
      Alert.alert("Choose a distraction", "Choose at least one reason to continue.");
      return;
    }
    if (step === 2) {
      try {
        assertMonitorableBedtimeSchedule(localBedtime, localWakeTime);
      } catch (error) {
        Alert.alert("Adjust the times",
          error instanceof Error ? error.message : "Choose a valid protection window.");
        return;
      }
    }
    if (step === 5) {
      let currentStatus: ScreenTimeAuthStatus;
      try {
        currentStatus = getScreenTimeAccessStatus();
      } catch {
        Alert.alert("Screen Time unavailable", "Curfy couldn't verify Screen Time permission. Try again.");
        return;
      }
      setScreenTimeStatus(currentStatus);
      if (currentStatus !== "authorized") {
        Alert.alert("Screen Time needed", "Grant access to protect your selected app.");
        return;
      }
    }
    if (step === 6) {
      // The native picker uses a 100ms debounced save. Never read/unmount
      // before its final selection has reached shared iOS storage.
      if (pendingPickerCommit.current) {
        try {
          await pendingPickerCommit.current;
        } catch (error) {
          Alert.alert("Couldn't save your selected app",
            error instanceof Error ? error.message : "Reopen Apple's picker and try again.");
          return;
        }
      }
      // Source of truth is the opaque native selection, not a possibly stale
      // onSelectionChange event. Never bypass the one-app Free restriction.
      let metadata: ActivitySelectionMetadata | null = null;
      try {
        metadata = blockMode ? activitySelectionMetadata({
          activitySelectionId: selectionIdForMode(blockMode),
        }) ?? null : null;
      } catch (error) {
        console.warn("[Curfy] Native picker read failed", error);
        Alert.alert("Can't verify your app yet",
          "Curfy couldn't read Apple's saved selection. Reopen the picker, keep one app selected, then try again.");
        return;
      }
      const issue = freeSelectionIssueForMetadata(metadata);
      const counts = normalizeActivitySelectionMetadata(metadata);
      setSelectionIssue(issue);
      setSelectedCount(counts
        ? counts.applicationCount + counts.categoryCount + counts.webDomainCount
        : null);
      if (!blockMode || issue) {
        const details = counts
          ? `${selectionCountsText(counts)} selected.`
          : metadata
            ? "Curfy couldn't verify the saved selection counts from iOS."
            : "Apple's picker hasn't saved a selection yet.";
        Alert.alert("Select one individual app",
          `${details}\nReopen Apple's picker and leave exactly one individual app checked. Categories and websites aren't supported.`);
        return;
      }
    }
    if (step < STEP_COUNT - 1) {
      setStep(step + 1);
      return;
    }
    if (!blockMode) {
      Alert.alert("Choose your app", "Select exactly one individual app first.");
      setStep(6);
      return;
    }
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    let nativeScheduleStarted = false;
    try {
      // Final native validation and monitoring are mandatory; no optimistic completion.
      await configureBedtimeBlocking({
        bedtime: localBedtime, wakeTime: localWakeTime, mode: blockMode,
      });
      nativeScheduleStarted = true;
      const routine = inferRoutineFromStart(localBedtime);
      await setBedtime(localBedtime, routine);
      await setWakeTime(localWakeTime);
      await persistBlockMode(blockMode);
      await setProtectionRoutine(routine);
      if (!skipName && name.trim()) await setUserName(name.trim());
      await completeOnboarding();
    } catch (error) {
      console.warn("[Curfy] Failed to finish onboarding", error);
      if (nativeScheduleStarted) {
        try {
          stopBedtimeBlocking();
        } catch (nativeStopError) {
          console.warn("[Curfy] Could not stop iOS protection during rollback", nativeStopError);
          Alert.alert("App protection may still be active",
            "Setup couldn't finish, and iOS didn't confirm that it stopped shielding your app. Retry setup, or revoke Curfy's Screen Time access in iPhone Settings to regain access.");
          return;
        }
      }
      Alert.alert("Setup couldn't finish",
        error instanceof Error ? error.message : "Please try saving again.");
    } finally {
      finishingRef.current = false;
      setFinishing(false);
    }
  };

  const back = () => {
    if (step === 0) setShowWelcome(true);
    else setStep(step - 1);
  };

  const isLastStep = step === STEP_COUNT - 1;
  // Leave Continue tappable so invalid selections get an explanation.
  const buttonDisabled = finishing;

  // Preserve the branded Welcome and nine approved setup steps.
  // The 120-second exception is explained, never falsely shown inside iOS's shield.
  const stepNode = (
    <>
      {step === 0 && <StepWhyStayUp reasons={reasons} onChange={setReasons} />}
      {step === 1 && <StepSetBedtime bedtime={localBedtime} onChange={setLocalBedtime} />}
      {step === 2 && <StepWakeTime wakeTime={localWakeTime} onChange={setLocalWakeTime} />}
      {step === 3 && <StepReveal reasons={reasons} goalBedtime={localBedtime} wakeTime={localWakeTime} />}
      {step === 4 && <StepWhyCurfy />}
      {step === 5 && <StepScreenTimeAccess status={screenTimeStatus} onStatusChange={setScreenTimeStatus} />}
      {step === 6 && (
        <StepChooseApps
          start={localBedtime}
          end={localWakeTime}
          blockMode={blockMode}
          selectedCount={selectedCount}
          onPickerCommit={promise => { pendingPickerCommit.current = promise; }}
          onSelect={(mode) => {
            if (!firstPickerOpened.current) {
              beginFreshOnboardingAppSelection(mode);
              firstPickerOpened.current = true;
            }
            setBlockMode(mode);
          }}
          selectionIssue={selectionIssue}
          onSelectionChange={(metadata) => {
            const counts = normalizeActivitySelectionMetadata(metadata);
            setSelectedCount(counts
              ? counts.applicationCount + counts.categoryCount + counts.webDomainCount
              : null);
            setSelectionIssue(freeSelectionIssueForMetadata(metadata));
          }}
        />
      )}
      {step === 7 && <StepHoldPreview />}
      {step === 8 && (
        <StepName name={name} onNameChange={setName}
          onSkip={() => { void next(true); }} disabled={finishing} />
      )}
    </>
  );

  if (showWelcome) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <StarBackground />
        <StepWelcome onStart={() => setShowWelcome(false)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <StarBackground />
      <View style={styles.header}>
        <TouchableOpacity onPress={back} hitSlop={12} accessibilityRole="button" accessibilityLabel={step === 0 ? "Back to welcome" : "Previous setup step"} style={styles.backControl}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <ProgressBar step={step} />
        <Text style={styles.stepCounter}>{step + 1} / {STEP_COUNT}</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.stepFlow}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {([1, 2].includes(step)) ? (
          <View key={step} style={styles.timeStepContent}>
            {stepNode}
          </View>
        ) : (
          <ScrollView
            key={step}
            style={styles.stepScroll}
            contentContainerStyle={styles.stepScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {stepNode}
          </ScrollView>
        )}
        <View style={styles.btnWrap}>
          <Btn
            label={isLastStep ? (finishing ? "Setting up..." : "Finish setup") : "Continue"}
            onPress={() => { void next(); }}
            disabled={buttonDisabled}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function StepWelcome({ onStart }: { onStart: () => void }) {
  return (
    <View style={styles.welcomeWrap}>
      <View style={styles.welcomeCenter}>
        <MoonGlyph size={86} />
        <Text style={styles.wordmark}>CURFY</Text>
        <Text style={styles.tagline}>Bedtime. For real.</Text>
        <Text style={styles.welcomeBody}>
          Protect one distracting app during your chosen hours.
          The rest of your phone stays yours.
        </Text>
      </View>
      <View style={styles.welcomeFooter}>
        <Btn label="Get Started" onPress={onStart} />
      </View>
    </View>
  );
}

function StepWhyStayUp({
  reasons,
  onChange,
}: {
  reasons: string[];
  onChange: (r: string[]) => void;
}) {
  const toggle = (id: string) => {
    if (reasons.includes(id)) {
      onChange(reasons.filter((r) => r !== id));
      return;
    }
    if (reasons.length >= 3) return;
    onChange([...reasons, id]);
  };

  return (
    <View style={styles.stepInner}>
      <Badge>SO, TELL US</Badge>
      <Text style={styles.hero}>What keeps you{"\n"}up at night?</Text>
      <Text style={styles.bodyText}>Pick up to 3 things you find yourself doing on your phone when you meant to put it down.</Text>

      <View style={{ gap: 10, marginTop: 4 }}>
        {REASON_OPTIONS.map((opt) => {
          const isSelected = reasons.includes(opt.id);
          const isMaxed = !isSelected && reasons.length >= 3;
          return (
            <TouchableOpacity
              key={opt.id}
              onPress={() => toggle(opt.id)}
              activeOpacity={0.85}
              disabled={isMaxed}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected, disabled: isMaxed }}
              accessibilityLabel={opt.label}
              style={[
                styles.presetCard,
                isSelected && styles.presetCardSelected,
                isMaxed && styles.presetCardDim,
              ]}
            >
              <View style={[styles.presetIconWrap, isSelected && styles.presetIconWrapSelected]}>
                <Ionicons
                  name={opt.icon}
                  size={18}
                  color={isSelected ? Colors.primaryCyan : Colors.textMuted}
                />
              </View>
              <Text style={[styles.presetTitle, { flex: 1, marginBottom: 0 }]}>{opt.label}</Text>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={20} color={Colors.primaryCyan} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function StepSetBedtime({ bedtime, onChange }: { bedtime: string; onChange: (v: string) => void }) {
  return (
    <View style={[styles.stepInner, { alignItems: "center" }]}>
      <Badge>START PROTECTING</Badge>
      <Text style={[styles.hero, { textAlign: "center" }]}>
        When should{"\n"}app protection start?
      </Text>
      <Text style={[styles.bodyText, { textAlign: "center" }]}>
        You decide. Curfy doesn't choose your bedtime.
      </Text>
      <View style={{ marginVertical: 16 }}>
        <TimePicker value={bedtime} onChange={onChange} digitSize={56} />
      </View>
      <Text style={[styles.bodyText, { textAlign: "center" }]}>
        Starts at {clockLabel(bedtime)}. You can change this later.
      </Text>
    </View>
  );
}

function StepWakeTime({ wakeTime, onChange }: { wakeTime: string; onChange: (v: string) => void }) {
  return (
    <View style={[styles.stepInner, { alignItems: "center" }]}>
      <Badge>AVAILABLE AGAIN</Badge>
      <Text style={[styles.hero, { textAlign: "center" }]}>
        When should the app{"\n"}be available again?
      </Text>
      <Text style={[styles.bodyText, { textAlign: "center" }]}>
        Choose the cutoff. Curfy doesn't need to know when you wake up.
      </Text>
      <View style={{ marginVertical: 16 }}>
        <TimePicker value={wakeTime} onChange={onChange} digitSize={56} />
      </View>
      <Text style={styles.timeConfirmation}>Available at {clockLabel(wakeTime)}</Text>
    </View>
  );
}

function StepReveal({
  reasons, goalBedtime, wakeTime,
}: {
  reasons: string[]; goalBedtime: string; wakeTime: string;
}) {
  return (
    <View style={styles.stepInner}>
      <Badge>YOUR PLAN</Badge>
      <Text style={styles.hero}>Your time.{"\n"}<Text style={styles.heroCyan}>Your boundaries.</Text></Text>
      <Text style={styles.bodyText}>
        You picked {reasonSummary(reasons)} as something that pulls you back to your phone.
        Curfy can make those moments more deliberate.
      </Text>
      <View style={styles.revealDivider} />
      <Text style={[styles.hero, { fontSize: 27, lineHeight: 35 }]}>
        {clockLabel(goalBedtime)}{" → "}{clockLabel(wakeTime)}
      </Text>
      <Text style={styles.bodyText}>
        The app you select will be shielded during this continuous daily window.
        If the end time is earlier, protection ends the next day.
      </Text>
    </View>
  );
}

function StepWhyCurfy() {
  const rows = [
    { icon: "shield-checkmark-outline" as const, title: "Your chosen app, not your whole phone", desc: "Curfy uses Apple's Screen Time controls to shield exactly the one app you select." },
    { icon: "finger-print-outline" as const, title: "An intentional 120-second escape", desc: "Open Curfy and hold continuously for two full minutes. Release early and the timer resets." },
    { icon: "time-outline" as const, title: "Up to 15 minutes of access", desc: "After the hold, the app is temporarily available. The shield is designed to return before your window ends." },
  ];
  return (
    <View style={styles.stepInner}>
      <Badge>WHY CURFY</Badge>
      <Text style={styles.hero}>Less impulse.{"\n"}<Text style={styles.heroCyan}>More intention.</Text></Text>
      <Text style={styles.bodyText}>A small pause between wanting to open an app and actually opening it.</Text>
      <View style={{ gap: 16, marginTop: 12 }}>
        {rows.map(row => (
          <View key={row.title} style={styles.featureRow}>
            <Ionicons name={row.icon} size={23} color={Colors.primaryCyan} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.featureTitle}>{row.title}</Text>
              <Text style={styles.featureDesc}>{row.desc}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Curfy's signature gesture, NOT Apple's separate app-blocking shield. */
function StepHoldPreview() {
  return (
    <View style={styles.holdIntro}>
      <Badge>THE CURFY HOLD</Badge>
      <Text style={styles.holdIntroHero}>
        Don't be pathetic.{"\n"}<Text style={styles.heroCyan}>Go to sleep.</Text>
      </Text>
      <Text style={styles.holdIntroBody}>
        If you insist on opening your protected app, you must hold this ring
        for 120 uninterrupted seconds.
      </Text>
      <View accessible accessibilityRole="image"
        accessibilityLabel="Preview of Curfy's minimalist circular 120-second hold button"
        style={styles.holdPreviewWrap}>
        <HoldRingPreview />
      </View>
      <Text style={styles.holdIntroHint}>
        Lift your finger early and the timer resets. This is a preview only;
        nothing unlocks here.
      </Text>
    </View>
  );
}

/** Separate, genuinely optional final setup page, without a shield preview. */
function StepName({ name, onNameChange, onSkip, disabled }: {
  name: string;
  onNameChange: (value: string) => void;
  onSkip: () => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.nameStep}>
      <Badge>ONE LAST THING</Badge>
      <Text style={styles.hero}>What should we{"\n"}call you?</Text>
      <Text style={styles.bodyText}>
        Optional. Make Curfy a little more personal, or skip this for now.
      </Text>
      <TextInput
        style={styles.nameInput}
        value={name}
        onChangeText={onNameChange}
        placeholder="Your name"
        placeholderTextColor={Colors.textGhost}
        autoCapitalize="words"
        returnKeyType="done"
        accessibilityLabel="Your name, optional"
      />
      <TouchableOpacity accessibilityRole="button"
        accessibilityLabel="Skip name and finish setup"
        disabled={disabled}
        onPress={onSkip}
        style={styles.nameSkip}>
        <Text style={styles.nameSkipText}>Skip for now</Text>
      </TouchableOpacity>
      <Text style={styles.nameNote}>
        Finish setup activates protection for your selected app.
        You can add or change your name later.
      </Text>
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
    try {
      const result = await requestScreenTimeAccess();
      onStatusChange(result);
    } catch (error) {
      console.warn("[Curfy] Screen Time request failed", error);
      Alert.alert("Screen Time unavailable", "Check Screen Time access in iPhone Settings and try again.");
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <View style={styles.stepInner}>
      <Badge>SCREEN TIME ACCESS</Badge>
      <Text style={styles.hero}>Allow Screen Time access</Text>
      <Text style={styles.bodyText}>
        This lets Curfy use Apple's Screen Time system to shield the app
        you choose — enforced by iOS, even when Curfy isn't open.
      </Text>

      <View style={styles.trustCard}>
        <View style={styles.trustRow}>
          <Ionicons name="checkmark-circle" size={18} color={Colors.successGreen} />
          <Text style={styles.trustText}>Shields the one app you choose through iOS</Text>
        </View>
        <View style={styles.trustRow}>
          <Ionicons name="checkmark-circle" size={18} color={Colors.successGreen} />
          <Text style={styles.trustText}>Keeps protection scheduled even when Curfy is closed</Text>
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
  start,
  end,
  blockMode,
  selectedCount,
  onSelect,
  onSelectionChange,
  onPickerCommit,
  selectionIssue,
}: {
  start: string;
  end: string;
  blockMode: BlockModeId | null;
  selectedCount: number | null;
  onSelect: (m: BlockModeId) => void;
  onSelectionChange: (metadata: ActivitySelectionMetadata) => void;
  onPickerCommit: (promise: Promise<void> | null) => void;
  selectionIssue: FreeSelectionIssue | null;
}) {
  const [pickerMode, setPickerMode] = useState<BlockModeId | null>(null);
  const pickerIsClosing = useRef(false);
  const sawNativeSelectionEvent = useRef(false);

  const handlePick = (id: BlockModeId) => {
    try {
      sawNativeSelectionEvent.current = false;
      pickerIsClosing.current = false;
      onPickerCommit(null);
      onSelect(id);
      setPickerMode(id);
    } catch (error) {
      Alert.alert("Couldn't open the app picker",
        error instanceof Error ? error.message : "Please try again.");
    }
  };

  const handleSelectionChange = (
    event: NativeSyntheticEvent<ActivitySelectionMetadata>
  ) => {
    // The native persisted picker emits this only AFTER saving opaque tokens.
    sawNativeSelectionEvent.current = true;
    onSelectionChange(event.nativeEvent);
  };

  return (
    <View style={styles.stepInner}>
      <Badge>CHOOSE WHAT TO BLOCK</Badge>
      <Text style={styles.hero}>Choose one app to protect</Text>
      <Text style={styles.bodyText}>
        Free protects one app. Apple's picker may let you select several, but
        Curfy only accepts one individual app. You can change it in Settings.
      </Text>
      <View style={styles.trustCard}>
        <Text style={styles.featureTitle}>
          Your protection hours
        </Text>
        <Text style={styles.bodyText}>
          {protectionWindowLabel(start, end)} · every day
        </Text>

      </View>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ disabled: false }}
        accessibilityHint="Opens Apple's private app picker. Free protection accepts one app."
        accessibilityLabel={selectionIssue === null && selectedCount === 1 ? "Change selected app" : "Choose one app"}
        onPress={() => handlePick("custom")}
        activeOpacity={0.85}
        style={[styles.presetCard, blockMode === "custom" && selectionIssue === null && styles.presetCardSelected]}
      >
        <View style={styles.presetIconWrap}>
          <Ionicons name="apps-outline" size={22} color={Colors.primaryCyan} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.presetTitle}>
            {selectionIssue === null && selectedCount === 1 ? "Change protected app" : "Choose one app"}
          </Text>
          <Text style={styles.presetDesc}>
            {selectionIssue === null && selectedCount === 1
              ? "One app selected. Tap to change it."
              : "Open Apple's app picker to select one app."}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.primaryCyan} />
      </TouchableOpacity>

      {selectionIssue === "too-many-apps-or-categories" && (
        <View style={styles.selectionWarning}>
          <Text style={styles.selectionWarningTitle}>Start with one app</Text>
          <Text style={styles.fineprint}>
            Free protection covers one individual app. Return to Apple's picker
            and remove extra apps, categories and websites. Multiple app selections aren't available in Free.
          </Text>
        </View>
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
          includeEntireCategory={false}
          headerText="Choose exactly one app to protect"
          footerText="Free: one individual app. Multiple apps or categories can't be accepted."
          onSelectionChange={handleSelectionChange}
          onDismissRequest={() => {
            if (pickerIsClosing.current) return;
            pickerIsClosing.current = true;
            const closingMode = pickerMode;
            const commit = (async () => {
              // v0.6.1 uses a 100ms Combine debounce for its native selection
              // write. Keep the native view mounted until that write can run.
              await waitForPersistedPickerCommit(
                () => sawNativeSelectionEvent.current,
              );
              const metadata = activitySelectionMetadata({
                activitySelectionId: selectionIdForMode(closingMode),
              });
              if (metadata) {
                onSelectionChange(metadata);
                if (freeSelectionIssueForMetadata(metadata) === "too-many-apps-or-categories") {
                  // Apple's native FamilyActivityPicker has no Free-tier max
                  // selection control. Reject extras promptly on sheet close;
                  // native scheduling independently validates the saved tokens.
                  const counts = normalizeActivitySelectionMetadata(metadata);
                  Alert.alert("Free protects one app",
                    counts
                      ? `Apple's picker saved ${selectionCountsText(counts)}. Reopen it and leave exactly one individual app checked.`
                      : "iOS didn't return valid selection counts. Reopen Apple's picker and choose one individual app.");
                }
              }
            })();
            // If Continue is tapped immediately, it awaits the SAME commit.
            onPickerCommit(commit);
            void commit.catch(error => {
              console.warn("[Curfy] Native picker save/metadata unavailable", error);
              Alert.alert("Selection wasn't confirmed",
                "Curfy couldn't verify Apple's saved app choice. Reopen the picker and try again.");
            }).finally(() => {
              setPickerMode(null);
              pickerIsClosing.current = false;
            });
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
    marginTop: 12,
    paddingHorizontal: 24,
    flexShrink: 0,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.border,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: Colors.primaryCyan,
  },
  backControl: {
    width: 26,
    height: 36,
    justifyContent: "center",
  },
  stepCounter: {
    color: "#A1A1BD",
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    letterSpacing: 1,
    minWidth: 36,
    textAlign: "right",
  },
  stepFlow: {
    flex: 1,
    paddingHorizontal: 24,
  },
  stepScroll: { flex: 1 },
  // Keep the progress header pinned above all onboarding content.
  // A scrollable page owns its height; it must never overlap the header.
  stepScrollContent: { flexGrow: 1, paddingTop: 30, paddingBottom: 32 },
  stepInner: { gap: 14 },
  welcomeWrap: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: "space-between",
  },
  welcomeCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 28,
  },
  wordmark: {
    color: Colors.textPrimary,
    fontFamily: Fonts.bold,
    fontSize: 48,
    letterSpacing: 5,
    marginTop: -4,
  },
  tagline: {
    color: Colors.primaryCyan,
    fontFamily: Fonts.semiBold,
    fontSize: 18,
    marginTop: 6,
  },
  welcomeBody: {
    color: "#B0B0D2",
    fontFamily: Fonts.regular,
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
    maxWidth: 340,
    marginTop: 28,
  },
  welcomeFooter: { paddingBottom: 22 },
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
    fontSize: 34,
    lineHeight: 41,
  },
  bodyText: {
    color: "#B0B0D2",
    fontFamily: Fonts.regular,
    fontSize: 15,
    lineHeight: 23,
  },
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
    color: "#B0B0D2",
    fontSize: 13,
    fontFamily: Fonts.regular,
    lineHeight: 19,
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
  presetDesc: { color: "#A6A6C5", fontSize: 13, fontFamily: Fonts.regular, lineHeight: 19 },
  timeConfirmation: {
    color: Colors.textPrimary,
    fontFamily: Fonts.semiBold,
    fontSize: 16,
    lineHeight: 23,
    textAlign: "center",
  },
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
    color: "#8F8FB3",
    fontSize: 12,
    fontFamily: Fonts.regular,
    lineHeight: 18,
    marginTop: 2,
  },
  btnWrap: { paddingTop: 12, paddingBottom: 20 },
  heroCyan: {
    color: Colors.primaryCyan,
  },
  heroDanger: {
    color: Colors.dangerRed,
  },
  revealDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  presetCardDim: {
    opacity: 0.4,
  },
  featureRow: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  featureIcon: { color: Colors.primaryCyan, fontSize: 20, marginTop: 2 },
  featureDesc: { color: Colors.textMuted, fontSize: 14, fontFamily: Fonts.regular, lineHeight: 20 },
  benefitCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Layout.cardRadius,
    padding: 16,
  },
  benefitTitle: { color: Colors.textPrimary, fontSize: 15, fontFamily: Fonts.semiBold, marginBottom: 4, lineHeight: 20 },
  benefitBody: { color: Colors.textMuted, fontSize: 13, fontFamily: Fonts.regular, lineHeight: 18, marginBottom: 6 },
  // Preview uses HoldButton's exact minimalist geometry/center.
  // No halo, decorative moon or fake Apple shield.
  holdIntro: { gap: 18, alignItems: "center" },
  holdIntroHero: {
    color: Colors.textPrimary, fontFamily: Fonts.bold,
    fontSize: 32, lineHeight: 39, textAlign: "center",
  },
  holdIntroBody: {
    color: "#B0B0D2", fontFamily: Fonts.regular,
    fontSize: 15, lineHeight: 23, textAlign: "center",
  },
  holdPreviewWrap: {
    alignItems: "center", justifyContent: "center",
    marginTop: 7, marginBottom: 3,
  },
  holdIntroHint: {
    color: Colors.textMuted, fontFamily: Fonts.regular,
    fontSize: 13, lineHeight: 20, textAlign: "center",
  },
  nameStep: { gap: 22 },
  nameInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 14,
    paddingHorizontal: 18, paddingVertical: 16,
    fontSize: 20, fontFamily: Fonts.medium,
    color: Colors.textPrimary, width: "100%", minHeight: 56,
  },
  nameSkip: {
    alignSelf: "center", paddingHorizontal: 20, paddingVertical: 10,
    minHeight: 44, justifyContent: "center",
  },
  nameSkipText: {
    color: Colors.primaryCyan, fontFamily: Fonts.semiBold, fontSize: 14,
  },
  nameNote: {
    color: Colors.textMuted, fontFamily: Fonts.regular,
    fontSize: 12, lineHeight: 19, textAlign: "center",
  },
  timeStepContent: { flex: 1, paddingTop: 22, paddingBottom: 12, justifyContent: "center" },

});

import Btn from "@/components/Btn";
import { MoonGlyph } from "@/components/MoonGlyph";

import { StarBackground } from "@/components/StarBackground";
import { TimePicker } from "@/components/TimePicker";
import { PROTECTION_ROUTINES, ProtectionRoutine, protectionWindowLabel, clockLabel, cutoffDayLabel } from "@/lib/protectionRoutine";
import { assertMonitorableBedtimeSchedule } from "@/lib/bedtimeWindow";
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

const STEP_COUNT = 13;

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function sleepDurationMinutes(bedtime: string, wake: string): number {
  const b = toMinutes(bedtime);
  const w = toMinutes(wake);
  return w > b ? w - b : 24 * 60 - b + w;
}

function formatDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatTime12(time: string): string {
  const [hStr, mStr] = time.split(":");
  let h = parseInt(hStr, 10);
  const period = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${mStr} ${period}`;
}

const REASON_OPTIONS: { id: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "social", label: "Doomscrolling social media", icon: "phone-portrait-outline" },
  { id: "video", label: "\"One more episode\"", icon: "play-circle-outline" },
  { id: "chat", label: "Texting or group chats", icon: "chatbubble-ellipses-outline" },
  { id: "games", label: "Games", icon: "game-controller-outline" },
  { id: "cant-sleep", label: "Can't fall asleep, so I pick up my phone", icon: "moon-outline" },
  { id: "work", label: "Catching up on work or school", icon: "briefcase-outline" },
  { id: "anxious", label: "Anxious thoughts, phone is the distraction", icon: "pulse-outline" },
];



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
  const [currentBedtime, setCurrentBedtime] = useState("00:30");
  const [name, setName] = useState("");
  const firstPickerOpened = useRef(false);
  const [routine, setRoutine] = useState<ProtectionRoutine | null>(null);
  const [localBedtime, setLocalBedtime] = useState("23:00");
  const [localWakeTime, setLocalWakeTime] = useState("06:00");
  const chooseRoutine = (selected: ProtectionRoutine) => {
    // This choice changes the narrative, NEVER the user's actual clock choices.
    setRoutine(selected);
  };
  const [screenTimeStatus, setScreenTimeStatus] =
    useState<ScreenTimeAuthStatus>("notDetermined");
  const [blockMode, setBlockMode] = useState<BlockModeId | null>(null);
  const [selectedCount, setSelectedCount] = useState<number | null>(null);
  const [selectionIssue, setSelectionIssue] = useState<FreeSelectionIssue | null>("choose-one-app");
  // iOS Screen Time authorization survives deleting a Curfy account.
  // Check the actual device permission when the step becomes visible.
  useEffect(() => {
    if (step !== 9) return;
    try {
      setScreenTimeStatus(getScreenTimeAccessStatus());
    } catch (error) {
      console.warn("[Curfy] Screen Time status unavailable", error);
      setScreenTimeStatus("notDetermined");
    }
  }, [step]);
  const [finishing, setFinishing] = useState(false);
  const finishingRef = useRef(false);

  const next = async () => {
    if (step === 1 && reasons.length === 0) {
      Alert.alert("Choose a distraction", "Choose at least one reason to continue.");
      return;
    }
    if (step === 2 && !routine) {
      Alert.alert("Choose your routine", "Select Evening, Morning or Both to continue.");
      return;
    }
    if (step === 5) {
      try {
        assertMonitorableBedtimeSchedule(localBedtime, localWakeTime);
      } catch (error) {
        Alert.alert("Adjust the times", error instanceof Error ? error.message : "Choose a valid protection window.");
        return;
      }
    }
    if (step === 9) {
      let currentStatus: ScreenTimeAuthStatus;
      try {
        currentStatus = getScreenTimeAccessStatus();
      } catch {
        Alert.alert("Screen Time unavailable", "Curfy couldn't verify Screen Time access. Try again.");
        return;
      }
      setScreenTimeStatus(currentStatus);
      if (currentStatus !== "authorized") {
        Alert.alert("Screen Time needed", "Grant Screen Time access so Curfy can shield your chosen app.");
        return;
      }
    }
    if (step === 10) {
      // Trust the committed native picker selection, not a stale event from
      // the last picker session or an old local React state.
      const metadata = blockMode ? activitySelectionMetadata({
        activitySelectionId: selectionIdForMode(blockMode),
      }) : null;
      const issue = freeSelectionIssueForMetadata(metadata);
      setSelectionIssue(issue);
      setSelectedCount(metadata ? metadata.applicationCount + metadata.categoryCount + metadata.webDomainCount : null);
      if (!blockMode || issue) {
        const details = metadata
          ? `${metadata.applicationCount} individual app(s), ${metadata.categoryCount} categories, ${metadata.webDomainCount} websites selected.`
          : "No app selection was saved.";
        Alert.alert("Choose exactly one app", `${details}\nOpen Apple's picker and remove any extra selections or categories.`);
        return;
      }
    }
    if (step < STEP_COUNT - 1) {
      setStep(step + 1);
      return;
    }
    if (!blockMode || !routine || !name.trim()) {
      Alert.alert("Finish setup", "Choose a routine, one individual app and a name first.");
      return;
    }
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    let nativeScheduleStarted = false;
    try {
      await configureBedtimeBlocking({
        bedtime: localBedtime,
        wakeTime: localWakeTime,
        mode: blockMode,
      });
      nativeScheduleStarted = true;
      // Never mark onboarding complete until all local settings exist.
      // The user must be able to reach Curfy Home's 120s escape screen
      // whenever an OS-level schedule may already be running.
      await setBedtime(localBedtime, routine);
      await setWakeTime(localWakeTime);
      await persistBlockMode(blockMode);
      await setProtectionRoutine(routine);
      await setUserName(name.trim());
      await completeOnboarding();
    } catch (error) {
      console.warn("[Curfy] Failed to finish onboarding", error);
      if (nativeScheduleStarted) {
        try {
          stopBedtimeBlocking();
        } catch (nativeStopError) {
          console.warn("[Curfy] Onboarding rollback could not stop iOS", nativeStopError);
          Alert.alert(
            "App protection may still be active",
            "Setup couldn't finish, and iOS did not confirm it stopped shielding your app. Retry setup, or revoke Curfy's Screen Time access in iPhone Settings to regain access."
          );
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
  const buttonDisabled = finishing || (isLastStep && !name.trim());

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
        {([3, 4, 5].includes(step)) ? (
          <View key={step} style={styles.timeStepContent}>

          {step === 0 && <StepWakeUpCall />}
          {step === 1 && <StepWhyStayUp reasons={reasons} onChange={setReasons} />}
          {step === 2 && <StepRoutine routine={routine} onChange={chooseRoutine} />}
          {step === 3 && <StepCurrentBedtime bedtime={currentBedtime} onChange={setCurrentBedtime} />}
          {step === 4 && <StepSetBedtime bedtime={localBedtime} onChange={setLocalBedtime} />}
          {step === 5 && <StepWakeTime wakeTime={localWakeTime} onChange={setLocalWakeTime} />}
          {step === 6 && <StepReveal currentBedtime={currentBedtime} goalBedtime={localBedtime} wakeTime={localWakeTime} />}
          {step === 7 && <StepBenefits />}
          {step === 8 && <StepHowItWorks />}
          {step === 9 && <StepScreenTimeAccess status={screenTimeStatus} onStatusChange={setScreenTimeStatus} />}
          {step === 10 && (
            <StepChooseApps
              routine={routine}
              start={localBedtime}
              end={localWakeTime}
              blockMode={blockMode}
              selectedCount={selectedCount}
              onSelect={(mode) => {
                try {
                  if (!firstPickerOpened.current) {
                    beginFreshOnboardingAppSelection(mode);
                    firstPickerOpened.current = true;
                  }
                  setBlockMode(mode);
                } catch (error) {
                  throw error;
                }
              }}
              selectionIssue={selectionIssue}
              onSelectionChange={(metadata) => {
                setSelectedCount(metadata.applicationCount + metadata.categoryCount + metadata.webDomainCount);
                setSelectionIssue(freeSelectionIssueForMetadata(metadata));
              }}
            />
          )}
          {step === 11 && <StepPreview bedtime={localBedtime} wakeTime={localWakeTime} />}
          {step === 12 && <StepName name={name} onChange={setName} />}
          </View>
        ) : (
          <ScrollView
            key={step}
            style={styles.stepScroll}
            contentContainerStyle={styles.stepScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >

          {step === 0 && <StepWakeUpCall />}
          {step === 1 && <StepWhyStayUp reasons={reasons} onChange={setReasons} />}
          {step === 2 && <StepRoutine routine={routine} onChange={chooseRoutine} />}
          {step === 3 && <StepCurrentBedtime bedtime={currentBedtime} onChange={setCurrentBedtime} />}
          {step === 4 && <StepSetBedtime bedtime={localBedtime} onChange={setLocalBedtime} />}
          {step === 5 && <StepWakeTime wakeTime={localWakeTime} onChange={setLocalWakeTime} />}
          {step === 6 && <StepReveal currentBedtime={currentBedtime} goalBedtime={localBedtime} wakeTime={localWakeTime} />}
          {step === 7 && <StepBenefits />}
          {step === 8 && <StepHowItWorks />}
          {step === 9 && <StepScreenTimeAccess status={screenTimeStatus} onStatusChange={setScreenTimeStatus} />}
          {step === 10 && (
            <StepChooseApps
              routine={routine}
              start={localBedtime}
              end={localWakeTime}
              blockMode={blockMode}
              selectedCount={selectedCount}
              onSelect={(mode) => {
                try {
                  if (!firstPickerOpened.current) {
                    beginFreshOnboardingAppSelection(mode);
                    firstPickerOpened.current = true;
                  }
                  setBlockMode(mode);
                } catch (error) {
                  Alert.alert("Can't reset the app picker", error instanceof Error ? error.message : "Try again.");
                  throw error;
                }
              }}
              selectionIssue={selectionIssue}
              onSelectionChange={(metadata) => {
                setSelectedCount(metadata.applicationCount + metadata.categoryCount + metadata.webDomainCount);
                setSelectionIssue(freeSelectionIssueForMetadata(metadata));
              }}
            />
          )}
          {step === 11 && <StepPreview bedtime={localBedtime} wakeTime={localWakeTime} />}
          {step === 12 && <StepName name={name} onChange={setName} />}
          </ScrollView>
        )}
        <View style={styles.btnWrap}>
          <Btn
            label={isLastStep ? (finishing ? "Setting up..." : "Finish setup") : "Continue"}
            onPress={next}
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

function StepWakeUpCall() {
  return (
    <View style={styles.stepInner}>
      <Badge>WAKE UP CALL</Badge>
      <Text style={styles.hero}>
        Your phone{"\n"}doesn't have{"\n"}
        <Text style={styles.heroCyan}>a bedtime.</Text>
      </Text>
      <Text style={[styles.hero, styles.heroCyan]}>You do.</Text>
      <Text style={styles.statement}>
        Make room for the evening you want.
      </Text>
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
      <Text style={styles.hero}>What keeps{"\n"}you up?</Text>
      <Text style={styles.bodyText}>Choose up to 3. This doesn't change which apps are blocked.</Text>

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

function StepCurrentBedtime({ bedtime, onChange }: { bedtime: string; onChange: (v: string) => void }) {
  return (
    <View style={[styles.stepInner, { alignItems: "center" }]}>
      <Badge>YOUR CURRENT HABIT</Badge>
      <Text style={[styles.hero, { textAlign: "center" }]}>
        When do you usually{"\n"}reach for your apps?
      </Text>
      <Text style={[styles.bodyText, { textAlign: "center" }]}>
        Just your estimate, not tracked usage. This doesn't set your schedule.
      </Text>
      <View style={{ marginVertical: 16 }}>
        <TimePicker value={bedtime} onChange={onChange} digitSize={56} />
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
  currentBedtime, goalBedtime, wakeTime,
}: {
  currentBedtime: string; goalBedtime: string; wakeTime: string;
}) {
  return (
    <View style={styles.stepInner}>
      <Badge>YOUR PLAN</Badge>
      <Text style={styles.hero}>
        Your hours.{"\n"}
        <Text style={styles.heroCyan}>Your boundaries.</Text>
      </Text>
      <Text style={styles.bodyText}>
        You usually reach for distracting apps around {formatTime12(currentBedtime)}.
        You chose to start protection at {formatTime12(goalBedtime)}.
      </Text>
      <View style={styles.revealDivider} />
      <Text style={[styles.hero, { fontSize: 27, lineHeight: 35 }]}>
        {formatTime12(goalBedtime)}{" → "}{formatTime12(wakeTime)}
      </Text>
      <Text style={styles.bodyText}>
        Your selected app is scheduled for protection during those hours.
        Curfy doesn't track sleep or measure how much time you save.
      </Text>
    </View>
  );
}

function StepBenefits() {
  const cards = [
    {
      icon: "moon-outline" as const,
      title: "Keep your chosen hours yours.",
      body: "Select the app that distracts you. The rest of your iPhone remains available.",
    },
    {
      icon: "shield-checkmark-outline" as const,
      title: "A real iOS restriction.",
      body: "Curfy uses Apple's Screen Time APIs, which can shield apps while Curfy is closed.",
    },
    {
      icon: "hourglass-outline" as const,
      title: "Make exceptions deliberate.",
      body: "Need access? A continuous 120-second hold in Curfy allows up to 15 minutes before protection returns.",
    },
  ];
  return (
    <View style={styles.stepInner}>
      <Badge>WHY IT MATTERS</Badge>
      <Text style={styles.hero}>Fewer{"\n"}automatic{"\n"}detours.</Text>
      <View style={{ gap: 10, marginTop: 4 }}>
        {cards.map(c => (
          <View key={c.title} style={styles.benefitCard}>
            <Ionicons name={c.icon} size={20} color={Colors.primaryCyan} style={{ marginBottom: 8 }} />
            <Text style={styles.benefitTitle}>{c.title}</Text>
            <Text style={styles.benefitBody}>{c.body}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function StepHowItWorks() {
  const rows = [
    { icon: "◉", title: "You choose what's blocked", desc: "Pick the apps that keep you up. We lock those, at your bedtime, every night." },
    { icon: "◎", title: "120-second escape", desc: "Tap a blocked app and it's held behind Apple's own lock screen. Hold a button for 2 full minutes to get through." },
    { icon: "○", title: "Repeating every 15 min", desc: "Get in anyway? It locks back up 15 minutes later. And it remembers." },
  ];
  return (
    <View style={styles.stepInner}>
      <Badge>HOW IT WORKS</Badge>
      <Text style={styles.hero}>We lock the{"\n"}apps.{"\n"}<Text style={styles.heroCyan}>Not the phone.</Text></Text>
      <View style={{ gap: 20, marginTop: 8 }}>
        {rows.map((r) => (
          <View key={r.title} style={styles.featureRow}>
            <Text style={styles.featureIcon}>{r.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.featureTitle}>{r.title}</Text>
              <Text style={styles.featureDesc}>{r.desc}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function StepPreview({ bedtime, wakeTime }: { bedtime: string; wakeTime: string }) {
  return (
    <View style={styles.stepInner}>
      <Badge>WHAT IT LOOKS LIKE</Badge>
      <Text style={styles.hero}>Here's the{"\n"}moment it{"\n"}matters.</Text>
      <Text style={styles.bodyText}>
        At {formatTime12(bedtime)}, opening a blocked app looks like this —
        Apple's own lock screen, not something you can swipe away.
      </Text>

      <View style={styles.phoneFrame}>
        <View style={styles.phoneNotch} />
        <View style={styles.phoneShieldIcon}>
          <Ionicons name="shield-checkmark" size={34} color={Colors.textMuted} />
        </View>
        <Text style={styles.phoneShieldTitle}>Blocked by Curfy</Text>
        <Text style={styles.phoneShieldSub}>Locked until {formatTime12(wakeTime)}</Text>
        <View style={styles.phoneHoldBtn}>
          <Text style={styles.phoneHoldBtnText}>Hold 120s to unlock</Text>
        </View>
      </View>
    </View>
  );
}

function StepName({ name, onChange }: { name: string; onChange: (v: string) => void }) {
  return (
    <View style={[styles.stepInner, { alignItems: "center" }]}>
      <Badge>ALMOST READY</Badge>
      <Text style={[styles.hero, { textAlign: "center" }]}>
        What should{"\n"}we call you?
      </Text>
      <Text style={[styles.bodyText, { textAlign: "center" }]}>
        For your Curfy activity log and profile.
      </Text>
      <TextInput
        style={styles.nameInput}
        value={name}
        onChangeText={onChange}
        placeholder="Your name"
        placeholderTextColor={Colors.textGhost}
        autoFocus
      />
    </View>
  );
}

function StepRoutine({ routine, onChange }: {
  routine: ProtectionRoutine | null; onChange: (value: ProtectionRoutine) => void;
}) {
  return (
    <View style={styles.stepInner}>
      <Badge>YOUR ROUTINE</Badge>
      <Text style={[styles.hero, styles.routineHero]}>When do you want fewer distractions?</Text>
      <Text style={styles.bodyText}>Choose the part of your day. You decide the exact hours later.</Text>
      <View style={{ gap: 12, marginTop: 8 }}>
        {PROTECTION_ROUTINES.map((option) => {
          const selected = option.id === routine;
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
              </View>
              {selected && <Ionicons name="checkmark-circle" size={22} color={Colors.primaryCyan} />}
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.fineprint}>This chooses the setup style. It does not set your bedtime or wake-up time.</Text>
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
          <Text style={styles.trustText}>Can protect your app even when Curfy isn't open</Text>
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
    try {
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
    onSelectionChange(event.nativeEvent);
  };

  return (
    <View style={styles.stepInner}>
      <Badge>CHOOSE WHAT TO BLOCK</Badge>
      <Text style={styles.hero}>Choose one app to protect</Text>
      <Text style={styles.bodyText}>
        Free protects one app. Choose it with Apple's private app picker.
        You can change it later in Settings.
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

      <TouchableOpacity
        accessibilityRole="button"
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
            and remove extra apps, categories and websites. Multi-app Premium
            requires an in-app purchase and isn't available yet.
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
          footerText="Choose one individual app, not a category."
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
  routineHero: {
    fontSize: 31,
    lineHeight: 38,
  },
  bodyText: {
    color: "#B0B0D2",
    fontFamily: Fonts.regular,
    fontSize: 15,
    lineHeight: 23,
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
  statement: {
    color: Colors.textPrimary,
    fontFamily: Fonts.semiBold,
    fontSize: 17,
    marginTop: 8,
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
  phoneFrame: {
    alignSelf: "center",
    width: 200,
    height: 280,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: "center",
    paddingTop: 36,
    paddingHorizontal: 18,
    marginTop: 8,
  },
  phoneNotch: {
    position: "absolute",
    top: 10,
    width: 60,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.background,
  },
  phoneShieldIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  phoneShieldTitle: {
    color: Colors.textPrimary,
    fontFamily: Fonts.semiBold,
    fontSize: 15,
    textAlign: "center",
  },
  phoneShieldSub: {
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    fontSize: 12,
    marginTop: 4,
    marginBottom: 20,
    textAlign: "center",
  },
  phoneHoldBtn: {
    borderWidth: 1,
    borderColor: Colors.primaryCyan,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  phoneHoldBtnText: {
    color: Colors.primaryCyan,
    fontFamily: Fonts.semiBold,
    fontSize: 12,
  },
  nameInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 18,
    fontSize: 22,
    fontFamily: Fonts.medium,
    color: Colors.textPrimary,
    textAlign: "center",
    width: "100%",
  },
  timeStepContent: { flex: 1, paddingTop: 22, paddingBottom: 12, justifyContent: "center" },

});

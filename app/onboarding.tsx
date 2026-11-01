import Btn from "@/components/Btn";
import { MoonGlyph } from "@/components/MoonGlyph";
import { StarBackground } from "@/components/StarBackground";
import { TimePicker } from "@/components/TimePicker";
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
import React, { useState } from "react";
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
} from "react-native-device-activity";
import Animated, { SlideInRight, SlideOutLeft } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

const STEP_COUNT = 12;

// --- Time math shared by StepReveal --------------------------------------
// All self-reported (bedtime/wake questions the user answers here), not
// pulled from any device Screen Time data — that distinction matters, see
// CONTEXT.md §6c on why real per-app usage numbers aren't available to us.

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

// A continuous fill bar rather than one dot per step — with 12 steps,
// discrete dots either get too small to tap-target-adjacent or wrap onto a
// second line and collide with the badge below them. A bar scales cleanly
// regardless of step count.
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
    setUserName,
    completeOnboarding,
    bedtime,
  } = useSleep();
  const [showWelcome, setShowWelcome] = useState(true);
  const [step, setStep] = useState(0);
  const [reasons, setReasons] = useState<string[]>([]);
  const [currentBedtime, setCurrentBedtime] = useState("00:30");
  const [localBedtime, setLocalBedtime] = useState(bedtime || "23:00");
  const [localWakeTime, setLocalWakeTime] = useState("06:00");
  const [name, setName] = useState("");
  const [screenTimeStatus, setScreenTimeStatus] =
    useState<ScreenTimeAuthStatus>("notDetermined");
  const [blockMode, setBlockMode] = useState<BlockModeId | null>(null);
  const [selectedCount, setSelectedCount] = useState<number | null>(null);
  const [selectionIssue, setSelectionIssue] = useState<FreeSelectionIssue | null>("choose-one-app");

  const next = async () => {
    if (step === 9 && (selectionIssue || !blockMode)) {
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
    if (!blockMode) {
      Alert.alert("Choose an app", "Select an app to protect before finishing setup.");
      return;
    }
    try {
      await configureBedtimeBlocking({
        bedtime: localBedtime,
        wakeTime: localWakeTime,
        mode: blockMode,
      });
    } catch (error) {
      console.warn("[Curfy] Failed to schedule app shielding", error);
      Alert.alert(
        "App blocking isn't ready",
        error instanceof Error ? error.message : "Please try setting up app blocking again."
      );
      return;
    }
    // Only complete setup after the native schedule was accepted.
    await setBedtime(localBedtime);
    await setWakeTime(localWakeTime);
    await setUserName(name.trim());
    await persistBlockMode(blockMode);
    await completeOnboarding();
  };

  const back = () => {
    if (step === 0) {
      setShowWelcome(true);
      return;
    }
    setStep(step - 1);
  };

  const isLastStep = step === STEP_COUNT - 1;
  const buttonDisabled =
    (isLastStep && name.trim().length === 0) ||
    (step === 1 && reasons.length === 0) ||
    (step === 8 && screenTimeStatus === "notDetermined") ||
    (step === 9 && (!blockMode || selectionIssue !== null));

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
        <TouchableOpacity onPress={back} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={Colors.textMuted} />
        </TouchableOpacity>
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
                {step === 0 && <StepWakeUpCall />}
                {step === 1 && <StepWhyStayUp reasons={reasons} onChange={setReasons} />}
                {step === 2 && (
                  <StepCurrentBedtime bedtime={currentBedtime} onChange={setCurrentBedtime} />
                )}
                {step === 3 && (
                  <StepSetBedtime bedtime={localBedtime} onChange={setLocalBedtime} />
                )}
                {step === 4 && (
                  <StepWakeTime wakeTime={localWakeTime} onChange={setLocalWakeTime} />
                )}
                {step === 5 && (
                  <StepReveal
                    currentBedtime={currentBedtime}
                    goalBedtime={localBedtime}
                    wakeTime={localWakeTime}
                  />
                )}
                {step === 6 && <StepBenefits />}
                {step === 7 && <StepHowItWorks />}
                {step === 8 && (
                  <StepScreenTimeAccess
                    status={screenTimeStatus}
                    onStatusChange={setScreenTimeStatus}
                  />
                )}
                {step === 9 && (
                  <StepChooseApps
                    blockMode={blockMode}
                    selectedCount={selectedCount}
                    onSelect={setBlockMode}
                    selectionIssue={selectionIssue}
                    onSelectionChange={(metadata) => {
                      setSelectedCount(
                        metadata.applicationCount + metadata.categoryCount + metadata.webDomainCount
                      );
                      setSelectionIssue(freeSelectionIssueForMetadata(metadata));
                    }}
                  />
                )}
                {step === 10 && <StepPreview bedtime={localBedtime} wakeTime={localWakeTime} />}
                {step === 11 && <StepName name={name} onChange={setName} />}
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
            label={isLastStep ? "Begin" : "Continue"}
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
        <MoonGlyph size={90} />
        <Text style={styles.wordmark}>CURFY</Text>
        <Text style={styles.tagline}>Bedtime. For real.</Text>
        <Text style={styles.welcomeBody}>
          A bedtime boundary for the distracting app you select —
          and doesn't let you talk your way out of it.
        </Text>
      </View>
      <View style={styles.btnWrap}>
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
        Let's choose which app gets a bedtime boundary.
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
      <Text style={styles.bodyText}>Choose up to 3 reasons. Your answers stay here; they do not measure sleep.</Text>

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
      <Badge>BE HONEST</Badge>
      <Text style={[styles.hero, { textAlign: "center" }]}>
        What time do{"\n"}you actually{"\n"}fall asleep?
      </Text>
      <Text style={[styles.bodyText, { textAlign: "center" }]}>
        Not the time you plan to. The time it really happens.
      </Text>
      <View style={{ marginVertical: 16 }}>
        <TimePicker value={bedtime} onChange={onChange} digitSize={56} />
      </View>
    </View>
  );
}

function StepWakeTime({ wakeTime, onChange }: { wakeTime: string; onChange: (v: string) => void }) {
  return (
    <View style={[styles.stepInner, { alignItems: "center" }]}>
      <Badge>ALMOST THERE</Badge>
      <Text style={[styles.hero, { textAlign: "center" }]}>
        What time do{"\n"}you wake up?
      </Text>
      <Text style={[styles.bodyText, { textAlign: "center" }]}>
        Curfy uses this as the end of your protected-app window.
        The starting default is 6:00 a.m. You can change it here.
      </Text>
      <View style={{ marginVertical: 16 }}>
        <TimePicker value={wakeTime} onChange={onChange} digitSize={56} />
      </View>
    </View>
  );
}

function StepReveal({
  currentBedtime,
  goalBedtime,
  wakeTime,
}: {
  currentBedtime: string;
  goalBedtime: string;
  wakeTime: string;
}) {
  // These are configured clock times, NOT observed sleep or screen usage.
  const before = sleepDurationMinutes(currentBedtime, wakeTime);
  const after = sleepDurationMinutes(goalBedtime, wakeTime);
  const difference = after - before;
  return (
    <View style={styles.stepInner}>
      <Badge>YOUR PLAN</Badge>
      <Text style={styles.hero}>
        A boundary{"\n"}you actually{"\n"}
        <Text style={styles.heroCyan}>choose.</Text>
      </Text>
      <Text style={styles.bodyText}>
        From {formatTime12(goalBedtime)} to {formatTime12(wakeTime)},
        Curfy will protect your selected app. That's a{" "}
        {formatDuration(after)} restriction window each night.
      </Text>
      <View style={styles.revealDivider} />
      <Text style={[styles.hero, { fontSize: 27, lineHeight: 33 }]}>
        {difference > 0
          ? `${formatDuration(difference)} earlier than your current routine.`
          : "It's your boundary. Make it yours."}
      </Text>
      <Text style={styles.bodyText}>
        Those are planned app-restriction hours, not measured sleep.
        Curfy does not know when you fall asleep.
      </Text>
    </View>
  );
}

function StepBenefits() {
  const cards = [
    {
      icon: "shield-outline" as const,
      title: "Your apps, not your entire phone.",
      body: "Choose an individual app. At bedtime, iOS shows a shield over it while the rest of your phone stays available.",
    },
    {
      icon: "hand-left-outline" as const,
      title: "An escape that takes intention.",
      body: "If you want temporary access, open Curfy and hold the circle without letting go for two full minutes.",
    },
    {
      icon: "moon-outline" as const,
      title: "Back to your boundary.",
      body: "The exception is intended to last up to 15 minutes, then selected-app protection returns until your configured morning end time.",
    },
  ];
  return (
    <View style={styles.stepInner}>
      <Badge>WHY CURFY</Badge>
      <Text style={styles.hero}>A little more{"\n"}friction.{"\n"}
        <Text style={styles.heroCyan}>On purpose.</Text>
      </Text>
      <View style={{ gap: 10, marginTop: 4 }}>
        {cards.map((c) => (
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
    { icon: "◉", title: "One app is free", desc: "Choose one individual app to shield at your bedtime. Paid multi-app protection is not enabled yet." },
    { icon: "◎", title: "120-second escape", desc: "When an app is blocked, open Curfy from your Home Screen. Hold the circle for 2 uninterrupted minutes to request 15 minutes of access." },
    { icon: "○", title: "A short exception", desc: "A successful hold requests up to 15 minutes of access, ending sooner if your bedtime window ends." },
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
            You can also enable this later in Settings — Curfy just can't
            block anything until you do.
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
  blockMode,
  selectedCount,
  onSelect,
  onSelectionChange,
  selectionIssue,
}: {
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
        Choose one app that keeps pulling you back in at bedtime.
        You can change it in Settings. Multiple apps are planned for premium.
      </Text>

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
          onDismissRequest={() => setPickerMode(null)}
        />
      )}

      <Text style={styles.fineprint}>
        Choose exactly one individual app (no categories or websites).
        Apple's picker keeps app identities private; Curfy sees only opaque tokens and counts.
      </Text>
    </View>
  );
}

function StepSetBedtime({ bedtime, onChange }: { bedtime: string; onChange: (v: string) => void }) {
  return (
    <View style={[styles.stepInner, { alignItems: "center" }]}>
      <Badge>SET YOUR BEDTIME</Badge>
      <Text style={[styles.hero, { textAlign: "center" }]}>
        When should{"\n"}your app{"\n"}be shielded?
      </Text>
      <Text style={[styles.bodyText, { textAlign: "center" }]}>
        This is when the lock kicks in. Pick a time you know you should
        put your selected app away. Curfy doesn't measure your sleep.
      </Text>
      <View style={{ marginVertical: 16 }}>
        <TimePicker value={bedtime} onChange={onChange} digitSize={56} />
      </View>
      <Text style={[styles.bodyText, { textAlign: "center" }]}>
        You'll get a heads-up 10 and 2 minutes before.
      </Text>
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
        Apple's system shield. To use the 120-second hold, open Curfy separately.
      </Text>

      <View style={styles.phoneFrame}>
        <View style={styles.phoneNotch} />
        <View style={styles.phoneShieldIcon}>
          <Ionicons name="shield-checkmark" size={34} color={Colors.textMuted} />
        </View>
        <Text style={styles.phoneShieldTitle}>Blocked by Curfy</Text>
        <Text style={styles.phoneShieldSub}>To unlock, open Curfy from your Home Screen and hold for 120 seconds.</Text>
        <View style={styles.phoneHoldBtn}>
          <Text style={styles.phoneHoldBtnText}>Not now</Text>
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
        For your personal sleep log. Keep it honest.
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
  heroCyan: {
    color: Colors.primaryCyan,
  },
  heroDanger: {
    color: Colors.dangerRed,
  },
  // Soft, secondary description text (SetBedtime/Name steps).
  bodyText: {
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  // A short, forceful closing line (Wake Up Call step) — deliberately
  // brighter/heavier than bodyText, this is a statement, not a caption.
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
  statsRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  statValue: { color: Colors.primaryCyan, fontSize: 24, fontFamily: Fonts.bold },
  statLabel: { color: Colors.textMuted, fontSize: 11, fontFamily: Fonts.regular, textAlign: "center", marginTop: 4 },
  featureRow: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  featureIcon: { color: Colors.primaryCyan, fontSize: 20, marginTop: 2 },
  featureTitle: { color: Colors.textPrimary, fontSize: 16, fontFamily: Fonts.semiBold, marginBottom: 2 },
  featureDesc: { color: Colors.textMuted, fontSize: 14, fontFamily: Fonts.regular, lineHeight: 20 },
  quote: {
    color: Colors.textPrimary,
    fontFamily: Fonts.medium,
    fontSize: 15,
    fontStyle: "italic",
    textAlign: "center",
  },
  attribution: { color: Colors.textGhost, fontSize: 12, fontFamily: Fonts.regular, textAlign: "center" },
  benefitCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Layout.cardRadius,
    padding: 16,
  },
  benefitTitle: { color: Colors.textPrimary, fontSize: 15, fontFamily: Fonts.semiBold, marginBottom: 4, lineHeight: 20 },
  benefitBody: { color: Colors.textMuted, fontSize: 13, fontFamily: Fonts.regular, lineHeight: 18, marginBottom: 6 },
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
  presetCardDim: {
    opacity: 0.4,
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
  // Shared by every "Continue"/"Begin"/"Get Started" button so they all
  // sit at the same height regardless of which step is showing.
  btnWrap: { paddingBottom: 56 },
  welcomeWrap: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    justifyContent: "space-between",
  },
  welcomeCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  wordmark: {
    color: Colors.primaryCyan,
    fontFamily: Fonts.bold,
    fontSize: 34,
    letterSpacing: 8,
    marginTop: 8,
  },
  tagline: {
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    fontSize: 14,
    letterSpacing: 1,
  },
  welcomeBody: {
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 12,
    maxWidth: 280,
  },
});

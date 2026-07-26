import Btn from "@/components/Btn";
import { MoonGlyph } from "@/components/MoonGlyph";
import { StarBackground } from "@/components/StarBackground";
import { TimePicker } from "@/components/TimePicker";
import { Colors, Fonts } from "@/constants/theme";
import { useSleep } from "@/context/SleepContext";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { SlideInRight, SlideOutLeft } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

const STEP_COUNT = 4;

function ProgressDots({ step }: { step: number }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: STEP_COUNT }).map((_, i) => (
        <View
          key={i}
          style={[styles.dot, i === step && styles.dotActive]}
        />
      ))}
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
  const { setBedtime, setUserName, completeOnboarding, bedtime } = useSleep();
  const [showWelcome, setShowWelcome] = useState(true);
  const [step, setStep] = useState(0);
  const [localBedtime, setLocalBedtime] = useState(bedtime || "23:00");
  const [name, setName] = useState("");

  const next = async () => {
    if (step < STEP_COUNT - 1) {
      setStep(step + 1);
      return;
    }
    await setBedtime(localBedtime);
    await setUserName(name.trim());
    await completeOnboarding();
  };

  const isLastStep = step === STEP_COUNT - 1;
  const buttonDisabled = isLastStep && name.trim().length === 0;

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
      <ProgressDots step={step} />

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
          {step === 0 && <StepWakeUpCall />}
          {step === 1 && <StepHowItWorks />}
          {step === 2 && (
            <StepSetBedtime bedtime={localBedtime} onChange={setLocalBedtime} />
          )}
          {step === 3 && <StepName name={name} onChange={setName} />}
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
          A sleep guardian that locks your phone at bedtime — and doesn't
          let you talk your way out of it.
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

      <View style={styles.statsRow}>
        {[
          { value: "2.4h", label: "avg lost per night" },
          { value: "23%", label: "less focused next day" },
          { value: "6yr", label: "avg life years lost" },
        ].map((s) => (
          <View key={s.label} style={styles.statCard}>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.statement}>Don't let your phone own you.</Text>
    </View>
  );
}

function StepHowItWorks() {
  const rows = [
    { icon: "◉", title: "Bedtime lock", desc: "Your phone locks at your bedtime. Every night." },
    { icon: "◎", title: "120-second escape", desc: "Hold a button for 2 full minutes to unlock. It's designed to be annoying." },
    { icon: "○", title: "Repeating every 15 min", desc: "Tried to escape? It comes back. And it remembers." },
  ];
  return (
    <View style={styles.stepInner}>
      <Badge>HOW IT WORKS</Badge>
      <Text style={styles.hero}>We lock{"\n"}you out.{"\n"}Completely.</Text>
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

function StepSetBedtime({ bedtime, onChange }: { bedtime: string; onChange: (v: string) => void }) {
  return (
    <View style={[styles.stepInner, { alignItems: "center" }]}>
      <Badge>SET YOUR BEDTIME</Badge>
      <Text style={[styles.hero, { textAlign: "center" }]}>
        What time{"\n"}does the{"\n"}lock kick in?
      </Text>
      <Text style={[styles.bodyText, { textAlign: "center" }]}>
        Be honest. Pick a time you know you should actually be asleep.
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
  dotsRow: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.border },
  dotActive: { width: 20, backgroundColor: Colors.primaryCyan },
  stepFlow: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  // Centered, same composition principle as the welcome screen. The
  // shared btnWrap padding below is what actually shifts everything up
  // proportionally — don't also force this to the top, that just moves
  // the dead space from above the content to below it.
  stepContent: { flex: 1, justifyContent: "center" },
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

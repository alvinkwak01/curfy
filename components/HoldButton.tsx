import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { Colors, Fonts } from "@/constants/theme";

const HOLD_DURATION_MS = 120000;
const RADIUS = 80;
const STROKE_WIDTH = 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SVG_SIZE = RADIUS * 2 + STROKE_WIDTH * 2;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// 28 rotating guilt messages, 4 escalating stages of 7, per the DUSK blueprint.
const GUILT_MESSAGES: string[][] = [
  // Stage 1 (0–25%): mild
  [
    "Are you sure about this?",
    "Wow. Still going.",
    "That's a choice.",
    "This is really happening, huh.",
    "No rush. It's only your sleep schedule.",
    "Bold of you.",
    "Interesting decision so far.",
  ],
  // Stage 2 (25–50%): sharper, dry, more pointed
  [
    "You look ridiculous right now...",
    "Really committing to this, huh.",
    "Your thumb's dedicated. Everything else, less so.",
    "This is the hill?",
    "Cool. Cool cool cool.",
    "Impressive persistence. Wrong direction, though.",
    "Still holding. Still a bad idea.",
  ],
  // Stage 3 (50–75%): direct commands, the mask drops
  [
    "Just go to sleep.",
    "Let's see some discipline.",
    "Put the phone down.",
    "You know better than this.",
    "This ends now.",
    "Enough.",
    "Seriously. Stop.",
  ],
  // Stage 4 (75–100%): last stretch, grudging acknowledgment, still not approving
  [
    "Last chance to make a better choice.",
    "You're about to win. Nobody's impressed.",
    "This is the effort that could've been sleep.",
    "Almost unlocked. Still a mistake.",
    "Fine. Have it your way.",
    "You really are doing this.",
    "Your call. Not a good one.",
  ],
];

function pickMessage(progress: number): string {
  const stageIndex = Math.min(3, Math.floor(progress * 4));
  const stage = GUILT_MESSAGES[stageIndex];
  return stage[Math.floor(Math.random() * stage.length)];
}

interface HoldButtonProps {
  onUnlock: () => void;
  unlockCount: number;
}

export function HoldButton({ onUnlock, unlockCount }: HoldButtonProps) {
  const [isHolding, setIsHolding] = useState(false);
  const [displaySeconds, setDisplaySeconds] = useState(120);
  const [message, setMessage] = useState("Hold to unlock");

  const progress = useSharedValue(0);
  const scale = useSharedValue(1);

  const startTimeRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
    tickRef.current = null;
    messageTimeoutRef.current = null;
  };

  const currentProgress = () => {
    if (!startTimeRef.current) return 0;
    return Math.min(1, (Date.now() - startTimeRef.current) / HOLD_DURATION_MS);
  };

  const scheduleNextMessage = () => {
    // Deliberately slow — this should feel like someone occasionally
    // muttering a judgment, not a stream of one-liners. ~6-9 messages
    // over the full 120s hold, not 20+.
    const delay = 12000 + Math.random() * 8000;
    messageTimeoutRef.current = setTimeout(() => {
      setMessage(pickMessage(currentProgress()));
      scheduleNextMessage();
    }, delay);
  };

  const handlePressIn = () => {
    setIsHolding(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    scale.value = withSpring(0.95);
    startTimeRef.current = Date.now();
    progress.value = withTiming(1, {
      duration: HOLD_DURATION_MS,
      easing: Easing.linear,
    });
    setMessage(pickMessage(0));
    scheduleNextMessage();

    tickRef.current = setInterval(() => {
      if (!startTimeRef.current) return;
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, HOLD_DURATION_MS - elapsed);
      setDisplaySeconds(Math.ceil(remaining / 1000));
      if (elapsed >= HOLD_DURATION_MS) {
        clearTimers();
        startTimeRef.current = null;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onUnlock();
      }
    }, 200);
  };

  const handlePressOut = () => {
    if (!startTimeRef.current) return; // already completed via the interval
    setIsHolding(false);
    startTimeRef.current = null;
    clearTimers();
    scale.value = withSpring(1);
    progress.value = withSpring(0);
    setDisplaySeconds(120);
    setMessage("Hold to unlock");
  };

  useEffect(() => clearTimers, []);

  const animatedCircleProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.value),
  }));

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.wrap}>
      {unlockCount > 0 && (
        <Text style={styles.unlockBadge}>Unlocked {unlockCount}x tonight</Text>
      )}
      <Text style={styles.message}>{message}</Text>

      <Animated.View style={[styles.buttonWrap, animatedButtonStyle]}>
        <Svg
          width={SVG_SIZE}
          height={SVG_SIZE}
          style={StyleSheet.absoluteFill}
        >
          <Circle
            cx={SVG_SIZE / 2}
            cy={SVG_SIZE / 2}
            r={RADIUS}
            stroke={Colors.border}
            strokeWidth={STROKE_WIDTH}
            fill="none"
          />
          <AnimatedCircle
            cx={SVG_SIZE / 2}
            cy={SVG_SIZE / 2}
            r={RADIUS}
            stroke={Colors.primaryCyan}
            strokeWidth={STROKE_WIDTH}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            animatedProps={animatedCircleProps}
            rotation={-90}
            origin={`${SVG_SIZE / 2}, ${SVG_SIZE / 2}`}
          />
        </Svg>

        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={styles.innerButton}
        >
          {isHolding ? (
            <Text style={styles.countdown}>{displaySeconds}</Text>
          ) : (
            <Ionicons name="lock-closed" size={24} color={Colors.textMuted} />
          )}
        </Pressable>
      </Animated.View>

      <Text style={styles.hint}>
        {isHolding ? "Keep holding..." : "Hold for 120 seconds"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    gap: 16,
  },
  unlockBadge: {
    color: Colors.dangerRed,
    fontSize: 12,
    fontFamily: Fonts.medium,
  },
  message: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontFamily: Fonts.medium,
    textAlign: "center",
    maxWidth: 280,
  },
  buttonWrap: {
    width: SVG_SIZE,
    height: SVG_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  innerButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.primaryCyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  },
  countdown: {
    color: Colors.primaryCyan,
    fontSize: 42,
    fontFamily: Fonts.bold,
  },
  hint: {
    color: Colors.textMuted,
    fontSize: 13,
    fontFamily: Fonts.regular,
  },
});

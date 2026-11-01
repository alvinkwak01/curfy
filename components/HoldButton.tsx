import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
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
const RADIUS = 91;
const STROKE_WIDTH = 7;
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
  onUnlock: () => void | Promise<void>;
  unlockCount: number;
  onHoldingChange?: (holding: boolean) => void;
}

export function HoldButton({ onUnlock, unlockCount, onHoldingChange }: HoldButtonProps) {
  const [isHolding, setIsHolding] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [displaySeconds, setDisplaySeconds] = useState(120);
  const [message, setMessage] = useState("Hold to unlock");

  const progress = useSharedValue(0);
  const scale = useSharedValue(1);

  const startTimeRef = useRef<number | null>(null);
  const unlockPendingRef = useRef(false);
  const onUnlockRef = useRef(onUnlock);
  onUnlockRef.current = onUnlock;
  const mountedRef = useRef(true);
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
    if (unlockPendingRef.current || startTimeRef.current !== null ||
        AppState.currentState !== "active") return;
    setIsHolding(true);
    onHoldingChange?.(true);
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
      // DISPLAY ONLY: the JavaScript clock must never grant a real unlock.
      // Only Gesture.LongPress().minDuration(120000).onStart authorizes it.
      const elapsed = Date.now() - startTimeRef.current;
      setDisplaySeconds(Math.ceil(Math.max(0, HOLD_DURATION_MS - elapsed) / 1000));
    }, 200);
  };

  const handleNativeHoldComplete = () => {
    // Native recognizer has observed one continuous finger on the control
    // for the entire duration; a suspended JS timer is never sufficient.
    if (!startTimeRef.current || unlockPendingRef.current ||
        AppState.currentState !== "active") return;
    clearTimers();
    startTimeRef.current = null;
    unlockPendingRef.current = true;
    setIsHolding(false);
    onHoldingChange?.(false);
    setIsUnlocking(true);
    Promise.resolve()
      .then(() => onUnlockRef.current())
      .then(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))
      .catch(() => {
        progress.value = withSpring(0);
        scale.value = withSpring(1);
        if (mountedRef.current) {
          setDisplaySeconds(120);
          setMessage("iOS couldn't unlock the apps. Try again.");
        }
      })
      .finally(() => {
        unlockPendingRef.current = false;
        if (mountedRef.current) setIsUnlocking(false);
      });
  };

  const handlePressOut = () => {
    if (!startTimeRef.current) return; // already completed via the interval
    setIsHolding(false);
    onHoldingChange?.(false);
    startTimeRef.current = null;
    clearTimers();
    scale.value = withSpring(1);
    progress.value = withSpring(0);
    setDisplaySeconds(120);
    setMessage("Hold to unlock");
  };

  // Backgrounding or an incoming call must terminate an in-progress hold.
  // A paused JS interval must never finish the hold after returning to Curfy.
  useEffect(() => {
    mountedRef.current = true;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") handlePressOut();
    });
    return () => {
      mountedRef.current = false;
      startTimeRef.current = null;
      sub.remove();
      clearTimers();
    };
  }, []);

  // This is a native iOS/Android recognizer. Unlike setInterval, it fails
  // when touch ends, the app backgrounds, or the gesture is cancelled.
  // JS remains responsible only for the animated visual countdown.
  const holdGesture = useMemo(() =>
    Gesture.LongPress()
      .minDuration(HOLD_DURATION_MS)
      .maxDistance(26)
      .shouldCancelWhenOutside(true)
      .runOnJS(true)
      .onBegin(() => handlePressIn())
      .onStart(() => handleNativeHoldComplete())
      .onFinalize(() => handlePressOut()),
  []);

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

      <GestureDetector gesture={holdGesture}>
      <Animated.View style={[styles.buttonWrap, animatedButtonStyle]}>
        <View pointerEvents="none" style={styles.halo} />
        <Svg
          width={SVG_SIZE}
          height={SVG_SIZE}
          style={StyleSheet.absoluteFill}
        >
          <Circle
            cx={SVG_SIZE / 2}
            cy={SVG_SIZE / 2}
            r={RADIUS}
            stroke="#303352"
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

        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel="Hold continuously for 120 seconds to request a temporary unlock"
          accessibilityHint="Releasing early or leaving Curfy resets the full timer"
          style={styles.innerButton}
        >
          {isUnlocking ? (
            <ActivityIndicator size="large" color={Colors.primaryCyan} />
          ) : isHolding ? (
            <>
              <Text style={styles.countdown}>{displaySeconds}</Text>
              <Text style={styles.centerLabel}>SECONDS LEFT</Text>
            </>
          ) : (
            <>
              <Ionicons name="hand-left-outline" size={29} color={Colors.primaryCyan} />
              <Text style={styles.centerLabel}>PRESS & HOLD</Text>
            </>
          )}
        </View>
      </Animated.View>
      </GestureDetector>

      <Text style={styles.hint}>
        {isUnlocking ? "Checking with iOS..." : isHolding ? "Don't lift your finger" : "Hold for the full 120 seconds"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  unlockBadge: {
    color: Colors.dangerRed,
    fontSize: 12,
    fontFamily: Fonts.medium,
  },
  message: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: Fonts.medium,
    textAlign: "center",
    maxWidth: 280,
    minHeight: 21,
  },
  buttonWrap: {
    width: SVG_SIZE,
    height: SVG_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: "rgba(0,229,255,0.035)",
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.10)",
  },
  innerButton: {
    width: 144,
    height: 144,
    borderRadius: 72,
    backgroundColor: "#111629",
    borderWidth: 1,
    borderColor: "#2E5062",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: Colors.primaryCyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.21,
    shadowRadius: 22,
    elevation: 5,
  },
  centerLabel: {
    color: "#91BACC",
    fontFamily: Fonts.semiBold,
    fontSize: 10,
    letterSpacing: 1.2,
    textAlign: "center",
  },
  countdown: {
    color: Colors.primaryCyan,
    fontSize: 42,
    fontFamily: Fonts.bold,
  },
  hint: {
    color: "#A4A4C5",
    fontSize: 12,
    fontFamily: Fonts.medium,
    letterSpacing: 0.2,
  },
});

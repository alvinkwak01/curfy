import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Ellipse, Polygon } from "react-native-svg";
import { Colors } from "@/constants/theme";

// PLACEHOLDER MASCOT: the original DUSK app used a hand-drawn owl PNG
// (assets/images/mascot.png) that was not recovered. This is a simple
// SVG stand-in with the same mood/animation behavior described in the
// blueprint, so the app is functional now. Swap in real art later by
// dropping the PNG into assets/images/mascot.png and replacing the
// <Svg> block below with an <Image> — the props/behavior won't need to change.

export type MascotMood = "happy" | "stern" | "sleepy";

interface MascotProps {
  size?: number;
  mood?: MascotMood;
  animate?: boolean;
}

const MOOD_TINTS: Record<MascotMood, string | null> = {
  happy: null,
  stern: "rgba(255, 68, 102, 0.15)",
  sleepy: "rgba(123, 47, 255, 0.15)",
};

export function Mascot({ size = 100, mood = "sleepy", animate = true }: MascotProps) {
  const breathe = useSharedValue(1);
  const glow = useSharedValue(0.6);

  useEffect(() => {
    if (!animate) return;
    breathe.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.0, { duration: 2800, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
    glow.value = withRepeat(
      withSequence(
        withTiming(1.0, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.6, { duration: 2800, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate]);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breathe.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
  }));

  const tint = MOOD_TINTS[mood];
  const glowSize = size * 1.5;

  return (
    <View style={[styles.wrap, { width: glowSize, height: glowSize }]}>
      <Animated.View
        style={[
          styles.glow,
          glowStyle,
          {
            width: glowSize,
            height: glowSize,
            borderRadius: glowSize / 2,
          },
        ]}
      />
      <Animated.View style={[bodyStyle, { width: size, height: size }]}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          {/* body */}
          <Ellipse cx="50" cy="58" rx="34" ry="38" fill={Colors.surface} stroke={Colors.border} strokeWidth={2} />
          {/* ear tufts */}
          <Polygon points="24,28 34,10 40,32" fill={Colors.surface} stroke={Colors.border} strokeWidth={2} />
          <Polygon points="76,28 66,10 60,32" fill={Colors.surface} stroke={Colors.border} strokeWidth={2} />
          {/* eyes */}
          <Circle cx="36" cy="52" r="13" fill={Colors.textPrimary} />
          <Circle cx="64" cy="52" r="13" fill={Colors.textPrimary} />
          <Circle cx="36" cy="52" r="6" fill={Colors.primaryCyan} />
          <Circle cx="64" cy="52" r="6" fill={Colors.primaryCyan} />
          <Circle cx="36" cy="52" r="2.5" fill={Colors.background} />
          <Circle cx="64" cy="52" r="2.5" fill={Colors.background} />
          {/* beak */}
          <Polygon points="50,64 44,74 56,74" fill={Colors.warningAmber} />
        </Svg>
        {tint && (
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: tint, borderRadius: size / 2 },
            ]}
          />
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    backgroundColor: "rgba(0, 229, 255, 0.08)",
    shadowColor: "#00E5FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
  },
});

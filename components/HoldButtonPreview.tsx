import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Colors, Fonts } from "@/constants/theme";

// Static onboarding preview of the live HoldButton's idle design.
// Never grant an unlock or require users to wait through 120 seconds during setup.
const RADIUS = 91;
const STROKE_WIDTH = 7;
const SVG_SIZE = RADIUS * 2 + STROKE_WIDTH * 2;

export function HoldButtonPreview() {
  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel="Preview of the hold to unlock control. The real control requires holding continuously for 120 seconds."
    >
      <View style={styles.buttonWrap}>
        <View pointerEvents="none" style={styles.halo} />
        <Svg
          width={SVG_SIZE}
          height={SVG_SIZE}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Circle
            cx={SVG_SIZE / 2}
            cy={SVG_SIZE / 2}
            r={RADIUS}
            stroke="#303352"
            strokeWidth={STROKE_WIDTH}
            fill="none"
          />
        </Svg>
        <View pointerEvents="none" style={styles.innerButton}>
          <Ionicons name="hand-left-outline" size={29} color={Colors.primaryCyan} />
          <Text style={styles.centerLabel}>PRESS & HOLD</Text>
        </View>
      </View>
      <Text style={styles.hint}>Hold for the full 120 seconds</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingVertical: 12,
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
  hint: {
    color: "#A4A4C5",
    fontSize: 12,
    fontFamily: Fonts.medium,
    letterSpacing: 0.2,
  },
});

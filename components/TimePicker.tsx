import { Colors, Fonts } from "@/constants/theme";
import { clockString, swipeSteps, wrapTimeUnit } from "@/lib/timeWheelMath";
import * as Haptics from "expo-haptics";
import React, { useMemo, useRef } from "react";
import {
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface TimePickerProps {
  value: string; // "HH:MM" in local 24-hour time
  onChange: (time: string) => void;
  digitSize?: number;
}

interface WheelProps {
  value: number;
  count: number;
  onChange: (v: number) => void;
  digitSize: number;
  name: string;
}

/**
 * A bounded touch-driven wheel rather than a vertical FlatList.
 *
 * Settings has its own vertical ScrollView. The old nested FlatList was
 * clipped to one row and lost swipe gestures to the parent on real iPhones.
 * PanResponder takes ownership on touch-down inside the clock column. The
 * parent form remains scrollable everywhere else. A direct pan updates the
 * selected time in steps; releasing a fast flick adds a small finite coast.
 * No programmatic scroll, momentum race, or suppressed LogBox warnings.
 */
function Wheel({ value, count, onChange, digitSize, name }: WheelProps) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const countRef = useRef(count);
  countRef.current = count;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const startRef = useRef(value);
  const lastCommitted = useRef(value);
  const lastHapticAt = useRef(0);
  const stepPixels = useRef(Math.max(20, Math.round(digitSize * 0.65)));
  stepPixels.current = Math.max(20, Math.round(digitSize * 0.65));

  const emit = (next: number) => {
    const normalized = wrapTimeUnit(next, countRef.current);
    if (normalized === lastCommitted.current) return;
    lastCommitted.current = normalized;
    onChangeRef.current(normalized);
    const now = Date.now();
    if (now - lastHapticAt.current > 85) {
      lastHapticAt.current = now;
      void Haptics.selectionAsync().catch(() => {});
    }
  };
  const emitRef = useRef(emit);
  emitRef.current = emit;

  const pan = useMemo(() => PanResponder.create({
    // Own the touch as soon as it begins on a digit. The parent ScrollView
    // must not steal it and turn a wheel swipe into a form scroll.
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: (_, gesture) =>
      Math.abs(gesture.dy) > 3 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      startRef.current = valueRef.current;
      lastCommitted.current = valueRef.current;
    },
    onPanResponderMove: (_, gesture) => {
      emitRef.current(
        startRef.current + swipeSteps(gesture.dy, stepPixels.current)
      );
    },
    onPanResponderRelease: (_, gesture) => {
      // The old velocity-based coast snapped the clock several values after
      // the user's finger stopped. Commit exactly what the wheel displays.
      emitRef.current(startRef.current + swipeSteps(gesture.dy, stepPixels.current));
    },
    onPanResponderTerminate: () => {
      // No more updates, even when a system-level gesture interrupts the pan.
    },
  }), []);

  const selected = wrapTimeUnit(value, count);
  const pad = (n: number) => String(wrapTimeUnit(n, count)).padStart(2, "0");
  const columnWidth = Math.round(digitSize * 1.53);

  return (
    <View
      {...pan.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={name}
      accessibilityValue={{ text: pad(selected) }}
      accessibilityHint="Swipe up to increase or down to decrease. VoiceOver users can swipe up or down to adjust."
      accessibilityActions={[
        { name: "increment", label: `Increase ${name}` },
        { name: "decrement", label: `Decrease ${name}` },
      ]}
      onAccessibilityAction={(event) => {
        const delta = event.nativeEvent.actionName === "increment" ? 1
          : event.nativeEvent.actionName === "decrement" ? -1 : 0;
        if (delta) onChangeRef.current(wrapTimeUnit(valueRef.current + delta, countRef.current));
      }}
      style={[styles.wheel, { width: columnWidth }]}
    >
      <Text
        importantForAccessibility="no"
        style={[styles.neighbor, { fontSize: Math.round(digitSize * 0.46) }]}
      >{pad(selected - 1)}</Text>
      <View style={styles.activeWindow}>
        <Text
          importantForAccessibility="no"
          style={[styles.digits, { fontSize: digitSize, lineHeight: digitSize * 1.25 }]}
        >{pad(selected)}</Text>
      </View>
      <Text
        importantForAccessibility="no"
        style={[styles.neighbor, { fontSize: Math.round(digitSize * 0.46) }]}
      >{pad(selected + 1)}</Text>
    </View>
  );
}

export function TimePicker({ value, onChange, digitSize = 56 }: TimePickerProps) {
  const [hStr, mStr] = value.split(":");
  const hours = wrapTimeUnit(Number(hStr) || 0, 24);
  const minutes = wrapTimeUnit(Number(mStr) || 0, 60);

  // Multiple move events can arrive between React renders. Keep the complete
  // clock in a ref so a fast hour swipe can't overwrite a simultaneous minute.
  const latestRef = useRef({ hours, minutes });
  latestRef.current = { hours, minutes };
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const update = (unit: "hours" | "minutes", next: number) => {
    const clock = latestRef.current;
    const updated = {
      hours: unit === "hours" ? wrapTimeUnit(next, 24) : clock.hours,
      minutes: unit === "minutes" ? wrapTimeUnit(next, 60) : clock.minutes,
    };
    latestRef.current = updated;
    onChangeRef.current(clockString(updated.hours, updated.minutes));
  };

  return (
    <View style={styles.container}>
      <Text style={styles.instructions}>SWIPE UP OR DOWN TO SET TIME</Text>
      <View style={styles.row}>
        <View style={styles.column}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="One hour earlier"
            hitSlop={8}
            onPress={() => update("hours", latestRef.current.hours - 1)}
            style={styles.arrowBtn}
          >
            <Text style={styles.arrow}>▲</Text>
          </TouchableOpacity>
          <Wheel
            value={hours}
            count={24}
            name="Hour"
            digitSize={digitSize}
            onChange={(n) => update("hours", n)}
          />
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="One hour later"
            hitSlop={8}
            onPress={() => update("hours", latestRef.current.hours + 1)}
            style={styles.arrowBtn}
          >
            <Text style={styles.arrow}>▼</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.colon, { fontSize: digitSize }]}>:</Text>
        <View style={styles.column}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="One minute earlier"
            hitSlop={8}
            onPress={() => update("minutes", latestRef.current.minutes - 1)}
            style={styles.arrowBtn}
          >
            <Text style={styles.arrow}>▲</Text>
          </TouchableOpacity>
          <Wheel
            value={minutes}
            count={60}
            name="Minute"
            digitSize={digitSize}
            onChange={(n) => update("minutes", n)}
          />
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="One minute later"
            hitSlop={8}
            onPress={() => update("minutes", latestRef.current.minutes + 1)}
            style={styles.arrowBtn}
          >
            <Text style={styles.arrow}>▼</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", gap: 6 },
  instructions: {
    color: Colors.textMuted, fontFamily: Fonts.medium,
    fontSize: 9, letterSpacing: 1.1, textAlign: "center",
  },
  row: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 6,
  },
  column: { alignItems: "center", gap: 1 },
  arrowBtn: {
    minWidth: 44, minHeight: 36, padding: 7,
    justifyContent: "center", alignItems: "center",
  },
  arrow: { color: Colors.textMuted, fontSize: 13 },
  wheel: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: "rgba(20,23,45,0.58)",
    borderWidth: 1,
    borderColor: "#343C5D",
  },
  activeWindow: {
    width: "100%", alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,229,255,0.075)",
    borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: "rgba(0,229,255,0.24)",
    paddingVertical: 3,
  },
  neighbor: {
    fontFamily: Fonts.medium, color: "#747A9B",
    textAlign: "center", lineHeight: 26,
  },
  digits: {
    color: Colors.textPrimary, fontFamily: Fonts.bold,
    letterSpacing: -2, textAlign: "center",
  },
  colon: {
    color: Colors.textMuted, fontFamily: Fonts.bold,
    marginTop: 0,
  },
});

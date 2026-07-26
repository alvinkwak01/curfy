import { Colors, Fonts } from "@/constants/theme";
import * as Haptics from "expo-haptics";
import React, { useEffect, useMemo, useRef } from "react";
import {
  FlatList,
  LogBox,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// Settings screen wraps its whole form in a vertical ScrollView, and this
// wheel is a vertical FlatList inside it — RN's real concern is that a
// virtualized list can get windowed (items derendered off-screen) while
// nested in a scroll parent that intercepts the scroll, corrupting which
// rows are mounted. `initialNumToRender` below renders every row (24 or
// 60 — trivial counts) up front, so nothing ever gets windowed away in
// the first place, which is what actually neutralizes the risk the
// warning describes. The warning itself is silenced here because at that
// point it's a known false positive for this specific bounded case, not
// because the underlying nesting is being ignored.
LogBox.ignoreLogs([
  "VirtualizedLists should never be nested inside plain ScrollViews",
]);

interface TimePickerProps {
  value: string; // "HH:MM"
  onChange: (time: string) => void;
  digitSize?: number;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

interface WheelProps {
  value: number;
  count: number; // 24 for hours, 60 for minutes
  onChange: (v: number) => void;
  itemHeight: number;
  digitSize: number;
}

/**
 * A single scrollable digit wheel. Clipped to exactly one row tall, so
 * only the current value is ever visible — no peeking neighbors like a
 * native iOS picker. Scroll to change it, or drive it externally via the
 * `value` prop (used by the up/down arrow buttons) and it'll snap there.
 */
function Wheel({ value, count, onChange, itemHeight, digitSize }: WheelProps) {
  const listRef = useRef<FlatList<number>>(null);
  const data = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);
  const isDragging = useRef(false);
  const lastValue = useRef(value);

  // Keep the wheel's scroll position in sync when `value` changes from
  // outside (arrow taps, or the parent resetting it) — but never fight
  // the user's finger mid-drag.
  useEffect(() => {
    if (isDragging.current) return;
    if (lastValue.current === value) return;
    lastValue.current = value;
    listRef.current?.scrollToOffset({ offset: value * itemHeight, animated: true });
  }, [value, itemHeight]);

  const snapToNearest = (offsetY: number) => {
    const index = Math.max(0, Math.min(count - 1, Math.round(offsetY / itemHeight)));
    isDragging.current = false;
    if (index !== lastValue.current) {
      lastValue.current = index;
      Haptics.selectionAsync();
      onChange(index);
    } else {
      // Rounding safety: make sure it's sitting exactly on the line.
      listRef.current?.scrollToOffset({ offset: index * itemHeight, animated: true });
    }
  };

  const handleMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    snapToNearest(e.nativeEvent.contentOffset.y);
  };

  return (
    <View style={{ height: itemHeight, overflow: "hidden" }}>
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(item) => String(item)}
        showsVerticalScrollIndicator={false}
        snapToInterval={itemHeight}
        decelerationRate="fast"
        initialScrollIndex={value}
        initialNumToRender={count}
        nestedScrollEnabled
        getItemLayout={(_, index) => ({
          length: itemHeight,
          offset: itemHeight * index,
          index,
        })}
        onScrollBeginDrag={() => {
          isDragging.current = true;
        }}
        onMomentumScrollEnd={handleMomentumEnd}
        // A slow drag released with no fling doesn't always trigger a
        // momentum phase, which would leave the wheel stuck un-snapped.
        // Only handle it here if there's negligible velocity — if the
        // release has real velocity, let onMomentumScrollEnd own the
        // final snap so the two don't fight over the resting position.
        onScrollEndDrag={(e) => {
          const velocityY = e.nativeEvent.velocity?.y ?? 0;
          if (Math.abs(velocityY) < 0.05) {
            snapToNearest(e.nativeEvent.contentOffset.y);
          }
        }}
        renderItem={({ item }) => (
          <View style={[styles.wheelItem, { height: itemHeight }]}>
            <Text style={[styles.digits, { fontSize: digitSize }]}>{pad(item)}</Text>
          </View>
        )}
      />
    </View>
  );
}

export function TimePicker({ value, onChange, digitSize = 56 }: TimePickerProps) {
  const [hStr, mStr] = value.split(":");
  const hours = parseInt(hStr, 10);
  const minutes = parseInt(mStr, 10);
  const itemHeight = Math.round(digitSize * 1.15);
  const columnWidth = digitSize * 1.4;

  const setHours = (delta: number) => {
    const next = (((hours + delta) % 24) + 24) % 24;
    onChange(`${pad(next)}:${pad(minutes)}`);
  };

  const setMinutes = (delta: number) => {
    const next = (((minutes + delta) % 60) + 60) % 60;
    onChange(`${pad(hours)}:${pad(next)}`);
  };

  return (
    <View style={styles.row}>
      <View style={styles.column}>
        <TouchableOpacity onPress={() => setHours(1)} style={styles.arrowBtn}>
          <Text style={styles.arrow}>▲</Text>
        </TouchableOpacity>
        <View style={{ width: columnWidth }}>
          <Wheel
            value={hours}
            count={24}
            onChange={(h) => onChange(`${pad(h)}:${pad(minutes)}`)}
            itemHeight={itemHeight}
            digitSize={digitSize}
          />
        </View>
        <TouchableOpacity onPress={() => setHours(-1)} style={styles.arrowBtn}>
          <Text style={styles.arrow}>▼</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.colon, { fontSize: digitSize, lineHeight: itemHeight }]}>:</Text>

      <View style={styles.column}>
        <TouchableOpacity onPress={() => setMinutes(1)} style={styles.arrowBtn}>
          <Text style={styles.arrow}>▲</Text>
        </TouchableOpacity>
        <View style={{ width: columnWidth }}>
          <Wheel
            value={minutes}
            count={60}
            onChange={(m) => onChange(`${pad(hours)}:${pad(m)}`)}
            itemHeight={itemHeight}
            digitSize={digitSize}
          />
        </View>
        <TouchableOpacity onPress={() => setMinutes(-1)} style={styles.arrowBtn}>
          <Text style={styles.arrow}>▼</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  column: {
    alignItems: "center",
    gap: 8,
  },
  arrowBtn: {
    padding: 8,
  },
  arrow: {
    color: Colors.textMuted,
    fontSize: 16,
  },
  wheelItem: {
    alignItems: "center",
    justifyContent: "center",
  },
  digits: {
    color: Colors.textPrimary,
    fontFamily: Fonts.bold,
    letterSpacing: -2,
    textAlign: "center",
  },
  colon: {
    color: Colors.border,
    fontFamily: Fonts.bold,
    textAlignVertical: "center",
  },
});

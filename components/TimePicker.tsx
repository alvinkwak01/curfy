import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Colors, Fonts } from "@/constants/theme";

interface TimePickerProps {
  value: string; // "HH:MM"
  onChange: (time: string) => void;
  digitSize?: number;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function TimePicker({ value, onChange, digitSize = 56 }: TimePickerProps) {
  const [hStr, mStr] = value.split(":");
  const hours = parseInt(hStr, 10);
  const minutes = parseInt(mStr, 10);

  const setHours = (delta: number) => {
    const next = ((hours + delta) % 24 + 24) % 24;
    onChange(`${pad(next)}:${pad(minutes)}`);
  };

  const setMinutes = (delta: number) => {
    const next = ((minutes + delta) % 60 + 60) % 60;
    onChange(`${pad(hours)}:${pad(next)}`);
  };

  return (
    <View style={styles.row}>
      <View style={styles.column}>
        <TouchableOpacity onPress={() => setHours(1)} style={styles.arrowBtn}>
          <Text style={styles.arrow}>▲</Text>
        </TouchableOpacity>
        <Text style={[styles.digits, { fontSize: digitSize, minWidth: digitSize * 1.4 }]}>
          {pad(hours)}
        </Text>
        <TouchableOpacity onPress={() => setHours(-1)} style={styles.arrowBtn}>
          <Text style={styles.arrow}>▼</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.colon, { fontSize: digitSize }]}>:</Text>

      <View style={styles.column}>
        <TouchableOpacity onPress={() => setMinutes(5)} style={styles.arrowBtn}>
          <Text style={styles.arrow}>▲</Text>
        </TouchableOpacity>
        <Text style={[styles.digits, { fontSize: digitSize, minWidth: digitSize * 1.4 }]}>
          {pad(minutes)}
        </Text>
        <TouchableOpacity onPress={() => setMinutes(-5)} style={styles.arrowBtn}>
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
  digits: {
    color: Colors.textPrimary,
    fontFamily: Fonts.bold,
    letterSpacing: -2,
    textAlign: "center",
  },
  colon: {
    color: Colors.border,
    fontFamily: Fonts.bold,
  },
});

import React from "react";
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  ViewStyle,
} from "react-native";
import { Colors, Fonts } from "@/constants/theme";

interface BtnProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function Btn({ label, onPress, disabled = false, loading = false, style }: BtnProps) {
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      style={[styles.btn, isDisabled && styles.disabled, style]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={Colors.background} />
      ) : (
        <Text style={[styles.txt, isDisabled && styles.disabledTxt]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: Colors.primaryCyan,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  disabled: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  txt: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    color: "#000814",
  },
  disabledTxt: {
    color: Colors.textGhost,
  },
});

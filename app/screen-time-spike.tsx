import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { screenTime } from "@/lib/screenTime";
import { Colors, Fonts } from "@/constants/theme";

// Temporary diagnostic route. Not part of the production onboarding.
export default function ScreenTimeSpike() {
  const [status, setStatus] = useState("Unverified");
  const run = async (action: () => Promise<unknown> | unknown) => {
    try { setStatus(String(await action())); }
    catch (e) { Alert.alert("Screen Time", e instanceof Error ? e.message : String(e)); }
  };
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Screen Time proof</Text>
      <Text style={styles.note}>Development only. Select one app and test its shield outside Curfy.</Text>
      <Text style={styles.status}>Result: {status}</Text>
      <Pressable style={styles.button} onPress={() => run(screenTime.requestAuthorization)}><Text style={styles.label}>1. Authorize</Text></Pressable>
      <Pressable style={styles.button} onPress={() => run(screenTime.selectAndShieldOneApp)}><Text style={styles.label}>2. Select and shield one app</Text></Pressable>
      <Pressable style={styles.button} onPress={() => run(screenTime.isShieldConfigured)}><Text style={styles.label}>3. Check shield</Text></Pressable>
      <Pressable style={styles.button} onPress={() => run(() => { screenTime.clearShield(); return "Shield cleared"; })}><Text style={styles.label}>4. Clear shield</Text></Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: 24, justifyContent: "center", gap: 16 },
  title: { color: Colors.textPrimary, fontFamily: Fonts.bold, fontSize: 24 },
  note: { color: Colors.textMuted, fontFamily: Fonts.regular, fontSize: 14 },
  status: { color: Colors.primaryCyan, fontFamily: Fonts.medium, fontSize: 14 },
  button: { backgroundColor: Colors.surface, borderColor: Colors.border, borderWidth: 1, borderRadius: 14, padding: 16 },
  label: { color: Colors.textPrimary, fontFamily: Fonts.medium, fontSize: 15 },
});

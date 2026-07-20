import { StarBackground } from "@/components/StarBackground";
import { TimePicker } from "@/components/TimePicker";
import { Colors, Fonts } from "@/constants/theme";
import { useSleep } from "@/context/SleepContext";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Settings() {
  const { bedtime, setBedtime, userName, setUserName } = useSleep();
  const [localBedtime, setLocalBedtime] = useState(bedtime);
  const [localName, setLocalName] = useState(userName);
  const [saved, setSaved] = useState(false);

  const onSave = async () => {
    await setBedtime(localBedtime);
    await setUserName(localName.trim());
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaved(true);
    setTimeout(() => {
      router.back();
    }, 800);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <StarBackground />
      <View style={styles.body}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>

        <View style={styles.section}>
          <Text style={styles.label}>BEDTIME</Text>
          <Text style={styles.hint}>DUSK activates at this time every night</Text>
          <View style={{ marginTop: 12 }}>
            <TimePicker value={localBedtime} onChange={setLocalBedtime} digitSize={48} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>YOUR NAME</Text>
          <Text style={styles.hint}>Used in your sleep log</Text>
          <TextInput
            style={styles.input}
            value={localName}
            onChangeText={setLocalName}
            placeholder="Your name"
            placeholderTextColor={Colors.textGhost}
          />
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Notifications are sent 10 and 2 minutes before your bedtime. Make
            sure notifications are enabled in your device settings.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saved && styles.saveBtnSaved]}
          onPress={onSave}
          disabled={saved}
        >
          <Text style={styles.saveBtnText}>{saved ? "Saved" : "Save"}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 8, gap: 28 },
  back: { color: Colors.primaryCyan, fontSize: 15, fontFamily: Fonts.medium },
  title: { color: Colors.textPrimary, fontSize: 28, fontFamily: Fonts.bold },
  section: { gap: 2 },
  label: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: Fonts.medium,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  hint: { color: Colors.textGhost, fontSize: 12, fontFamily: Fonts.regular },
  input: {
    marginTop: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 18,
    fontSize: 18,
    fontFamily: Fonts.medium,
    color: Colors.textPrimary,
  },
  notice: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
  },
  noticeText: { color: Colors.textMuted, fontSize: 13, fontFamily: Fonts.regular, lineHeight: 19 },
  saveBtn: {
    backgroundColor: Colors.primaryCyan,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
  },
  saveBtnSaved: { backgroundColor: Colors.successGreen },
  saveBtnText: { color: "#000814", fontSize: 16, fontFamily: Fonts.bold },
});

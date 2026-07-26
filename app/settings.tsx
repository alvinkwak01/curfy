import { StarBackground } from "@/components/StarBackground";
import { TimePicker } from "@/components/TimePicker";
import { Colors, Fonts } from "@/constants/theme";
import { useSleep } from "@/context/SleepContext";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Settings() {
  const {
    bedtime,
    setBedtime,
    userName,
    setUserName,
    motivation,
    setMotivation,
    signOut,
    deleteAccount,
  } = useSleep();
  const [localBedtime, setLocalBedtime] = useState(bedtime);
  const [localName, setLocalName] = useState(userName);
  const [localMotivation, setLocalMotivation] = useState(motivation);
  const [saved, setSaved] = useState(false);

  const onSave = async () => {
    await setBedtime(localBedtime);
    await setUserName(localName.trim());
    await setMotivation(localMotivation.trim());
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaved(true);
    setTimeout(() => {
      router.back();
    }, 800);
  };

  const onSignOut = () => {
    Alert.alert(
      "Sign out?",
      "There's no account to save your progress to yet, so this just resets setup. Your streak and sleep history stay on this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "default",
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            signOut();
          },
        },
      ]
    );
  };

  const onDeleteAccount = () => {
    Alert.alert(
      "Delete everything?",
      "This permanently erases your name, bedtime, streak, and full sleep history from this device. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Everything",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            deleteAccount();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <StarBackground />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>

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

        <View style={styles.section}>
          <Text style={styles.label}>BEDTIME</Text>
          <Text style={styles.hint}>Curfy activates at this time every night</Text>
          <View style={{ marginTop: 12 }}>
            <TimePicker value={localBedtime} onChange={setLocalBedtime} digitSize={48} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>WHY ARE YOU DOING THIS?</Text>
          <Text style={styles.hint}>
            Shown back to you on the nights this is hard. Optional.
          </Text>
          <TextInput
            style={[styles.input, styles.motivationInput]}
            value={localMotivation}
            onChangeText={setLocalMotivation}
            placeholder="e.g. I want to actually feel rested"
            placeholderTextColor={Colors.textGhost}
            multiline
          />
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Notifications are sent 10 and 2 minutes before your bedtime. Make
            sure notifications are enabled in your device settings.
          </Text>
        </View>

        <View style={styles.previewSection}>
          <TouchableOpacity
            style={styles.previewBtn}
            onPress={() => router.push("/preview-lock")}
          >
            <Text style={styles.previewBtnText}>Preview Lock Screen</Text>
          </TouchableOpacity>
          <Text style={styles.previewHint}>
            Shows the real lock screen right now, without waiting for
            bedtime. Completing the 120-second hold counts as a real unlock
            for tonight — use the close button instead if you're just
            looking.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saved && styles.saveBtnSaved]}
          onPress={onSave}
          disabled={saved}
        >
          <Text style={styles.saveBtnText}>{saved ? "Saved" : "Save"}</Text>
        </TouchableOpacity>

        <View style={styles.accountSection}>
          <TouchableOpacity style={styles.signOutBtn} onPress={onSignOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.deleteLink} onPress={onDeleteAccount}>
            <Text style={styles.deleteLinkText}>Delete Account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  body: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40, gap: 28 },
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
  motivationInput: {
    fontSize: 15,
    minHeight: 60,
    textAlignVertical: "top",
  },
  notice: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
  },
  noticeText: { color: Colors.textMuted, fontSize: 13, fontFamily: Fonts.regular, lineHeight: 19 },
  previewSection: { gap: 8 },
  previewBtn: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  previewBtnText: { color: Colors.primaryCyan, fontSize: 15, fontFamily: Fonts.semiBold },
  previewHint: {
    color: Colors.textGhost,
    fontSize: 12,
    fontFamily: Fonts.regular,
    lineHeight: 17,
  },
  saveBtn: {
    backgroundColor: Colors.primaryCyan,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
  },
  saveBtnSaved: { backgroundColor: Colors.successGreen },
  saveBtnText: { color: "#000814", fontSize: 16, fontFamily: Fonts.bold },
  accountSection: { gap: 12 },
  signOutBtn: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  signOutText: { color: Colors.textPrimary, fontSize: 15, fontFamily: Fonts.semiBold },
  deleteLink: {
    alignItems: "center",
    paddingVertical: 4,
  },
  deleteLinkText: {
    color: Colors.textGhost,
    fontSize: 12,
    fontFamily: Fonts.regular,
  },
});

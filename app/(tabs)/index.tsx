import { Colors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useAppStore } from '@/store/useAppStore';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function SyndicateHome() {
  const { streak, name } = useAppStore();

  return (
    <View style={styles.container}>
      <Text style={styles.eye}>SYNDICATE ALPHA</Text>
      <Text style={styles.welcome}>Welcome back, {name || 'Seeker'}</Text>
      
      <View style={styles.pulseCard}>
        <Text style={styles.streakNum}>{streak}</Text>
        <Text style={styles.streakLabel}>DAYS OF DISCIPLINE</Text>
      </View>

      <Text style={styles.status}>Next Lock: 11:30 PM</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  eye: { fontFamily: Fonts.jakartaExtraBold, color: Colors.amber, fontSize: 12, letterSpacing: 2, marginBottom: 10 },
  welcome: { fontFamily: Fonts.frauncesBold, color: '#fff', fontSize: 24 },
  pulseCard: { marginVertical: 40, alignItems: 'center' },
  streakNum: { fontFamily: Fonts.frauncesBold, color: Colors.amber, fontSize: 120 },
  streakLabel: { fontFamily: Fonts.jakartaBold, color: '#444', fontSize: 14, letterSpacing: 1 },
  status: { color: '#888', fontFamily: Fonts.jakarta }
});
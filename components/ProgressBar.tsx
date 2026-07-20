import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';

export default function ProgressBar({ progress }: { progress: number }) {
  return (
    <View style={styles.bg}>
      <View style={[styles.fill, { width: `${progress * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden', marginHorizontal: 24, marginTop: 10 },
  fill: { height: '100%', backgroundColor: Colors.amber, borderRadius: 2 }
});
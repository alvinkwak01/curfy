import { Colors, Fonts } from '@/constants/colors';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

export default function Btn({ label, onPress, variant = 'primary', disabled = false, style }: any) {
  return (
    <TouchableOpacity 
      style={[styles.btn, variant === 'amber' && styles.amber, disabled && styles.disabled, style]} 
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={[styles.txt, variant === 'amber' && styles.amberTxt]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { backgroundColor: Colors.card, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 100, paddingVertical: 18, alignItems: 'center' },
  amber: { backgroundColor: Colors.amber, borderColor: Colors.amber },
  disabled: { opacity: 0.5 },
  txt: { fontFamily: Fonts.jakartaBold, fontSize: 16, color: Colors.t },
  amberTxt: { color: '#fff' }
});
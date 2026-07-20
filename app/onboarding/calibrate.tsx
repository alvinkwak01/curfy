import Btn from '@/components/Btn';
import ProgressBar from '@/components/ProgressBar';
import { Colors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useAppStore } from '@/store/useAppStore';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet, Text, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const CALIBRATION_TIME = 10; 

export default function Calibrate() {
  const { setCalibrated } = useAppStore();
  const [seconds, setSeconds] = useState(CALIBRATION_TIME);
  const [isHolding, setIsHolding] = useState(false);
  const [failed, setFailed] = useState(false);
  
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isHolding) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isHolding]);

  const startCalibration = () => {
    setIsHolding(true);
    setFailed(false);
    Vibration.vibrate(10); 

    Animated.spring(scaleAnim, { toValue: 0.92, useNativeDriver: true }).start();

    timerRef.current = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          handleSuccess();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSuccess = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    Vibration.vibrate([0, 100, 50, 100]); 
    setCalibrated(true);
  };

  const handleFailure = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (seconds > 0) {
      setFailed(true);
      setSeconds(CALIBRATION_TIME);
      setIsHolding(false);
      Vibration.vibrate(400); 
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => seconds > 0,
      onPanResponderGrant: startCalibration,
      onPanResponderRelease: handleFailure,
      onPanResponderTerminate: handleFailure,
      onPanResponderMove: (_, gestureState) => {
        if (Math.abs(gestureState.dx) > 15 || Math.abs(gestureState.dy) > 15) {
          handleFailure();
        }
      },
    })
  ).current;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ProgressBar progress={0.98} />
      
      <View style={styles.body}>
        <Text style={styles.eye}>FINAL STEP: SENSORY ALIGNMENT</Text>
        <Text style={styles.h1}>Calibrate your{'\n'}Commitment</Text>
        <Text style={styles.sub}>
          To lock your habits, you must master the hold. Press the pulse and hold perfectly still for {CALIBRATION_TIME} seconds.
        </Text>

        <View style={styles.centerStage}>
          <Text style={[styles.timer, seconds === 0 && styles.successText]}>
            {seconds}s
          </Text>
          
          <Animated.View 
            {...panResponder.panHandlers}
            style={[
              styles.target,
              { transform: [{ scale: scaleAnim }, { scale: pulseAnim }] },
              isHolding && styles.targetActive,
              seconds === 0 && styles.targetSuccess
            ]}
          >
            <View style={styles.innerCircle} />
          </Animated.View>
          
          {failed && <Text style={styles.error}>Focus. Do not move.</Text>}
        </View>
      </View>

      <View style={styles.btns}>
        <Btn 
          label="Enter the Syndicate →" 
          onPress={() => router.replace('/(tabs)')} 
          variant="primary"
          disabled={seconds > 0} 
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  body: { flex: 1, paddingTop: 60, paddingHorizontal: 24 },
  eye: { fontFamily: Fonts.jakartaExtraBold, fontSize: 12, color: Colors.amber, letterSpacing: 1, marginBottom: 8 },
  h1: { fontFamily: Fonts.frauncesBold, fontSize: 32, color: Colors.t, lineHeight: 38, marginBottom: 12 },
  sub: { fontFamily: Fonts.jakarta, fontSize: 15, color: Colors.t2, lineHeight: 24 },
  centerStage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  timer: { fontFamily: Fonts.frauncesBold, fontSize: 84, color: Colors.t, marginBottom: 40 },
  successText: { color: Colors.green },
  target: { width: width * 0.5, height: width * 0.5, borderRadius: width * 0.25, backgroundColor: Colors.card, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 1, shadowRadius: 20 },
  targetActive: { borderColor: Colors.amber, backgroundColor: 'rgba(200,148,58,0.05)' },
  targetSuccess: { borderColor: Colors.green, backgroundColor: 'rgba(78,139,107,0.05)' },
  innerCircle: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.amber },
  error: { fontFamily: Fonts.jakartaBold, color: Colors.rose, marginTop: 24, fontSize: 16 },
  btns: { paddingHorizontal: 24, paddingBottom: 16 },
});
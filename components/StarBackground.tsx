import React, { useMemo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const STAR_COUNT = 80;

interface StarSpec {
  key: number;
  left: number;
  top: number;
  size: number;
  delay: number;
  duration: number;
  minOpacity: number;
  maxOpacity: number;
  maxScale: number;
}

function Star({ spec }: { spec: StarSpec }) {
  const opacity = useSharedValue(spec.minOpacity);
  const scale = useSharedValue(1);

  React.useEffect(() => {
    opacity.value = withDelay(
      spec.delay,
      withRepeat(
        withSequence(
          withTiming(spec.maxOpacity, {
            duration: spec.duration * 1000,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(spec.minOpacity, {
            duration: spec.duration * 1000,
            easing: Easing.inOut(Easing.sin),
          })
        ),
        -1,
        true
      )
    );
    scale.value = withDelay(
      spec.delay,
      withRepeat(
        withSequence(
          withTiming(spec.maxScale, {
            duration: spec.duration * 1000,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(1, {
            duration: spec.duration * 1000,
            easing: Easing.inOut(Easing.sin),
          })
        ),
        -1,
        true
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.star,
        animatedStyle,
        {
          left: spec.left,
          top: spec.top,
          width: spec.size,
          height: spec.size,
          borderRadius: spec.size / 2,
        },
      ]}
    />
  );
}

export function StarBackground() {
  const { width, height } = useWindowDimensions();

  const stars = useMemo<StarSpec[]>(() => {
    return Array.from({ length: STAR_COUNT }).map((_, i) => ({
      key: i,
      left: Math.random() * width,
      top: Math.random() * height,
      size: 0.5 + Math.random() * 2.5,
      delay: Math.random() * 4000,
      duration: 1 + Math.random() * 2,
      minOpacity: 0.08 + Math.random() * 0.07,
      maxOpacity: 0.75 + Math.random() * 0.25,
      maxScale: 1.2 + Math.random() * 0.3,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {stars.map((spec) => (
        <Star key={spec.key} spec={spec} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  star: {
    position: "absolute",
    backgroundColor: "#E8E8FF",
  },
});

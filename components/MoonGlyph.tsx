import React, { useMemo } from "react";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";
import { Colors } from "@/constants/theme";

const SYNODIC_MONTH_DAYS = 29.530588853;
// A well-known reference new moon: 2000-01-06 18:14 UTC.
const KNOWN_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0);

/**
 * Returns the moon's age through its cycle as a fraction: 0 = new moon,
 * 0.5 = full moon, approaching 1 = new moon again. Standard synodic-month
 * approximation — accurate to well within a day, which is all a UI needs.
 */
export function getMoonPhase(date: Date = new Date()): number {
  const daysSince = (date.getTime() - KNOWN_NEW_MOON_MS) / 86400000;
  let phase = (daysSince % SYNODIC_MONTH_DAYS) / SYNODIC_MONTH_DAYS;
  if (phase < 0) phase += 1;
  return phase;
}

/**
 * Builds the illuminated-region path for a given phase, using the
 * standard two-arc construction: one true semicircle (the moon's actual
 * limb, on the side the light is currently filling in from) plus one
 * elliptical arc standing in for the terminator (the line between light
 * and shadow). The ellipse's horizontal radius shrinks to 0 at new/full
 * moon and grows to the full radius at the quarters, which is what
 * produces a correct crescent (thin sliver) vs. gibbous (fat, bulging
 * past a half-circle) shape rather than an arbitrary "bite taken out of
 * a circle."
 *
 * Simplification: assumes a Northern-Hemisphere-style waxing-fills-in-
 * from-the-right convention. Real on-sky orientation also depends on
 * the viewer's latitude, which isn't worth modeling for an app icon.
 */
function buildMoonPath(cx: number, cy: number, r: number, phase: number): string {
  const rx = Math.abs(Math.cos(phase * Math.PI * 2)) * r;
  const waxing = phase < 0.5;
  const gibbous = phase > 0.25 && phase < 0.75;
  const outerSweep = waxing ? 1 : 0;
  const terminatorSweep = gibbous ? 1 - outerSweep : outerSweep;
  const top = `${cx} ${cy - r}`;
  const bottom = `${cx} ${cy + r}`;
  return `M ${top} A ${r} ${r} 0 0 ${outerSweep} ${bottom} A ${rx} ${r} 0 0 ${terminatorSweep} ${top} Z`;
}

interface MoonGlyphProps {
  size?: number;
  /** Defaults to today. Pass a specific Date to preview another day. */
  date?: Date;
}

export function MoonGlyph({ size = 96, date }: MoonGlyphProps) {
  const r = size * 0.36;
  const cx = size * 0.8;
  const cy = size * 0.8;

  const phase = useMemo(() => getMoonPhase(date), [date]);
  const path = useMemo(() => buildMoonPath(cx, cy, r, phase), [cx, cy, r, phase]);

  return (
    <Svg width={size * 1.6} height={size * 1.6} viewBox={`0 0 ${size * 1.6} ${size * 1.6}`}>
      <Defs>
        <RadialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={Colors.primaryCyan} stopOpacity={0.35} />
          <Stop offset="100%" stopColor={Colors.primaryCyan} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={cx} cy={cy} r={size * 0.78} fill="url(#moonGlow)" />
      {/* Faint full-disk outline so the unlit portion of the moon still
          reads as "the moon," not empty space. */}
      <Circle cx={cx} cy={cy} r={r} fill="none" stroke={Colors.border} strokeWidth={1.5} />
      <Path d={path} fill={Colors.primaryCyan} />
    </Svg>
  );
}

// DUSK design system — from the original blueprint (May 2026).
// Dark-only. No light mode. Do not add a light variant.

export const Colors = {
  background: '#080810',   // every screen background
  surface: '#0D0D1E',      // cards, buttons, inputs
  border: '#1A1A35',       // all card/input borders

  primaryCyan: '#00E5FF',  // streak numbers, highlights, CTAs, progress ring
  accentViolet: '#7B2FFF', // "Slipped once" rating, milestone badge

  textPrimary: '#E8E8FF',  // headings, main numbers
  textMuted: '#5A5A8A',    // subtitles, labels, hints
  textGhost: '#2A2A4A',    // disabled states, fine print

  dangerRed: '#FF4466',    // unlock counts, "Chaotic" rating, urgent badge
  warningAmber: '#FFB800', // "Tried hard" rating
  successGreen: '#00FF9D', // save confirmation, clean rate when high
  orange: '#FF6B35',       // 30-night milestone badge
  gold: '#FFD700',         // 100-night Century badge
};

// Space Grotesk, 4 weights. Loaded via @expo-google-fonts/space-grotesk in app/_layout.tsx.
export const Fonts = {
  regular: 'SpaceGrotesk_400Regular',  // body text, hints, muted labels
  medium: 'SpaceGrotesk_500Medium',    // medium emphasis, countdown text, navigation
  semiBold: 'SpaceGrotesk_600SemiBold',// card titles, stat values
  bold: 'SpaceGrotesk_700Bold',        // headings, large numbers, hero text, CTAs
};

// Global layout rules from the blueprint — reuse these, don't reinvent per-screen.
export const Layout = {
  screenPadding: 24,
  cardRadius: 18,
  cardPadding: 20,
  buttonRadius: 14,
  buttonPaddingVertical: 18,
};

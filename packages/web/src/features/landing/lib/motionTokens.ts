/**
 * Shared design tokens for the landing page.
 *
 * Color palette is a darker, cinematic monochrome scheme that lets the brand
 * cyan/indigo accents pop. The brand primary `#1BAEE5` comes from the SPA
 * theme — we reuse it as the hero accent and the routing-particle color so
 * the landing and the product feel like the same product.
 */
export const colors = {
  // Brand
  brand: '#1BAEE5',
  brandDark: '#0e8db9',
  brandGlow: '#5cd4ff',
  accent: '#7c5cff', // indigo accent
  accentGlow: '#a48bff',

  // Surfaces (cinematic dark theme)
  bg0: '#06070b',        // deepest background
  bg1: '#0d0f17',        // section base
  bg2: '#13172a',        // raised
  bg3: '#1a2040',        // highest

  // Text
  text: '#f5f7fb',
  textDim: '#a4adc6',
  textMuted: '#5e6680',

  // Lines / borders
  hairline: 'rgba(255, 255, 255, 0.08)',
  hairlineStrong: 'rgba(255, 255, 255, 0.16)',

  // Glass surfaces (semi-transparent fills)
  glass: 'rgba(255, 255, 255, 0.04)',
  glassHover: 'rgba(255, 255, 255, 0.06)',
};

/**
 * Easing curves. Cubic-out is the default for "settling" motion;
 * cubic-bezier(0.16, 1, 0.3, 1) (a.k.a. "easeOutExpo") is great for hero
 * reveals where you want a confident, decisive feel.
 */
export const easings = {
  // Apple-style ease-out
  ease: [0.16, 1, 0.3, 1] as const,
  // For continuous motion (parallax)
  linear: 'linear' as const,
  // Subtle bounce on entries
  spring: { type: 'spring' as const, stiffness: 100, damping: 18 },
  // Tilt cards: slow + heavy so they feel weighty
  tiltSpring: { type: 'spring' as const, stiffness: 120, damping: 24, mass: 1.2 },
};

/**
 * Durations in seconds (Framer Motion uses seconds, not ms).
 */
export const durations = {
  fast: 0.25,
  normal: 0.6,
  slow: 1.0,
  hero: 1.2,
};

/**
 * Parallax depth presets. `depth` (1–5) maps to a translate range and a
 * blur radius. Layer 1 is sharpest + slowest (foreground); Layer 5 is most
 * blurred + fastest (background).
 */
export const depthPresets = {
  1: { range: [-30, 30] as const, blur: 0 },
  2: { range: [-60, 60] as const, blur: 2 },
  3: { range: [-100, 100] as const, blur: 4 },
  4: { range: [-160, 160] as const, blur: 8 },
  5: { range: [-240, 240] as const, blur: 16 },
} as const;

/**
 * Stagger delay between children in a stagger animation.
 */
export const stagger = {
  fast: 0.06,
  normal: 0.1,
  slow: 0.18,
};

export type Depth = keyof typeof depthPresets;

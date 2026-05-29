// Shared design tokens for the landing page animations.
export const BRAND = '#1BAEE5';
export const BRAND_DARK = '#0e8dc0';
export const BRAND_GLOW = 'rgba(27, 174, 229, 0.35)';
export const TEXT_PRIMARY = '#FFFFFF';
export const TEXT_SECONDARY = 'rgba(255,255,255,0.6)';
export const BG_BASE = '#070C14';
export const BG_CARD = 'rgba(255,255,255,0.04)';
export const BG_CARD_HOVER = 'rgba(255,255,255,0.08)';
export const BORDER_SUBTLE = 'rgba(255,255,255,0.08)';
export const BORDER_BRAND = 'rgba(27,174,229,0.3)';
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
export const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;
export const EASE_IN_OUT = [0.4, 0, 0.2, 1] as const;
export const DUR_FAST = 0.3;
export const DUR_MED = 0.6;
export const DUR_SLOW = 1.0;
export const DUR_XSLOW = 1.4;
export const PARALLAX_DEPTHS = [
  { translateY: [-20, 20],   blur: 0  },
  { translateY: [-40, 40],   blur: 1  },
  { translateY: [-70, 70],   blur: 3  },
  { translateY: [-110, 110], blur: 6  },
  { translateY: [-160, 160], blur: 12 },
] as const;
export const STAGGER_FAST = 0.06;
export const STAGGER_MED = 0.1;
export const STAGGER_SLOW = 0.15;
export const SPRING_TILT = { stiffness: 200, damping: 25 };
export const SPRING_SNAP = { stiffness: 400, damping: 40 };

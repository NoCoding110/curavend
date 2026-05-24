/**
 * Inline SVG illustrations for the landing page.
 *
 * Self-contained, no external image dependencies. All marks render in the
 * brand palette via `currentColor` / hardcoded brand hex so they look right
 * against the dark cinematic backdrop.
 */
import React from 'react';
import { colors } from '../lib/motionTokens';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

const base = (size = 48) => ({
  width: size,
  height: size,
  viewBox: '0 0 48 48',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
});

/** Hospital — caduceus-style cross enclosed in a soft square. */
export const HospitalMark: React.FC<IconProps> = ({ size, ...props }) => (
  <svg {...base(size)} {...props}>
    <rect x="6" y="6" width="36" height="36" rx="10" stroke={colors.brand} strokeWidth="1.5" opacity="0.45" />
    <path d="M24 14v20M14 24h20" stroke={colors.brand} strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="24" cy="24" r="3" fill={colors.brandGlow} />
  </svg>
);

/** Vendor — pallet/box with stacked layers. */
export const VendorMark: React.FC<IconProps> = ({ size, ...props }) => (
  <svg {...base(size)} {...props}>
    <path d="M8 20l16-8 16 8v16l-16 8-16-8V20z" stroke={colors.brand} strokeWidth="1.5" opacity="0.45" />
    <path d="M8 20l16 8 16-8M24 28v18" stroke={colors.brand} strokeWidth="1.5" opacity="0.55" />
    <circle cx="24" cy="36" r="2.5" fill={colors.accent} />
  </svg>
);

/** Lab — flask with rounded base + dotted contents. */
export const LabMark: React.FC<IconProps> = ({ size, ...props }) => (
  <svg {...base(size)} {...props}>
    <path
      d="M18 8h12v6l8 22a6 6 0 01-5.6 8H13.6A6 6 0 018 36l8-22V8z"
      stroke={colors.brand}
      strokeWidth="1.5"
      opacity="0.45"
    />
    <circle cx="20" cy="32" r="1.5" fill={colors.brandGlow} />
    <circle cx="28" cy="34" r="1.5" fill={colors.accent} />
    <circle cx="24" cy="38" r="2" fill={colors.brand} />
  </svg>
);

/** Provider — caduceus stick figure / person. */
export const ProviderMark: React.FC<IconProps> = ({ size, ...props }) => (
  <svg {...base(size)} {...props}>
    <circle cx="24" cy="14" r="6" stroke={colors.brand} strokeWidth="1.5" opacity="0.45" />
    <path d="M10 42c0-8 6.3-14 14-14s14 6 14 14" stroke={colors.brand} strokeWidth="1.5" opacity="0.45" />
    <circle cx="24" cy="32" r="2" fill={colors.brandGlow} />
  </svg>
);

/** Super-vendor — nested squares / aggregation. */
export const SuperVendorMark: React.FC<IconProps> = ({ size, ...props }) => (
  <svg {...base(size)} {...props}>
    <rect x="6" y="6" width="18" height="18" rx="4" stroke={colors.brand} strokeWidth="1.5" opacity="0.4" />
    <rect x="14" y="14" width="18" height="18" rx="4" stroke={colors.brand} strokeWidth="1.5" opacity="0.6" />
    <rect x="22" y="22" width="20" height="20" rx="5" stroke={colors.brand} strokeWidth="1.8" />
    <circle cx="32" cy="32" r="2" fill={colors.accent} />
  </svg>
);

/** Admin — shield with center dot. */
export const AdminMark: React.FC<IconProps> = ({ size, ...props }) => (
  <svg {...base(size)} {...props}>
    <path
      d="M24 6l16 6v12c0 10-8 18-16 22-8-4-16-12-16-22V12l16-6z"
      stroke={colors.brand}
      strokeWidth="1.5"
      opacity="0.5"
    />
    <path d="M16 24l6 6 12-12" stroke={colors.brandGlow} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Dotted grid for hero background. */
export const GridDots: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    width="100%"
    height="100%"
    xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="xMidYMid slice"
    {...props}
  >
    <defs>
      <pattern id="dots" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1" fill={colors.brand} fillOpacity="0.18" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#dots)" />
  </svg>
);

/** Hex network — abstract connection lines. */
export const HexNetwork: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg width="100%" height="100%" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg" {...props}>
    <defs>
      <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={colors.brand} stopOpacity="0.5" />
        <stop offset="100%" stopColor={colors.accent} stopOpacity="0.0" />
      </linearGradient>
    </defs>
    {[
      [100, 120, 320, 90],
      [320, 90, 520, 160],
      [520, 160, 700, 110],
      [120, 320, 280, 380],
      [280, 380, 480, 320],
      [480, 320, 680, 410],
      [200, 500, 380, 470],
      [380, 470, 580, 530],
      [320, 90, 280, 380],
      [520, 160, 480, 320],
    ].map(([x1, y1, x2, y2], i) => (
      <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="url(#lineGrad)" strokeWidth="1" />
    ))}
    {[
      [100, 120],
      [320, 90],
      [520, 160],
      [700, 110],
      [120, 320],
      [280, 380],
      [480, 320],
      [680, 410],
      [200, 500],
      [380, 470],
      [580, 530],
    ].map(([cx, cy], i) => (
      <circle key={i} cx={cx} cy={cy} r="2.5" fill={colors.brand} opacity="0.7" />
    ))}
  </svg>
);

/** Mesh gradient blob for hero parallax. */
export const Blob: React.FC<{ color?: string; size?: number } & React.SVGProps<SVGSVGElement>> = ({
  color = colors.brand,
  size = 600,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 600 600"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <defs>
      <radialGradient id={`blob-${color.replace('#', '')}`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor={color} stopOpacity="0.55" />
        <stop offset="60%" stopColor={color} stopOpacity="0.18" />
        <stop offset="100%" stopColor={color} stopOpacity="0" />
      </radialGradient>
    </defs>
    <circle cx="300" cy="300" r="300" fill={`url(#blob-${color.replace('#', '')})`} />
  </svg>
);

/** Curavend wordmark — text logo only (per plan, no logo asset). */
export const Wordmark: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <span
    style={{
      fontSize: size,
      fontWeight: 700,
      letterSpacing: '-0.02em',
      background: `linear-gradient(180deg, ${colors.text} 0%, ${colors.brandGlow} 100%)`,
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
    }}
  >
    Curavend
  </span>
);

/** Cloudflare-like Workers mark. */
export const CloudflareMark: React.FC<IconProps> = ({ size, ...props }) => (
  <svg {...base(size)} {...props}>
    <path
      d="M34 30c1.5 0 3-1.5 3-3.5 0-1.6-1-3-2.5-3.4-.1-3.5-3-6.4-6.6-6.4-2.5 0-4.7 1.4-5.8 3.5-.7-.5-1.6-.8-2.5-.8-2.4 0-4.3 2-4.3 4.4 0 .4.1.8.2 1.2A4.5 4.5 0 0010 30h24z"
      stroke={colors.brand}
      strokeWidth="1.5"
      opacity="0.7"
    />
  </svg>
);

/** Generic integration logo — diamond with center dot. */
export const IntegrationMark: React.FC<IconProps & { label?: string }> = ({ size = 56, label, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect
      x="8"
      y="8"
      width="40"
      height="40"
      rx="10"
      stroke={colors.hairlineStrong}
      strokeWidth="1"
      fill={colors.glass}
    />
    {label && (
      <text
        x="28"
        y="32"
        textAnchor="middle"
        fontSize="9"
        fontFamily="Inter, system-ui"
        fontWeight="600"
        fill={colors.text}
      >
        {label}
      </text>
    )}
  </svg>
);

/** Lab kit asset chip — TRF / Shipping Label / etc. */
export const AssetChip: React.FC<{ label: string }> = ({ label }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 16px',
      borderRadius: 12,
      background: colors.glass,
      border: `1px solid ${colors.hairlineStrong}`,
      backdropFilter: 'blur(20px)',
      color: colors.text,
      fontSize: 13,
      fontWeight: 500,
      whiteSpace: 'nowrap',
    }}
  >
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        background: colors.brand,
        boxShadow: `0 0 12px ${colors.brand}`,
      }}
    />
    {label}
  </div>
);

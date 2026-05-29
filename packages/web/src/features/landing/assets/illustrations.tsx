import React from 'react';

export const GridDots: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className, style }) => (
  <svg className={className} style={style} width="600" height="400" viewBox="0 0 600 400" fill="none" xmlns="http://www.w3.org/2000/svg">
    {Array.from({ length: 15 }, (_, row) =>
      Array.from({ length: 20 }, (_, col) => (
        <circle key={`${row}-${col}`} cx={col * 32 + 4} cy={row * 27 + 4} r="1.5" fill="rgba(27,174,229,0.25)" />
      ))
    )}
  </svg>
);

export const HexNetwork: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className, style }) => (
  <svg className={className} style={style} width="500" height="350" viewBox="0 0 500 350" fill="none" xmlns="http://www.w3.org/2000/svg">
    {[
      [80, 90], [200, 60], [320, 90], [440, 60],
      [140, 180], [260, 150], [380, 180],
      [80, 270], [200, 240], [320, 270], [440, 240],
    ].map(([cx, cy], i) => (
      <polygon key={i}
        points={`${cx},${cy-24} ${cx+20},${cy-12} ${cx+20},${cy+12} ${cx},${cy+24} ${cx-20},${cy+12} ${cx-20},${cy-12}`}
        fill="none" stroke="rgba(27,174,229,0.18)" strokeWidth="1"
      />
    ))}
    {[[80,90,200,60],[200,60,320,90],[320,90,440,60],[200,60,140,180],[320,90,260,150],[260,150,380,180],[140,180,200,240],[260,150,200,240],[380,180,320,270],[200,240,80,270],[200,240,320,270],[320,270,440,240]].map(([x1,y1,x2,y2], i) => (
      <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(27,174,229,0.1)" strokeWidth="1" />
    ))}
  </svg>
);

export const FlowCurve: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} width="800" height="200" viewBox="0 0 800 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M 0 100 C 200 20, 600 180, 800 100" stroke="rgba(27,174,229,0.3)" strokeWidth="2" fill="none" strokeDasharray="8 4" />
    <circle cx="0" cy="100" r="6" fill="#1BAEE5" />
    <circle cx="800" cy="100" r="8" fill="#1BAEE5" />
  </svg>
);

export const RoutingSVGFallback: React.FC = () => (
  <svg width="100%" height="360" viewBox="0 0 700 360" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="350" cy="180" r="140" stroke="rgba(27,174,229,0.2)" strokeWidth="1" />
    <circle cx="350" cy="180" r="100" stroke="rgba(27,174,229,0.15)" strokeWidth="1" />
    <circle cx="350" cy="180" r="60" stroke="rgba(27,174,229,0.1)" strokeWidth="1" />
    {/* Hospital node */}
    <circle cx="160" cy="100" r="12" fill="#1BAEE5" />
    <text x="160" y="125" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="11">Hospital</text>
    {/* Vendor nodes */}
    {[[480,80,'V1'],[520,180,'V2'],[470,290,'V3'],[280,300,'V4'],[200,250,'V5']].map(([x,y,lbl],i) => (
      <g key={i}>
        <circle cx={x as number} cy={y as number} r="8" fill="rgba(27,174,229,0.5)" />
        <text x={x as number} y={(y as number)+22} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="10">{lbl}</text>
      </g>
    ))}
    {/* Winning path */}
    <path d="M 160 100 C 250 80 350 100 480 80" stroke="#1BAEE5" strokeWidth="2" fill="none" opacity="0.8" />
    <text x="350" y="180" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="12">Vendor Routing Engine</text>
    {/* Scoring ring labels */}
    {[['GEO',350,55],['CONTRACT',490,140],['CAPABILITY',420,285],['STOCK',215,295]].map(([lbl,x,y],i) => (
      <text key={i} x={x as number} y={y as number} textAnchor="middle" fill="#1BAEE5" fontSize="11" fontWeight="600" opacity="0.8">{lbl}</text>
    ))}
  </svg>
);

import React from 'react';

/* Stylised Dota-inspired minimap (original art — not Valve assets). */
function MinimapArt({ className = '', variant = 'backdrop' }) {
  const vivid = variant === 'widget';

  return (
    <svg
      className={className}
      viewBox="0 0 256 256"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      role="img"
    >
      <rect width="256" height="256" rx="6" fill="currentColor" opacity={vivid ? 0.06 : 0.04} />

      {/* Terrain halves — separated diagonally like the real map, not side-by-side */}
      <path
        d="M0 256 L256 80 L256 256 Z"
        fill="#6b9e3e"
        opacity={vivid ? 0.22 : 0.1}
      />
      <path
        d="M0 0 L256 0 L0 176 Z"
        fill="#a84432"
        opacity={vivid ? 0.2 : 0.09}
      />

      {/* River */}
      <path
        d="M 196 28 C 168 72, 148 108, 132 132 C 116 156, 92 196, 60 228"
        stroke="#5a7a8a"
        strokeWidth={vivid ? 10 : 7}
        strokeLinecap="round"
        fill="none"
        opacity={vivid ? 0.55 : 0.35}
      />

      {/* Lanes */}
      <path d="M 36 220 C 90 170, 150 110, 220 36" stroke="#b8922a" strokeWidth="2.5" fill="none" opacity={vivid ? 0.45 : 0.22} />
      <path d="M 28 200 C 100 140, 156 84, 228 28" stroke="#b8922a" strokeWidth="2" fill="none" opacity={vivid ? 0.35 : 0.18} />
      <path d="M 48 232 C 110 180, 168 120, 232 48" stroke="#b8922a" strokeWidth="2" fill="none" opacity={vivid ? 0.35 : 0.18} />

      {/* Tower markers */}
      {[
        [52, 198], [88, 162], [124, 126], [160, 90], [196, 54],
        [68, 214], [104, 178], [140, 142], [176, 106], [212, 70],
      ].map(([cx, cy], i) => (
        <rect
          key={`tower-${i}`}
          x={cx - 3}
          y={cy - 3}
          width="6"
          height="6"
          fill="#ddb852"
          opacity={vivid ? 0.85 : 0.45}
          transform={`rotate(45 ${cx} ${cy})`}
        />
      ))}

      {/* Jungle camps */}
      {[
        [100, 72], [72, 100], [184, 184], [156, 212], [112, 188], [188, 112],
      ].map(([cx, cy], i) => (
        <circle key={`camp-${i}`} cx={cx} cy={cy} r="3" fill="#8a7d6e" opacity={vivid ? 0.5 : 0.28} />
      ))}

      {/* Roshan pit */}
      <circle cx="118" cy="162" r="9" fill="none" stroke="#b8922a" strokeWidth="2" opacity={vivid ? 0.75 : 0.4} />
      <circle cx="118" cy="162" r="3" fill="#b8922a" opacity={vivid ? 0.6 : 0.35} />

      {/* Ancients */}
      <circle cx="38" cy="218" r="13" fill="#6b9e3e" opacity={vivid ? 0.75 : 0.4} />
      <circle cx="38" cy="218" r="6" fill="#b8922a" opacity={vivid ? 0.9 : 0.5} />
      <circle cx="218" cy="38" r="13" fill="#a84432" opacity={vivid ? 0.75 : 0.4} />
      <circle cx="218" cy="38" r="6" fill="#b8922a" opacity={vivid ? 0.9 : 0.5} />

      {/* Map frame ticks — HUD feel */}
      <rect x="4" y="4" width="248" height="248" rx="4" fill="none" stroke="#b8922a" strokeWidth="1.5" opacity={vivid ? 0.35 : 0.15} />
    </svg>
  );
}

export default MinimapArt;

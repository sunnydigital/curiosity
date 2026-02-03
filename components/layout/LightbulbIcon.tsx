"use client";

interface LightbulbIconProps {
  hovered?: boolean;
  className?: string;
}

export function LightbulbIcon({ hovered = false, className }: LightbulbIconProps) {
  return (
    <svg
      viewBox="0 0 100 150"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Light bulb glass */}
      <path
        d="M50 10
           C75 10 85 35 85 55
           C85 75 70 85 65 95
           L35 95
           C30 85 15 75 15 55
           C15 35 25 10 50 10 Z"
        fill={hovered ? "#e8b857" : "#888"}
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={{ transition: "fill 0.2s ease" }}
      />

      {/* Filament lines inside bulb */}
      <path
        d="M40 70 L40 55 C40 45 45 42 50 50 C55 42 60 45 60 55 L60 70"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Base/screw part */}
      <path
        d="M35 95 L35 100 C35 102 38 104 50 104 C62 104 65 102 65 100 L65 95"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M35 104 L35 108 C35 110 38 112 50 112 C62 112 65 110 65 108 L65 104"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M37 112 L37 116 C37 118 40 120 50 120 C60 120 63 118 63 116 L63 112"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M40 120 L40 124 C40 126 43 128 50 128 C57 128 60 126 60 124 L60 120"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Bottom contact */}
      <rect x="45" y="128" width="10" height="6" fill="currentColor" rx="1" />
    </svg>
  );
}

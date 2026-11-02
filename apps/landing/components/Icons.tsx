// Small hand-drawn line icons. Decorative: always aria-hidden.
type P = { size?: number; className?: string };

function Svg({ size = 24, className, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export const IconWallet = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="6" width="18" height="13" rx="3" />
    <path d="M3 10h18M16 14.5h2" />
  </Svg>
);
export const IconRadar = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="1.6" />
    <path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8" />
  </Svg>
);
export const IconSignature = (p: P) => (
  <Svg {...p}>
    <path d="M4 17c2.5 0 3.5-9 6-9s1 7 3 7 2-3 3.5-3 1.5 2 3.5 2" />
    <path d="M4 20.5h16" />
  </Svg>
);
export const IconLedger = (p: P) => (
  <Svg {...p}>
    <path d="M4 7l8-4 8 4-8 4-8-4z" />
    <path d="M4 12l8 4 8-4M4 17l8 4 8-4" />
  </Svg>
);
export const IconGauge = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 17a8 8 0 1 1 15 0" />
    <path d="M12 13l3.5-4" />
    <circle cx="12" cy="13" r="1.2" />
  </Svg>
);
export const IconRepeat = (p: P) => (
  <Svg {...p}>
    <path d="M4 12a7 7 0 0 1 12-5l2 2M20 12a7 7 0 0 1-12 5l-2-2" />
    <path d="M18 4v5h-5M6 20v-5h5" />
  </Svg>
);
export const IconShield = (p: P) => (
  <Svg {...p}>
    <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" />
    <path d="M9 12l2 2 4-4" />
  </Svg>
);
export const IconLink = (p: P) => (
  <Svg {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Svg>
);
export const IconClock = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);
export const IconFlask = (p: P) => (
  <Svg {...p}>
    <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3" />
    <path d="M7.5 15h9" />
  </Svg>
);
export const IconAlert = (p: P) => (
  <Svg {...p}>
    <path d="M12 4l9 16H3l9-16z" />
    <path d="M12 10v4M12 17.2v.1" />
  </Svg>
);
export const IconWifiOff = (p: P) => (
  <Svg {...p}>
    <path d="M3 3l18 18" />
    <path d="M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 4-2.4M19 13a10 10 0 0 0-2.6-1.8M2 9.5a15 15 0 0 1 5-3M22 9.5A15 15 0 0 0 11 5.1" />
    <path d="M12 20v.01" />
  </Svg>
);
export const IconCloud = (p: P) => (
  <Svg {...p}>
    <path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 9.5a4.3 4.3 0 0 1-.5 8.5H7z" />
  </Svg>
);
export const IconCode = (p: P) => (
  <Svg {...p}>
    <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" />
  </Svg>
);
export const IconArrowRight = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);
export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
export const IconX = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IconAndroid = (p: P) => (
  <Svg {...p}>
    <path d="M5 11a7 7 0 0 1 14 0v6H5v-6z" />
    <path d="M7.5 5.5L9 8M16.5 5.5L15 8M9.5 12.5v.01M14.5 12.5v.01" />
  </Svg>
);
export const IconApple = (p: P) => (
  <Svg {...p}>
    <path d="M15.5 4c-1.2.1-2.5.9-3 2-.1-1.2 1-2.6 3-2z" />
    <path d="M12 8c-1.2 0-2-.7-3.3-.7C6.5 7.3 5 9.2 5 12c0 3.6 2.4 8 4.4 8 1 0 1.5-.6 2.6-.6s1.5.6 2.6.6c1.6 0 3.2-2.7 3.9-4.6-1.6-.7-2.5-2.1-2.5-3.7 0-1.5.8-2.7 2-3.4-.8-1.1-2-1.8-3.3-1.8-1.3 0-2 .7-2.7.7z" />
  </Svg>
);
export const IconGitHub = (p: P) => (
  <Svg {...p}>
    <path d="M9 19c-4 1.3-4-2-6-2.5M15 21v-3.5a3 3 0 0 0-.8-2.3c2.7-.3 5.6-1.3 5.6-6a4.7 4.7 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.6 2.5 5.6 2.8 5.6 2.8a4.3 4.3 0 0 0-.1 3.2 4.7 4.7 0 0 0-1.3 3.2c0 4.7 2.9 5.7 5.6 6a3 3 0 0 0-.8 2.3V21" />
  </Svg>
);
export const IconSun = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
  </Svg>
);
export const IconMoon = (p: P) => (
  <Svg {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />
  </Svg>
);
export const IconMenu = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);
export const IconDevice = (p: P) => (
  <Svg {...p}>
    <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
    <path d="M11 18.5h2" />
  </Svg>
);

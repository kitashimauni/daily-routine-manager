"use client";

type IconName = "today" | "calendar" | "routines" | "stats" | "plus" | "chevron-left" | "chevron-right" | "check" | "edit" | "pause" | "play" | "arrow-up-right" | "lock" | "x";

export function Icon({ name, size = 18, strokeWidth = 1.8 }: { name: IconName; size?: number; strokeWidth?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  const paths: Record<IconName, React.ReactNode> = {
    today: <><path d="M4 5.5h16v14H4z" /><path d="M8 3.5v4M16 3.5v4M4 9.5h16" /><path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01" /></>,
    calendar: <><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17" /><path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01" /></>,
    routines: <><path d="M6 4.5h14M6 9.5h14M6 14.5h14M6 19.5h14" /><path d="m2.5 4.5.8.8 1.5-1.6M2.5 9.5l.8.8 1.5-1.6M2.5 14.5l.8.8 1.5-1.6M2.5 19.5l.8.8 1.5-1.6" /></>,
    stats: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    "chevron-left": <path d="m14.5 5-7 7 7 7" />,
    "chevron-right": <path d="m9.5 5 7 7-7 7" />,
    check: <path d="m5 12.5 4.3 4.3L19 7" />,
    edit: <><path d="m14 5 5 5" /><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 16.9z" /></>,
    pause: <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>,
    play: <path d="m8 5 11 7-11 7z" />,
    "arrow-up-right": <><path d="M7 17 17 7M9 7h8v8" /></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    x: <><path d="m6 6 12 12M18 6 6 18" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

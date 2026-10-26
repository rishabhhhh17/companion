// Small drawings, all inline SVG so there is nothing to load and no emoji. They are marks, not words: each one sits inside a
// button that has its own name (an aria-label or hidden words), so every drawing is hidden from VoiceOver. They take the
// colour of the words around them (currentColor), so they follow the light and dark themes with no colour of their own.
import type { ReactElement } from "react";
import type { ActionIcon } from "./dropmenu.ts";
import type { Tab } from "./home.ts";

const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false } as const;

const PATHS: Record<ActionIcon | Tab | "tick" | "cross" | "more" | "close" | "undo" | "stop" | "wait", ReactElement> = {
  // The tabs
  now: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" /></>,
  did: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  learn: <><path d="M3 9l9-4.5L21 9l-9 4.5z" /><path d="M7 11.5V16c0 1.4 2.2 2.6 5 2.6s5-1.2 5-2.6v-4.5" /></>,
  memory: <><path d="M6 4h12v16l-6-4-6 4z" /></>,
  settings: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>,
  // The proof marks
  tick: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  cross: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  wait: <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />,
  // The strip at the bottom of Home
  undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></>,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2" />,
  // The ring
  more: <><circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none" /></>,
  close: <path d="M7 7l10 10M17 7L7 17" />,
  image: <><rect x="3.5" y="5" width="17" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M20.5 16l-5-5-8 8" /></>,
  pdf: <><path d="M14 3.5H7a2 2 0 00-2 2v13a2 2 0 002 2h10a2 2 0 002-2V8.5z" /><path d="M14 3.5v5h5" /><path d="M9 14h6M9 17h4" /></>,
  doc: <><path d="M14 3.5H7a2 2 0 00-2 2v13a2 2 0 002 2h10a2 2 0 002-2V8.5z" /><path d="M14 3.5v5h5" /><path d="M9 12h6M9 15h6M9 18h3" /></>,
  text: <><path d="M5 6h14M5 10h14M5 14h9M5 18h6" /></>,
  audio: <><path d="M5 10v4M9 7v10M13 4v16M17 8v8M21 11v2" /></>,
  mono: <><path d="M8 9v6M12 6v12M16 9v6" /></>,
  video: <><rect x="3.5" y="6" width="12" height="12" rx="2" /><path d="M15.5 10.5l5-2.5v8l-5-2.5z" /></>,
  archive: <><path d="M4 8h16M5 8l1-4h12l1 4" /><path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8" /><path d="M10 12h4" /></>,
  resize: <><path d="M4 9V4h5M20 15v5h-5" /><path d="M4 4l6 6M20 20l-6-6" /></>,
  squeeze: <><path d="M4 8h5V3M20 16h-5v5" /><path d="M9 8L3.5 2.5M15 16l5.5 5.5" /></>,
  trim: <><circle cx="6.5" cy="7" r="2.5" /><circle cx="6.5" cy="17" r="2.5" /><path d="M8.7 8.3L20 18M8.7 15.7L20 6" /></>,
  rotate: <><path d="M20 12a8 8 0 11-2.6-5.9" /><path d="M20 4v4.5h-4.5" /></>,
  flip: <><path d="M12 3v18" strokeDasharray="2 3" /><path d="M9 7L4 12l5 5zM15 7l5 5-5 5z" /></>,
  gray: <><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 010 16z" fill="currentColor" stroke="none" /></>,
  clean: <><path d="M5 19l8-8" /><path d="M14 4l6 6-7 7H8l-3-3z" /></>,
  grid: <><rect x="4" y="4" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" /></>,
  merge: <><path d="M5 5v4a4 4 0 004 4h6a4 4 0 014 4v2" /><path d="M19 5v4a4 4 0 01-4 4" /></>,
  split: <><path d="M12 4v6M12 14v6" strokeDasharray="1 0" /><path d="M5 12h14" strokeDasharray="2 3" /></>,
  file: <><path d="M14 3.5H7a2 2 0 00-2 2v13a2 2 0 002 2h10a2 2 0 002-2V8.5z" /><path d="M14 3.5v5h5" /></>,
};

export type IconName = keyof typeof PATHS;

/** One drawing at the given size (points). Hidden from VoiceOver: the control around it carries the name. */
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg {...base} width={size} height={size} className="ic">{PATHS[name]}</svg>;
}

/** The drawing for a choice on the drop ring. */
export function ActionGlyph({ kind, size = 20 }: { kind: ActionIcon; size?: number }) { return <Icon name={kind} size={size} />; }

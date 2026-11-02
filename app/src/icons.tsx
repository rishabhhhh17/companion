// Small drawings, all inline SVG so there is nothing to load and no emoji. They are marks, not words: each one sits inside a
// button that has its own name (an aria-label or hidden words), so every drawing is hidden from VoiceOver. They take the
// colour of the words around them (currentColor), so they follow the light and dark themes with no colour of their own.
// One stroke weight at every size (the audit, item 42): 1.5 points that never scale with the drawing (style.css .ic *),
// and the sizes a button or a list uses are tokens in rem (ui/parts.css), so the drawings grow with the text size.
import type { ReactElement } from "react";
import type { ActionIcon } from "./dropmenu.ts";
import type { Tab } from "./home.ts";

type HomeIcon = "gear" | "mic" | "send" | "find" | "explain" | "pointer" | "shield" | "person" | "drop" | "keyboard" | "lock" | "info" | "sliders" | "wrench" | "chevron" | "warn" | "halt";

const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false } as const;

const PATHS: Record<ActionIcon | Tab | "tick" | "cross" | "more" | "close" | "back" | "undo" | "stop" | "wait" | "half" | "dash" | "ring" | "spin" | "sparkle" | "alert" | "eye" | "updown" | HomeIcon, ReactElement> = {
  // The tabs
  now: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" /></>,
  did: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  learn: <><path d="M3 9l9-4.5L21 9l-9 4.5z" /><path d="M7 11.5V16c0 1.4 2.2 2.6 5 2.6s5-1.2 5-2.6v-4.5" /></>,
  memory: <><path d="M6 4h12v16l-6-4-6 4z" /></>,
  settings: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>,
  // Home's round buttons, the ask box and its quick actions (27 Oct 2026)
  // Settings as sliders (28 Oct 2026): the old cog, a circle with eight rays, read as the sun of the mark.
  // M30: the Settings side list.
  person: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 19.5c1.2-3.3 3.9-5 7-5s5.8 1.7 7 5" /></>,
  drop: <path d="M12 3.5c3.2 4 6 7.3 6 10.5a6 6 0 01-12 0c0-3.2 2.8-6.5 6-10.5z" />,
  keyboard: <><rect x="3" y="6.5" width="18" height="11" rx="2" /><path d="M7 10.5h.01M10.5 10.5h.01M14 10.5h.01M17 10.5h.01M8 14h8" /></>,
  wrench: <path d="M14.5 4.5a4.5 4.5 0 00-4.2 6.1L4.5 16.4a1.8 1.8 0 002.6 2.6l5.8-5.8a4.5 4.5 0 006.1-4.2l-2.7 2.7-2.6-.7-.7-2.6z" />,
  chevron: <path d="M9.5 6l6 6-6 6" />,
  lock: <><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></>,
  sliders: <><path d="M5 7h9M18 7h1M5 17h3M12 17h7" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  gear: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>,
  mic: <><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v2.5" /></>,
  send: <><path d="M12 19V5.5" /><path d="M6.5 11L12 5.5 17.5 11" /></>,
  find: <><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" /></>,
  explain: <><path d="M5 5.5h14a1.5 1.5 0 011.5 1.5v8a1.5 1.5 0 01-1.5 1.5H11l-4.5 3.5V16.5H5A1.5 1.5 0 013.5 15V7A1.5 1.5 0 015 5.5z" /><path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.5-1.5 1-1.5 1.8" /><circle cx="12" cy="14.6" r=".6" fill="currentColor" stroke="none" /></>,
  pointer: <path d="M6 3.5l12 7.5-5.3 1.4 3.3 6.1-2.3 1.2-3.3-6.1L6.5 17.5z" />,
  // The proof marks
  tick: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  cross: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  wait: <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />,
  // The parts (ui/parts.tsx): partly proven, a check that did not run, and a menu's up and down chevron.
  half: <><circle cx="12" cy="12" r="7.5" /><path d="M12 4.5a7.5 7.5 0 010 15z" fill="currentColor" stroke="none" /></>,
  dash: <path d="M7 12h10" />,
  // Nothing changed: an empty ring, the same size as the waiting dot, so it reads as a state and never as a minus.
  ring: <circle cx="12" cy="12" r="3.5" />,
  // A task at work (an open ring that turns; ui/look.css .ic-spin), something new (a small four point light), needs you (!).
  spin: <path className="ic-spin" d="M12 4.5a7.5 7.5 0 107.5 7.5" />,
  sparkle: <path d="M12 4c.6 4.2 1.8 5.4 6 6-4.2.6-5.4 1.8-6 6-.6-4.2-1.8-5.4-6-6 4.2-.6 5.4-1.8 6-6z" />,
  alert: <path d="M12 5.5v8M12 18h.01" />,
  eye: <><path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>,
  updown: <><path d="M8 9.5l4-4 4 4" /><path d="M8 14.5l4 4 4-4" /></>,
  // The strip at the bottom of Home
  shield: <><path d="M12 3.5l7 2.8v5.2c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6.3z" /><path d="M9 12l2.2 2.2L15.5 10" /></>,
  undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></>,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2" />,
  // M52: the review's ratings, each its own drawing (never colour alone): safe is the shield above, worth a look a
  // triangle with a mark, stop an eight sided sign with a bar.
  warn: <><path d="M12 4.5l8.5 15h-17z" /><path d="M12 10v4M12 16.8h.01" /></>,
  halt: <><path d="M8.7 3.8h6.6l4.9 4.9v6.6l-4.9 4.9H8.7l-4.9-4.9V8.7z" /><path d="M8.5 12h7" /></>,
  // The ring
  more: <><circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none" /></>,
  close: <path d="M7 7l10 10M17 7L7 17" />,
  back: <path d="M14.5 6l-6 6 6 6" />,
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

// The first thing a new person sees (M15 wave 1): a short recorded run of the signup practice, played on Home before any
// key, folder or question. It shows the whole promise in about fifteen seconds: the Join button fails, Squibby finds the
// exact line, fixes it with one small change, proves it with the project's own check, and Undo is one press away. It is a
// recording, it says so, and it changes nothing on the Mac. Every file name, line and message below is the real sample
// project's (app/sample/stuck-signup), and firstLook.test.ts applies this exact fix to a copy and runs its check, so the
// recording can never claim something the practice does not do.

export const BEATS = ["broken", "found", "fixed", "proven", "undo"] as const;
export type Beat = (typeof BEATS)[number];
/** How long each step stays on screen when it plays by itself. */
export const BEAT_MS = 2800;
export const TOTAL_MS = BEAT_MS * BEATS.length;

/** The step on screen at `ms` after it started playing: the last one stays once it is over. */
export function beatAt(ms: number): Beat {
  const i = Math.floor(Math.max(0, ms) / BEAT_MS);
  return BEATS[Math.min(BEATS.length - 1, i)];
}
export const beatIndex = (b: Beat) => BEATS.indexOf(b);
/** How Flowflow acts each step out: worried while the page fails, looking while it finds the line, busy while it fixes,
 *  the splash when the check passes, then calm. */
export const BEAT_STATE = { broken: "error", found: "checking", fixed: "working", proven: "done", undo: "idle" } as const;
/** Whether the part of the picture that belongs to `b` shows by step `now` (each step keeps what came before). */
export const shown = (now: Beat, b: Beat) => beatIndex(now) >= beatIndex(b);

/** The real practice, as recorded. */
export const RECORDING = {
  practice: "signup",
  folder: "stuck-signup",
  file: "public/signup.js",
  line: 8,
  before: '"/api/signup"',
  after: '"/api/register"',
  /** The line as it is in the practice, and as the fix leaves it, shortened to what matters on screen. */
  codeBefore: 'fetch("/api/signup", ...)',
  codeAfter: 'fetch("/api/register", ...)',
  server: "server.js",
  check: "joining the list works",
  brokenMsg: "Something went wrong. Please try again.",
  fixedMsg: "Thanks, you are on the list.",
  pageTitle: "Join the list",
} as const;

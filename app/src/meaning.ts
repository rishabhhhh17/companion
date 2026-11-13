// M71, black with colour (docs/milestones/M71-black-with-colour.md): every state Squibby shows turns into one meaning, and
// every meaning has one colour, so the same news always has the same colour everywhere (Home's lead, its list, the hover
// panel, History). Pure: no page, no setting. Every tag, dot and tile reads from here; ui/tokens.css holds the colours
// themselves (--c-<colour>, -soft, -text). Tested in meaning.test.ts: no state is left without a meaning.
import type { CharacterState } from "./model.ts";
import type { HeroTone, HomeMode, StatusKind } from "./homeHero.ts";
import type { VerdictKind } from "./verdict.ts";
import type { IconName } from "./icons.tsx";

/** The eight colours, Apple's dark mode set (tokens.css), one job each. */
export const COLOURS = ["blue", "purple", "orange", "pink", "green", "red", "teal", "grey"] as const;
export type Colour = (typeof COLOURS)[number];

/** What a piece of news means. Never "needs you" for something that only waits (a practice is "practice"). */
export const MEANINGS = [
  "proven",      // fixed and its checks passed; a working project
  "problem",     // a real problem: a failed check, a key in the code
  "review",      // take a look: changes to review, files changed since the last check
  "question",    // a question waits for a tap (an approval)
  "practice",    // a practice is ready, or under way on Learn
  "working",     // Squibby is doing something now
  "listening",   // the microphone is on (hold to talk)
  "stopped",     // stopped before it finished
  "undone",      // taken back
  "notChecked",  // nothing checked yet, or the result was not checked
  "ready",       // nothing to say: ready when you are
] as const;
export type Meaning = (typeof MEANINGS)[number];

export const MEANING_COLOUR: Record<Meaning, Colour> = {
  proven: "green", problem: "red", review: "orange", question: "orange", practice: "purple", working: "blue", listening: "teal",
  stopped: "grey", undone: "orange", notChecked: "grey", ready: "grey",
};
/** The drawing in a meaning's tile (icons.tsx, never an emoji). */
export const MEANING_ICON: Record<Meaning, IconName> = {
  proven: "tick", problem: "alert", review: "eye", question: "wait", practice: "learn", working: "spin", listening: "mic",
  stopped: "stop", undone: "undo", notChecked: "dash", ready: "now",
};
export const colourOf = (m: Meaning): Colour => MEANING_COLOUR[m];

// ---------- the places ----------

export const PLACES = ["now", "learn", "did", "memory", "settings"] as const;
export type Place = (typeof PLACES)[number];
/** Each place has its own colour tile: Now blue, Learn purple, History orange, Memory pink, Settings grey. */
export const PLACE_COLOUR: Record<Place, Colour> = { now: "blue", learn: "purple", did: "orange", memory: "pink", settings: "grey" };
export const PLACE_ICON: Record<Place, IconName> = { now: "now", learn: "sparkle", did: "undo", memory: "memory", settings: "gear" };

// ---------- the states, each to one meaning ----------

/** The character's state (model.ts). */
export const CHARACTER_MEANING: Record<CharacterState, Meaning> = {
  off: "ready", idle: "ready", listening: "listening", thinking: "working", working: "working", checking: "working", needsYou: "question", done: "proven", error: "problem",
};
/** How the project is from its last check (homeHero.ts homeStatus). */
export const STATUS_MEANING: Record<StatusKind, Meaning> = { works: "proven", changed: "review", failing: "problem", unchecked: "notChecked", noProject: "ready" };
/** The project chip's dot: green working, orange changed, red failing, grey not checked (the plan's bar). */
export const statusDot = (k: StatusKind): Colour => colourOf(STATUS_MEANING[k]);
/** A result's verdict (verdict.ts). Only a proven result is green; a partial check is a look, never proven. */
export const VERDICT_MEANING: Record<VerdictKind, Meaning> = {
  proven: "proven", passes: "proven", partial: "review", unchecked: "notChecked", noChange: "notChecked", turn: "practice",
  failed: "problem", stopped: "stopped", limit: "stopped", needsYou: "question", error: "problem", undone: "undone", back: "notChecked",
};
/** The hero's tone (homeHero.ts HeroTone). needsYou is a question only; a practice that waits says practice (heroMeaning). */
export const TONE_MEANING: Record<HeroTone, Meaning> = { idle: "ready", working: "working", needsYou: "question", done: "proven", notDone: "problem", partly: "review", plain: "notChecked" };
/** The tag at rest (homeRest.ts RestPill). */
export const PILL_MEANING: Record<"passed" | "look" | "failed" | "new", Meaning> = { passed: "proven", look: "review", failed: "problem", new: "notChecked" };
/** A finished task in History or the Last check row (homeRest.ts FixTag): green proven, red failed, orange undone, grey not checked. */
export const FIX_MEANING: Record<"proven" | "undone" | "failed" | "partly" | "unchecked", Meaning> = { proven: "proven", undone: "undone", failed: "problem", partly: "review", unchecked: "notChecked" };
/** A practice's stage (model.ts practice.stage): ready and under way are practice (purple), never needs you. */
export const PRACTICE_MEANING: Record<"start" | "found" | "fixing" | "lesson" | "proving" | "done" | "failed" | "blocked", Meaning> = {
  start: "practice", found: "practice", lesson: "practice", fixing: "working", proving: "working", done: "proven", failed: "problem", blocked: "stopped",
};
/** The review's rating (M57): changes that wait are a look; a stop (a key in the code) is a real problem; clean is proven. */
export const REVIEW_MEANING: Record<"waiting" | "look" | "stop" | "clean", Meaning> = { waiting: "review", look: "review", stop: "problem", clean: "proven" };
/** A problem the checks or the review found. */
export const PROBLEM_MEANING: Record<"failedCheck" | "keyInCode" | "error" | "notReadyOnline", Meaning> = { failedCheck: "problem", keyInCode: "problem", error: "problem", notReadyOnline: "review" };

/** Home's lead: the one thing that matters now, as a meaning. A practice of this folder that waits on the person is a
 *  practice, purple (the founder, 5 Nov 2026: never NEEDS YOU on a waiting practice); a real question is a question. */
export function heroMeaning(o: { mode: HomeMode; tone: HeroTone; status: StatusKind; practice?: string | null; reviewStop?: boolean; atRest?: boolean; restPill?: keyof typeof PILL_MEANING | null }): Meaning {
  if (o.practice && o.practice in PRACTICE_MEANING && (o.mode === "needs" || o.mode === "rest" || o.tone === "needsYou")) return PRACTICE_MEANING[o.practice as keyof typeof PRACTICE_MEANING];
  if (o.mode === "working") return "working";
  if (o.mode === "review") return o.reviewStop ? "problem" : "review";
  if (o.mode === "question") return "question";
  if (o.mode === "blocked") return "problem";
  if (o.mode === "result") return TONE_MEANING[o.tone];
  if (o.mode === "answer") return "ready";
  if (o.atRest && o.restPill) return PILL_MEANING[o.restPill];
  if (o.mode === "needs") return TONE_MEANING[o.tone];
  return STATUS_MEANING[o.status];
}

/** The notch's hover panel fact (notchQuick.ts quickFact), as a meaning for its dot. */
export type FactKind = "note" | "off" | "notConnected" | "questions" | "pickProject" | "changes" | "passed" | "failing" | "changedSince" | "notChecked" | "ready" | "working" | "listening" | "waiting";
export const FACT_MEANING: Record<FactKind, Meaning> = {
  note: "ready", off: "problem", notConnected: "review", questions: "question", pickProject: "ready", changes: "review", passed: "proven",
  failing: "problem", changedSince: "review", notChecked: "notChecked", ready: "ready", working: "working", listening: "listening",
  // M84: Claude Code waits on you (its waiting hook): a question in the orange of take a look.
  waiting: "question",
};

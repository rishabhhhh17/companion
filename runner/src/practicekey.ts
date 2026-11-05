// M58 feature 9, the sixth practice (docs/milestones/M58-fix-and-first-run.md, B2): Squibby plays the AI tool. On the
// person's press, a fixed script (no model, no shell, no network, never git) changes one file of the practice copy the way
// an AI tool sometimes does: it writes a payments key straight into the code. The review of every change (M52) then stops
// it with its own rules. Its fix is a fixed move too: the key goes to .env.local and the code reads it from there.
// Only ever inside a copy Companion made of this practice (practicerun.ts isPracticeProject, and the package is
// practice-key); refused anywhere else. Never through a link. The key is made up: shaped like a payments key, but no
// provider issues "sk_practice_" keys, and it is never in an event, a log or the words (the review redacts it).
import { existsSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isPracticeProject } from "./proof/practicerun.ts";
import { PRODUCT } from "./names.ts";
import { secretsInCode } from "./review/rate.ts";

/** The made up key the practice's pretend AI writes. Fixed, so a test and a person always see the same thing. */
export const PRETEND_KEY = "sk_practice_4f9c2a7e5b1d8e30";
/** Where it is written (the catalog's expect for this practice says the same, m58-practicekey.test.ts). */
export const KEY_PLACE = { file: "pay.js", line: 2 } as const;
const PACKAGE = "practice-key";
const CLEAN = 'const key = process.env.PAYMENTS_SECRET_KEY || "";';
const PASTED = [`const PAYMENTS_SECRET_KEY = "${PRETEND_KEY}";`, "const key = PAYMENTS_SECRET_KEY;"];
const ENV_LINE = `PAYMENTS_SECRET_KEY=${PRETEND_KEY}`;

export type PretendResult = { ok: true; wrote: boolean; file: string; line: number } | { ok: false; reason: string };
export type FixedResult = { ok: true; changed: { file: string; kind: "added" | "modified" }[] } | { ok: false; reason: string };

/** A copy Companion made of this practice: named as its copies are, its package is practice-key and needs no packages. */
export function isKeyPractice(dir: string): boolean {
  if (!isPracticeProject(dir)) return false;
  try { return (JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { name?: unknown }).name === PACKAGE; } catch { return false; }
}

const NOT_HERE = `This only works in a practice copy ${PRODUCT} made of the key practice.`;
const CHANGED = "This practice copy was changed, so the practice cannot run here. Start over for a fresh copy.";

/** A plain file of the copy, never a link (nothing is ever written through one). Null when it is not there or not plain. */
function plainFile(dir: string, rel: string): string | null {
  const p = join(dir, rel);
  try { return lstatSync(p).isFile() ? p : null; } catch { return null; }
}
function linesOf(path: string): string[] { return readFileSync(path, "utf8").split("\n"); }

/** The pretend AI's change: line 2 of pay.js, the line that reads the key from the settings, becomes the key itself. Pressed
 *  again it writes nothing (the key is already there). A pay.js that is neither the sample's nor the pretend AI's is left
 *  alone: nothing is guessed. */
export function pretendWrite(dir: string): PretendResult {
  if (!isKeyPractice(dir)) return { ok: false, reason: NOT_HERE };
  const p = plainFile(dir, KEY_PLACE.file);
  if (!p) return { ok: false, reason: CHANGED };
  const lines = linesOf(p), at = KEY_PLACE.line - 1;
  if (lines[at] === PASTED[0] && lines[at + 1] === PASTED[1]) return { ok: true, wrote: false, file: KEY_PLACE.file, line: KEY_PLACE.line };
  if (lines[at] !== CLEAN) return { ok: false, reason: CHANGED };
  lines.splice(at, 1, ...PASTED);
  writeFileSync(p, lines.join("\n"));
  return { ok: true, wrote: true, file: KEY_PLACE.file, line: KEY_PLACE.line };
}

/** Whether the review's own key rule finds a key in pay.js now (the proof after the fixed fix). */
export function keyInCode(dir: string): boolean {
  const p = plainFile(dir, KEY_PLACE.file);
  if (!p) return false;
  return secretsInCode(linesOf(p).map((text, i) => ({ file: KEY_PLACE.file, line: i + 1, text }))).length > 0;
}

/** The fixed fix: the key goes to .env.local (added once, after what is already there) and pay.js reads it from there
 *  again, exactly as the sample had it. Only when the pretend AI's two lines are there. */
export function fixedFix(dir: string): FixedResult {
  if (!isKeyPractice(dir)) return { ok: false, reason: NOT_HERE };
  const p = plainFile(dir, KEY_PLACE.file);
  if (!p) return { ok: false, reason: CHANGED };
  const lines = linesOf(p), at = KEY_PLACE.line - 1;
  if (lines[at] !== PASTED[0] || lines[at + 1] !== PASTED[1]) return { ok: false, reason: "There is no key written into the code to move." };
  const envPath = join(dir, ".env.local");
  const had = existsSync(envPath);
  if (had && !plainFile(dir, ".env.local")) return { ok: false, reason: CHANGED };
  const env = had ? readFileSync(envPath, "utf8") : "";
  if (!env.split("\n").includes(ENV_LINE)) writeFileSync(envPath, `${env}${env && !env.endsWith("\n") ? "\n" : ""}${ENV_LINE}\n`);
  lines.splice(at, 2, CLEAN);
  writeFileSync(p, lines.join("\n"));
  return { ok: true, changed: [{ file: ".env.local", kind: had ? "modified" : "added" }, { file: KEY_PLACE.file, kind: "modified" }] };
}

/** What a practice.key step needs from the engine (main.ts passes the real ones; the tests pass their own). */
export type PracticeKeyDeps = {
  say: (e: Record<string, unknown>) => void;
  /** Why the review cannot look at a change here now, or null (ReviewService cannotReview). */
  cannotReview: (project: string) => string | null;
  /** The review's starting point is taken, so the pretend AI's change is measured against the copy as it was. */
  ready: () => Promise<void>;
  /** Review now, whatever changed (review.now with no batch). */
  review: (project: string) => Promise<void>;
  /** Something of the engine's works in the project (a task, an Undo, a check). */
  busy: (project: string) => boolean;
  /** The engine's own shadow store for the project: the fixed fix's safety copy, the one Undo puts back. */
  snapshot: (project: string, label: string) => Promise<{ id: string }>;
  /** Wraps the engine's own work, so the review never counts the fixed fix as the other tool's change (main.ts ownWork). */
  own: (project: string, work: () => Promise<unknown>) => Promise<unknown>;
};
const BUSY = `${PRODUCT} is working on this project right now. Wait for it to finish, then try again.`;
/** Whether the pretend AI's two lines are in pay.js now (so the fixed fix has something to move). */
export function pretendThere(dir: string): boolean {
  const p = plainFile(dir, KEY_PLACE.file);
  if (!p) return false;
  const lines = linesOf(p), at = KEY_PLACE.line - 1;
  return lines[at] === PASTED[0] && lines[at + 1] === PASTED[1];
}
/** One step of the key practice, on the person's press. write: the pretend AI's change, then the review at once (its rules
 *  alone: main.ts gives the review rulesOnly for this copy). fix: a safety copy first, then the fixed fix, as the engine's
 *  own work. Every refusal writes nothing and says why. */
export async function practiceKeyStep(cmd: { project: string; step: "write" | "fix" }, d: PracticeKeyDeps): Promise<void> {
  const { project } = cmd;
  const refuse = (reason: string) => d.say({ type: "practice.key", project, step: "refused", reason });
  if (!isKeyPractice(project)) return refuse(NOT_HERE);
  if (d.busy(project)) return refuse(BUSY);
  if (cmd.step === "write") {
    const why = d.cannotReview(project);
    if (why) return refuse(why);
    await d.ready();
    const r = pretendWrite(project);
    if (!r.ok) return refuse(r.reason);
    d.say({ type: "practice.key", project, step: "wrote", written: r.wrote });
    await d.review(project);
    return;
  }
  if (!pretendThere(project)) return refuse("There is no key written into the code to move.");
  await d.own(project, async () => {
    const before = await d.snapshot(project, "Before: the practice's fixed fix");
    const r = fixedFix(project);
    if (!r.ok) return refuse(r.reason);
    d.say({ type: "practice.key", project, step: "fixed", checkpoint: before.id, changed: r.changed, clean: !keyInCode(project) });
  });
}

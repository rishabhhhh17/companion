// M85 (research feature 4): two flags for the plain words result, from data Squibby already has for its own runs, never
// from another app.
//  - "Not what you asked for": the task changed files the request did not name, when the request named its files, or a
//    file the request said to leave alone. C2 (CC #23067: files outside the task scope changed) and H1 (HN 48920537:
//    guest users made that were in no plan).
//  - "Said one thing, ran another": a command the agent ran goes against what it said just before it. H3 and A19 (the
//    Cursor forum, 4 Sep 2026: it said it was reverting only this conversation's work, then ran `git checkout HEAD --`,
//    which wiped 7 files of uncommitted work).
// Plain rules on words and commands, no model and no file access. Each flag names files and commands, never their content.
import { basename } from "node:path";
import { commandsOf } from "../shell.ts";
import { liveCommand } from "../livesystems.ts";
import { clip, redact } from "../redact.ts";

export type DriftKind = "not_asked" | "said_other";
export type DriftFlag = { kind: DriftKind; say: string };
/** What the agent said just before a command, and the command. */
export type SaidRan = { said: string; command: string };

const LOCK_OR_MADE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|Gemfile\.lock|composer\.lock|go\.sum)$/i;
/** A file or folder named in words: a/b.ts, ./src/, price.js, README.md. Web addresses and versions are not files. */
const NAMED = /(?:^|[\s"'`(,])((?:\.{0,2}\/)?(?:[\w@-][\w.@-]*\/)*[\w@-][\w@-]*(?:\.[A-Za-z][\w]{0,7})|(?:\.{0,2}\/)?(?:[\w@-][\w.@-]*\/)+)(?=$|[\s"'`),.:;!?])/g;
const NOT_A_FILE = /^(?:e\.g|i\.e|etc|vs|v?\d+(?:\.\d+)+|[\w-]+\.(?:com|org|net|io|dev|app|ai|co))$/i;
const LEAVE = /\b(?:don'?t|do not|never|without)\s+(?:touch(?:ing)?|chang(?:e|ing)|edit(?:ing)?|modify(?:ing)?)\s+([^\s,;.]+(?:\.[A-Za-z]\w{0,7})?\/?)|\bleave\s+([^\s,;]+)\s+alone\b/gi;

const tidy = (f: string) => f.replace(/^\.\//, "").replace(/\/+$/, "").toLowerCase();
const stem = (f: string) => (f.split("/").pop() ?? f).replace(/\.[^.]+$/, "").replace(/(?:[._-](?:test|spec))+$/i, "").toLowerCase();

/** The files and folders a request names, tidied. */
export function namedIn(request: string): string[] {
  const out = new Set<string>();
  for (const m of request.matchAll(NAMED)) {
    const n = m[1];
    if (!n || NOT_A_FILE.test(n.replace(/\/$/, "")) || /^https?:/i.test(n)) continue;
    if (!n.includes("/") && !/\.[A-Za-z]\w{0,7}$/.test(n)) continue;
    out.add(tidy(n));
  }
  return [...out];
}
/** Whether a changed file is one the request named: the file itself, a file in a named folder, or its test or code twin. */
const covered = (file: string, named: string[]) => {
  const f = tidy(file);
  return named.some((n) => f === n || f.startsWith(`${n}/`) || f.endsWith(`/${n}`) || (n.includes(".") && stem(f) === stem(n)));
};

/** "Not what you asked for": files changed beyond the ones the request named, or a file it said to leave alone. Null when
 *  the request named no file (then nothing can be said either way) and left nothing alone. */
export function notAsked(request: string, changed: readonly string[]): DriftFlag | null {
  const text = String(request ?? "");
  const files = changed.filter((f) => !LOCK_OR_MADE.test(f));
  // A file the request said to leave alone, changed anyway.
  for (const m of text.matchAll(LEAVE)) {
    const n = tidy((m[1] ?? m[2] ?? "").replace(/[.,;:!?]+$/, ""));
    if (!n || n.length < 2) continue;
    const hit = files.find((f) => tidy(f) === n || tidy(f).startsWith(`${n}/`) || tidy(f).endsWith(`/${n}`));
    if (hit) return { kind: "not_asked", say: `You said to leave ${clip(n, 80)} alone, but this changed ${clip(hit, 80)}.` };
  }
  // A file named only to be left alone is not one the request is about.
  const named = namedIn(text.replace(LEAVE, " "));
  if (!named.length) return null;
  const extra = files.filter((f) => !covered(f, named));
  if (!extra.length) return null;
  const shown = extra.slice(0, 3).map((f) => clip(f, 80)).join(", ");
  const more = extra.length > 3 ? ` and ${extra.length - 3} more` : "";
  return { kind: "not_asked", say: `You asked about ${named.slice(0, 2).map((n) => clip(n, 60)).join(" and ")}, but this also changed ${shown}${more}.` };
}

// ---- said one thing, ran another ----

/** Words that promise to undo only part: its own work, this conversation, one file. */
const ONLY_OURS = /\b(?:only|just)\b[^.!?\n]{0,60}\b(?:my|our|this|these|the)\s+(?:own\s+)?(?:chang|edit|work|session|conversation|chat)|\b(?:revert|undo|roll\s*back|put\s+back)(?:ing)?\b[^.!?\n]{0,60}\b(?:from|in|of)\s+this\s+(?:conversation|chat|session|task)\b|\b(?:my|our)\s+(?:own\s+)?(?:changes|edits)\b[^.!?\n]{0,30}\bonly\b/i;
/** Words that promise to change nothing. */
const NO_CHANGE = /\b(?:read[- ]only|just\s+(?:look|read|check|inspect)|only\s+(?:look|read|check|inspect)|(?:won'?t|will\s+not|without|not\s+going\s+to)\s+(?:change|modify|touch|edit|write)\s+(?:anything|any\s+files?|your\s+files|the\s+files|the\s+code))\b/i;
/** Words that promise to keep something. */
const NO_DELETE = /\b(?:won'?t|will\s+not|without|not\s+going\s+to|never)\s+(?:delet|remov|eras|wip)\w*/i;
/** Words that promise a trial or something only on this Mac. */
const DRY = /\bdry[- ]run\b|\b(?:just|only)\s+(?:preview|plan)\b/i;
const LOCAL = /\b(?:locally|local\s+(?:database|db|copy|server|only)|on\s+(?:this|your)\s+mac|(?:in|on)\s+(?:development|dev)\b|not\s+(?:production|prod|live))\b/i;

const WRITES = new Set(["rm", "rmdir", "mv", "cp", "unlink", "shred", "truncate", "tee", "dd", "touch", "chmod", "chown", "ln", "patch"]);
const GIT_WRITES = new Set(["commit", "push", "reset", "checkout", "restore", "clean", "stash", "rebase", "merge", "cherry-pick", "revert", "rm", "mv", "add", "apply"]);
const DRY_FLAG = /^(?:--dry-run|-n|--plan|--preview|--check|--diff|plan|--what-if)$/;

/** Why one command undoes far more than its own work, or null: it puts files back to the last commit. */
function broadRevert(words: string[]): string | null {
  if (basename(words[0] ?? "") !== "git") return null;
  const args = words.slice(1);
  const sub = args.find((a) => !a.startsWith("-")) ?? "";
  const rest = args.slice(args.indexOf(sub) + 1);
  if (sub === "reset" && rest.includes("--hard")) return "git reset --hard, which throws away every change not saved in git";
  if (sub === "checkout" && (rest.includes("--") || rest.includes(".") || rest.includes("-f") || rest.includes("--force"))) return `git checkout ${rest.join(" ")}`.trim() + ", which puts files back to the last commit and loses every change not saved in git";
  if (sub === "restore" && !rest.includes("--staged")) return "git restore, which puts files back to the last commit and loses every change not saved in git";
  if (sub === "clean") return "git clean, which deletes files git does not track";
  if (sub === "stash" && !["list", "show"].includes(rest[0] ?? "")) return "git stash, which takes away every change not saved in git";
  return null;
}
const writes = (words: string[]): boolean => {
  const name = basename(words[0] ?? "");
  if (WRITES.has(name)) return true;
  if ((name === "sed" || name === "perl") && words.some((a) => /^-[A-Za-z]*i/.test(a))) return true;
  if (name === "git") return GIT_WRITES.has(words.slice(1).find((a) => !a.startsWith("-")) ?? "");
  if (["npm", "pnpm", "yarn", "bun", "pip", "pip3"].includes(name)) return ["install", "i", "add", "remove", "uninstall", "rm", "update", "upgrade"].includes(words[1] ?? "");
  return false;
};
const deletes = (words: string[]): boolean => {
  const name = basename(words[0] ?? "");
  return ["rm", "rmdir", "unlink", "shred"].includes(name) || (name === "git" && ["rm", "clean"].includes(words.slice(1).find((a) => !a.startsWith("-")) ?? "")) || (name === "find" && words.includes("-delete"));
};
const short = (c: string) => clip(redact(c).replace(/\s+/g, " ").trim(), 80);

/** "Said one thing, ran another": the first command that goes against what the agent said just before it. */
export function saidOther(steps: readonly SaidRan[], project: string): DriftFlag | null {
  for (const { said, command } of steps) {
    const words = String(said ?? "");
    if (!words.trim() || !command.trim()) continue;
    let parts: string[][];
    try { parts = commandsOf(command); } catch { continue; }
    if (ONLY_OURS.test(words)) {
      for (const w of parts) { const why = broadRevert(w); if (why) return { kind: "said_other", say: `It said it would undo only its own changes, but it ran ${why}.` }; }
    }
    if (NO_CHANGE.test(words) && parts.some(writes)) return { kind: "said_other", say: `It said it would not change anything, but it ran ${short(command)}.` };
    if (NO_DELETE.test(words) && parts.some(deletes)) return { kind: "said_other", say: `It said it would not delete anything, but it ran ${short(command)}.` };
    let live: string | null = null;
    try { live = liveCommand(command, project); } catch { live = null; }
    if (live && DRY.test(words) && !parts.some((w) => w.some((a) => DRY_FLAG.test(a)))) return { kind: "said_other", say: `It said it would only try this out, but it ran ${short(command)} for real.` };
    if (live && LOCAL.test(words)) return { kind: "said_other", say: `It said it would work only on this Mac, but it ran ${short(command)}, which reaches a live system.` };
  }
  return null;
}

/** Both flags for a finished task, at most one of each. */
export function driftFlags(o: { request: string; changed: readonly string[]; steps: readonly SaidRan[]; project: string }): DriftFlag[] {
  const out: DriftFlag[] = [];
  const a = notAsked(o.request, o.changed);
  if (a) out.push(a);
  const b = saidOther(o.steps, o.project);
  if (b) out.push(b);
  return out.map((f) => ({ kind: f.kind, say: clip(redact(f.say), 400) }));
}

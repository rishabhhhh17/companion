// M52: the plain words of a review, written by a model (T10: the cheap lane, the stronger one only for a stop or a change to
// sign in or payments). The model is given only what the rules already found, the list of files (a settings or key file
// by kind only, never its name or contents) and the change itself with every secret looking value hidden (teach.ts
// diffForExplain). It answers in a small JSON shape; anything else is dropped and the rules' own words are used.
import { clip, redact } from "../redact.ts";
import { isEnvFile } from "../secretfiles.ts";
import { listWords, touchWords, type FileChange, type Reason, type Touch } from "./rate.ts";

export type Words = { summary: string; notes: string[]; concern: boolean; concernSay?: string };

export const WORDS_SYSTEM = "You review a change that an AI coding tool just made to a person's project. The person is not an engineer. Answer only with the JSON object asked for.";

const KIND_WORDS: Record<FileChange["kind"], string> = { added: "added", modified: "changed", deleted: "removed" };
const MAX_LISTED = 40;
// A reason as the model is told it: a settings or key file is never named, not even in the rules' own sentence.
const forModel = (r: Reason): string => (r.kind === "secret_file_changed" ? "A settings or key file changed. It is not shown." : r.say.replace(/(^|[\s(,])\.?[\w.-]*\.env[\w.-]*|(^|[\s(,])\.env\b/g, "$1$2a settings file"));

/** The request for the words. Nothing in it comes from a settings or key file, and the diff is already redacted. */
export function wordsRequest(i: { files: FileChange[]; count: number; touches: Touch[]; reasons: Reason[]; diff: string; checks: string }): { text: string; system: string; raw: true } {
  const listed = i.files.filter((f) => !isEnvFile(f.file)).slice(0, MAX_LISTED).map((f) => `- ${f.file} (${KIND_WORDS[f.kind]})`);
  const secretFiles = i.files.filter((f) => isEnvFile(f.file)).length;
  const more = i.count - listed.length - secretFiles;
  const text = [
    "Here is a change another AI tool made to this project.",
    "",
    `Files (${i.count} in all):`,
    ...listed,
    ...(secretFiles ? [`- ${secretFiles === 1 ? "a settings or key file" : `${secretFiles} settings or key files`} (not shown, and never to be asked for)`] : []),
    ...(more > 0 ? [`- and ${more} more`] : []),
    "",
    `What it touches, by its files: ${i.touches.length ? listWords(i.touches.map(touchWords)) : "nothing special"}.`,
    `The project's own checks: ${i.checks}.`,
    ...(i.reasons.length ? ["", "Problems the rules already found (do not repeat them):", ...i.reasons.map((r) => `- ${forModel(r)}`)] : []),
    "",
    "The change (lines starting with - were taken away, + were added; secrets are hidden as [secret]):",
    i.diff || "(no text to show: only names changed, or the files are not text)",
    "",
    "Write for someone who is not an engineer. Short, plain sentences. No code, no file contents, no secret values, no long dashes.",
    'Reply with ONLY this JSON: {"summary": "one or two sentences: what changed, as the person would notice it", "notes": ["up to three short things worth checking, each one sentence; none if nothing"], "concern": true or false, "concernSay": "one sentence, only when concern is true"}',
    "Set concern to true only for a real problem the person would be hurt by (something that will break, data lost or opened to everyone, money or sign in going wrong, the opposite of what was likely meant). Style, naming and missing tests are not a concern. When unsure, false.",
  ].join("\n");
  return { text, system: WORDS_SYSTEM, raw: true };
}

const tidy = (s: unknown, max: number): string => (typeof s === "string" ? clip(redact(s).replace(/[–—]/g, ",").replace(/\s+/g, " ").trim(), max) : "");

/** The model's answer, or null when it is not the JSON asked for. Every string is redacted and cut again here. */
export function parseWords(text: string): Words | null {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let j: Record<string, unknown>;
  try { j = JSON.parse(text.slice(a, b + 1)); } catch { return null; }
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  const summary = tidy(j.summary, 400);
  if (!summary) return null;
  const notes = Array.isArray(j.notes) ? j.notes.map((n) => tidy(n, 200)).filter(Boolean).slice(0, 3) : [];
  const concern = j.concern === true;
  const concernSay = concern ? tidy(j.concernSay, 200) : "";
  return { summary, notes, concern, ...(concernSay ? { concernSay } : {}) };
}

/** The words when no model wrote any (none connected, the day's limit reached, or its answer could not be read). */
export function plainSummary(files: FileChange[], count: number): string {
  const names = files.slice(0, 3).map((f) => f.file);
  const rest = count - names.length;
  return `${count === 1 ? "1 file" : `${count} files`} changed: ${names.join(", ")}${rest > 0 ? ` and ${rest} more` : ""}.`;
}

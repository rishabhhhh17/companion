// A fix that starts from an error someone pasted (Fix it on an explained error, or an error typed into the ask box) must
// first check that the error still applies. The first Mac session showed why: the error was already fixed, and the task
// invented a cause and moved a script tag for no reason. The rule is words to the model (what to look at, what to say, and
// that nothing changes); nothing in it loosens any safety rule, which stays in code (AGENTS.md rule 12).
import { FOUND_INTRO } from "./fixfound.ts";

/** Where the page puts the error in a Fix it request (app/src/commands.ts fixError). */
const FIX_IT_MARKER = "The error, as I saw it:";

/** Is this the request Fix it sends for an error the person selected in another app? */
export const isFixItRequest = (prompt: string): boolean => String(prompt ?? "").includes(FIX_IT_MARKER);

export const STALE_ERROR_RULE = `Before you change anything, check that the error still applies. Read the file and line it names, look at whether the thing it names is still missing or wrong, and where it is cheap run the project's own check. If the error no longer applies (for example the function it says is not defined is defined now), change nothing: do not edit, move or rename anything. Say in plain words that it looks already fixed and why, such as "This error looks already fixed: showGallery is defined now." Never make up a cause for an error you cannot find in the project.`;

// What reads as pasted error text: the Fix it request, an error line of the usual kinds, a Python traceback, a TypeScript
// error code, or the common "x is not defined" family. It only decides whether the rule is added, so a miss costs a missing
// reminder and a false hit costs one cheap look.
const ERROR_SHAPES = [
  /^\s*(?:Uncaught\s+)?(?:[A-Z][A-Za-z]*)?(?:Error|Exception)\b:/m,
  /Traceback \(most recent call last\)/,
  /\berror TS\d{3,5}\b/,
  /\b\S+ is not (?:defined|a function|iterable)\b/,
  /\bCannot read propert(?:y|ies) of (?:undefined|null)\b/i,
  /\bModule not found\b|\bCannot find module\b/,
];

export function carriesPastedError(prompt: string): boolean {
  const p = String(prompt ?? "");
  if (isFixItRequest(p)) return true;
  // A check Squibby ran itself a moment ago is fresh, and its measured fixes stay as they were.
  if (p.startsWith(FOUND_INTRO)) return false;
  return ERROR_SHAPES.some((r) => r.test(p));
}

/** The request with the rule after it when it carries a pasted error; the same request, whole, when it does not. */
export function withStaleCheck(prompt: string): string {
  return carriesPastedError(prompt) && !prompt.includes(STALE_ERROR_RULE) ? `${prompt}\n\n${STALE_ERROR_RULE}` : prompt;
}

// M123 slice 1: "did it do what you asked? watch it try." The ask becomes 1 to 5 promises a person could check by looking
// (a page opens, some words show, a button works, the menu links to the page). Each maps to one hidden browser step, and
// each ends kept, not kept, or could not check. The stamp says works only when the checks passed and no checkable promise
// was broken; could not check never counts as kept and never hides a failure (rule 14: done means proven).
// Where the ask comes from (F33): Squibby's own runs use their request; for other tools the person types or pastes it on
// the done card (cleanAsk). The done hook still never reads another tool's input.
// Plain rules, no model. A later model phrasing must pass validPromise too: nothing the ask and the change do not name.
import type { BrowserOptions, BrowserResult } from "../proof/browser.ts";
import { clip, redact } from "../redact.ts";

export type PromiseKind = "opens" | "shows" | "presses" | "links";
export type AskPromise = { kind: PromiseKind; say: string; path: string; text?: string; label?: string; to?: string };
export type PromiseResult = "kept" | "not_kept" | "could_not_check";
export type PromiseOutcome = { promise: AskPromise; result: PromiseResult; why: string; shot?: string };
export type PromiseStep = { path: string; options: Pick<BrowserOptions, "shot" | "expectText" | "press"> };

export const MAX_PROMISES = 5;
export const MAX_ASK = 600;

/** The ask the person typed or pasted on the done card: one line, keys hidden, at most 600 characters. */
export function cleanAsk(text: string): string {
  return clip(redact(String(text ?? "").replace(/\s+/g, " ").trim()), MAX_ASK);
}

// A path written in the ask: "/pricing", "/settings/billing". Never the path part of a web address (that has "://" or a
// host before it, so it does not start after a space).
const PATH = /(?:^|[\s(,"'“‘])(\/[a-z0-9][a-z0-9_\-/]*)/gi;
// "a pricing page", "the new about page"
const WORD_PAGE = /\b(?:a|an|the|new|my|our)\s+(?:new\s+)?([a-z][a-z-]{1,30})\s+page\b/gi;
const HOME = new Set(["home", "landing", "main", "front", "start"]);
// 'Pay now', "Pay now", “Pay now”
const QUOTED = /(?:^|[\s(:])["“'‘]([^"”'’\n]{1,60})["”'’](?=$|[\s.,;:!?)])/g;
const BUTTON_BEFORE = /\bbutton\s+(?:that\s+says|saying|called|named|labell?ed|with(?:\s+the)?\s+(?:text|words?))\s*$/i;
const BUTTON_AFTER = /^\s+button\b/i;
const LINK = /\b(?:link\s+(?:it|this|that|them|to\s+it)?\s*(?:from|in|on|into)|add\s+(?:it|a\s+link)?\s*(?:to|in))\s+the\s+(menu|nav|navbar|navigation|header|footer|sidebar|top\s+bar)\b/i;

const tidyPath = (p: string) => { const t = p.replace(/[.,;:!?]+$/, "").replace(/\/+$/, ""); return t || "/"; };
const lower = (s: string) => s.toLowerCase();

/** Whether a promise only names what the ask or the change contains. Used on the rules' promises and on any model's. */
export function validPromise(p: AskPromise, ask: string, changed: readonly string[]): boolean {
  const a = lower(String(ask ?? "")), files = changed.map(lower);
  const pathOk = (path: string | undefined) => {
    if (typeof path !== "string" || path.length > 80 || !/^\/[a-z0-9_\-/]*$/i.test(path) || path.includes("//") || path.includes("..")) return false;
    if (path === "/") return true;
    return path.split("/").filter(Boolean).every((seg) => a.includes(lower(seg)) || files.some((f) => f.includes(lower(seg))));
  };
  const saidInAsk = (w: string | undefined) => typeof w === "string" && w.length > 0 && w.length <= 60 && a.includes(lower(w));
  if (!pathOk(p.path) || typeof p.say !== "string" || p.say.length > 140) return false;
  if (p.kind === "opens") return true;
  if (p.kind === "shows") return saidInAsk(p.text);
  if (p.kind === "presses") return saidInAsk(p.label);
  if (p.kind === "links") return saidInAsk(p.label) && pathOk(p.to);
  return false;
}

/** The promises in an ask, at most five, each one valid. An ask with nothing a person could see gives none. */
export function promisesFrom(ask: string, changed: readonly string[]): AskPromise[] {
  const text = String(ask ?? "");
  const out: AskPromise[] = [];
  const add = (p: AskPromise) => { if (!out.some((q) => q.say === p.say) && validPromise(p, text, changed)) out.push(p); };
  const files = changed.map(lower);

  // Pages: written paths first, then pages named in words that the change really made or touched.
  let page: { path: string; word?: string } | null = null;
  for (const m of text.matchAll(PATH)) {
    const path = tidyPath(m[1]);
    if (path === "/") continue;
    add({ kind: "opens", path, say: `${path} opens` });
    page ??= { path, word: path.split("/").filter(Boolean).pop() };
  }
  for (const m of text.matchAll(WORD_PAGE)) {
    const w = lower(m[1]);
    if (HOME.has(w)) { add({ kind: "opens", path: "/", say: "the home page opens" }); page ??= { path: "/" }; continue; }
    const made = files.some((f) => f.split("/").some((seg) => seg === w || seg.replace(/\.[^.]+$/, "") === w));
    if (!made) continue;
    add({ kind: "opens", path: `/${w}`, say: `a ${w} page opens at /${w}` });
    page ??= { path: `/${w}`, word: w };
  }
  const on = page?.path ?? "/";

  // Quoted words: a button to press when the words around them say button, else words that should show.
  for (const m of text.matchAll(QUOTED)) {
    const q = m[1].trim(), at = m.index ?? 0;
    if (!q) continue;
    const before = text.slice(Math.max(0, at - 40), at + (m[0].length - m[0].trimStart().length));
    const after = text.slice(at + m[0].length, at + m[0].length + 12);
    if (BUTTON_BEFORE.test(before) || BUTTON_AFTER.test(after)) add({ kind: "presses", path: on, label: q, say: `the “${q}” button works on ${on}` });
    else add({ kind: "shows", path: on, text: q, say: `“${q}” shows on ${on}` });
  }

  // "link it from the menu": the menu on the home page has a link with the page's name that leads there.
  const link = text.match(LINK);
  if (link && page && page.path !== "/" && page.word) {
    const where = link[1].replace(/\s+/g, " ");
    add({ kind: "links", path: "/", label: page.word, to: page.path, say: `the ${where} links to ${page.path}` });
  }

  // Pages first, then words, buttons and links, at most five.
  const order: PromiseKind[] = ["opens", "shows", "presses", "links"];
  return out.sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind)).slice(0, MAX_PROMISES);
}

/** The one hidden browser step that tries a promise. Every step takes a picture for the replay. */
export function stepFor(p: AskPromise): PromiseStep {
  if (p.kind === "shows") return { path: p.path, options: { shot: true, expectText: [p.text ?? ""] } };
  // press finds a button or link by its words (pressByLabel) and keeps its own guard against risky buttons; click would
  // take the words as a page selector.
  if (p.kind === "presses" || p.kind === "links") return { path: p.path, options: { shot: true, press: p.label ?? "" } };
  return { path: p.path, options: { shot: true } };
}

const why = (s: string) => clip(redact(String(s ?? "")), 200);

/** What the hidden browser's try means for a promise. A gap (a sign in, a page it could not reach) is could not check. */
export function outcomeFrom(p: AskPromise, r: BrowserResult): PromiseOutcome {
  const shot = r.shot?.jpeg;
  const base = { promise: p, ...(shot ? { shot } : {}) };
  if (r.skipped || r.notInstalled) return { ...base, result: "could_not_check", why: why(r.skipped ?? "The hidden browser could not run.") };
  if (r.gaps?.length) return { ...base, result: "could_not_check", why: why(r.gaps[0]) };
  if (r.ok) return { ...base, result: "kept", why: "" };
  return { ...base, result: "not_kept", why: why(r.problems[0] ?? r.consoleErrors[0] ?? "The hidden browser could not do it.") };
}

/** The stamp with promises: works only when the checks passed and no promise that could be checked was broken. */
export function stampWith(checksPassed: boolean, outcomes: readonly PromiseOutcome[]): "works" | "not_done" {
  if (!checksPassed) return "not_done";
  return outcomes.some((o) => o.result === "not_kept") ? "not_done" : "works";
}

/** Try each promise on the running app, one hidden browser step after another, with the ladder's own hints (sign in,
 *  timeout, page size, stop signal). A Stop leaves the rest as could not check; a browser that throws is could not check. */
export async function tryPromises(
  baseUrl: string, promises: readonly AskPromise[],
  browser: (url: string, o: BrowserOptions) => Promise<BrowserResult>, extra: Partial<BrowserOptions>,
): Promise<PromiseOutcome[]> {
  const out: PromiseOutcome[] = [];
  for (const p of promises) {
    if (extra.signal?.aborted) { out.push({ promise: p, result: "could_not_check", why: "Stopped." }); continue; }
    const step = stepFor(p);
    let url: string;
    try { url = new URL(step.path, baseUrl).href; } catch { out.push({ promise: p, result: "could_not_check", why: "The page address could not be made." }); continue; }
    try { out.push(outcomeFrom(p, await browser(url, { ...extra, ...step.options }))); }
    catch { out.push({ promise: p, result: "could_not_check", why: "The hidden browser stopped before it could try this." }); }
  }
  return out;
}

/** M123 slice 4: the largest picture a promise carries (base64 of the hidden browser's JPEG); a bigger one is left out. */
export const MAX_FRAME = 700_000;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
export type ReceiptPromise = { say: string; result: PromiseResult; why?: string; image?: string };
/** The promises as the receipt and the review card carry them. With pictures on (Make pictures, never off the record), each
 *  keeps the picture the hidden browser took while trying it: the app being built, never the person's screen. */
export function forReceipt(outcomes: readonly PromiseOutcome[], o: { pictures: boolean }): ReceiptPromise[] {
  return outcomes.map(({ promise, result, why, shot }) => ({ say: promise.say, result, ...(why ? { why } : {}),
    ...(o.pictures && typeof shot === "string" && shot.length <= MAX_FRAME && B64.test(shot) ? { image: shot } : {}) }));
}

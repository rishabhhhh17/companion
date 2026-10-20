// The hard set for the aim eval: four synthetic dashboards that imitate busy builder tools (a deploy settings page, a
// database table editor, a project settings page, a code host's repository page), each in light and dark, with every
// target labelled in the page (data-eval-target), so the truth is known from the page itself. Made up products, local
// files only: never a real website and never the person's screen.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { browserExecutable } from "../../runner/src/proof/browser.ts";
export type { Element } from "./score.ts";

const DIR = join(import.meta.dir, "pages");
/** One ask. target: the control it is about. also: other controls that answer it just as well (a hit on any is right).
 *  key: the words a control must say to answer it, so the words test can find any other control that says them. decoys:
 *  how many controls say those words on purpose and are wrong (another row's Edit, the other Save), so none is missed. */
export type HardAsk = { target: string; question: string; also?: string[]; key?: string; decoys?: number };
type Spec = { page: string; asks: HardAsk[] };
const SPECS = JSON.parse(readFileSync(join(import.meta.dir, "hard.json"), "utf8")) as Spec[];
export const PAGE_NAMES = SPECS.map((s) => s.page);

export type HardPage = { name: string; html: string; asks: HardAsk[] };

/** Every control that answers an ask: its target first, then the others that answer it as well. */
export const rightTargets = (a: HardAsk): string[] => [a.target, ...(a.also ?? [])];

/** The clickable controls of a page, read from its HTML (the same kinds FIND_ELEMENTS finds in the browser), with all the
 *  words each one says: its text, its label for screen readers, its placeholder and its value. */
export function controlsIn(html: string): { id: string | null; words: string }[] {
  const attr = (attrs: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1] ?? "";
  const clean = (t: string) => t.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const out: { at: number; id: string | null; words: string }[] = [];
  for (const m of html.matchAll(/<(button|a|summary)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    out.push({ at: m.index!, id: attr(m[2], "data-eval-target") || null, words: [attr(m[2], "aria-label"), clean(m[3])].filter(Boolean).join(" ") });
  }
  for (const m of html.matchAll(/<(input|select)\b([^>]*)>/gi)) {
    out.push({ at: m.index!, id: attr(m[2], "data-eval-target") || null, words: [attr(m[2], "aria-label"), attr(m[2], "placeholder"), attr(m[2], "value")].filter(Boolean).join(" ") });
  }
  return out.sort((a, b) => a.at - b.at).map(({ id, words }) => ({ id, words }));
}

/** Each page in light and dark, with its styles inlined (the hidden browser renders it from text, with no files around it). */
export function hardPages(): HardPage[] {
  const css = readFileSync(join(DIR, "base.css"), "utf8");
  return SPECS.flatMap((s) => {
    const html = readFileSync(join(DIR, `${s.page}.html`), "utf8").replace('<link rel="stylesheet" href="base.css">', `<style>${css}</style>`);
    return [
      { name: `${s.page}-light`, html, asks: s.asks },
      { name: `${s.page}-dark`, html: html.replace("<body>", '<body class="dark">'), asks: s.asks },
    ];
  });
}

/** Run in the page: every clickable control on screen, with its words and its label. The aim eval and the tests share it. */
export const FIND_ELEMENTS = `() => { const sel = 'a,button,[role=button],input,select,summary'; const out = []; for (const e of document.querySelectorAll(sel)) { const r = e.getBoundingClientRect(); const t = (e.innerText || e.value || e.getAttribute('aria-label') || '').trim().replace(/\\s+/g,' '); if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) continue; out.push({ t, id: e.getAttribute('data-eval-target'), x: r.x, y: r.y, w: r.width, h: r.height }); } return out; }`;

// The everyday set (everyday.json, pages/everyday): nine windows that imitate everyday apps, light only, each naming the
// app it imitates by the id the shell would send for it, so its asks go to the vision lane as a tutor for that app.
type EverydaySpec = { page: string; app: string; asks: HardAsk[] };
const EVERYDAY = JSON.parse(readFileSync(join(import.meta.dir, "everyday.json"), "utf8")) as EverydaySpec[];
export const EVERYDAY_NAMES = EVERYDAY.map((s) => s.page);
export type EverydayPage = HardPage & { app: string };

/** Each everyday window with its styles inlined. */
export function everydayPages(): EverydayPage[] {
  const dir = join(DIR, "everyday");
  const css = readFileSync(join(dir, "everyday.css"), "utf8");
  return EVERYDAY.map((s) => ({ name: `everyday-${s.page}`, app: s.app, asks: s.asks, html: readFileSync(join(dir, `${s.page}.html`), "utf8").replace('<link rel="stylesheet" href="everyday.css">', `<style>${css}</style>`) }));
}

/** The hidden browser the proof ladder uses (headless: nothing is shown on the screen), or null when it is not installed.
 *  playwright-core is the runner's own package, so it is loaded from there. */
export async function hiddenBrowser(): Promise<{ newContext: (o: object) => Promise<any>; close: () => Promise<void> } | null> {
  const exe = browserExecutable();
  if (!exe) return null;
  const { chromium } = await import(Bun.resolveSync("playwright-core", join(import.meta.dir, "..", "..", "runner")));
  return chromium.launch({ headless: true, executablePath: exe });
}

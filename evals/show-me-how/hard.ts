// The hard set for the aim eval: four synthetic dashboards that imitate busy builder tools (a deploy settings page, a
// database table editor, a project settings page, a code host's repository page), each in light and dark, with every
// target labelled in the page (data-eval-target), so the truth is known from the page itself. Made up products, local
// files only: never a real website and never the person's screen.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { browserExecutable } from "../../runner/src/proof/browser.ts";
export type { Element } from "./score.ts";

const DIR = join(import.meta.dir, "pages");
type Spec = { page: string; asks: { target: string; question: string }[] };
const SPECS = JSON.parse(readFileSync(join(import.meta.dir, "hard.json"), "utf8")) as Spec[];
export const PAGE_NAMES = SPECS.map((s) => s.page);

export type HardPage = { name: string; html: string; asks: { target: string; question: string }[] };

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

/** The hidden browser the proof ladder uses (headless: nothing is shown on the screen), or null when it is not installed.
 *  playwright-core is the runner's own package, so it is loaded from there. */
export async function hiddenBrowser(): Promise<{ newContext: (o: object) => Promise<any>; close: () => Promise<void> } | null> {
  const exe = browserExecutable();
  if (!exe) return null;
  const { chromium } = await import(Bun.resolveSync("playwright-core", join(import.meta.dir, "..", "..", "runner")));
  return chromium.launch({ headless: true, executablePath: exe });
}

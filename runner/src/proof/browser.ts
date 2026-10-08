// The browser check: open the page in a hidden browser (Playwright's own, never the user's Chrome),
// watch for errors, check the words and click through the part that changed. It only ever looks at
// the address it was given; it never sees the user's screen.
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { chromium } from "playwright-core";
import { runCommand } from "./exec.ts";

export const browsersPath = () => process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), "Library", "Application Support", "Companion", "browsers");

// The exact program to launch, found in our own private folder (never the user's Chrome).
export function browserExecutable(): string | null {
  try {
    const dir = readdirSync(browsersPath()).filter((d) => d.startsWith("chromium_headless_shell")).sort().pop();
    if (!dir) return null;
    const inner = readdirSync(join(browsersPath(), dir)).find((d) => d.startsWith("chrome-headless-shell"));
    const exe = inner ? join(browsersPath(), dir, inner, "chrome-headless-shell") : "";
    return exe && existsSync(exe) ? exe : null;
  } catch { return null; }
}
export const browserInstalled = () => browserExecutable() !== null;

// First use only: download the hidden browser (about 200 MB) into a private folder.
export async function installBrowser(): Promise<{ ok: boolean; detail: string }> {
  const cli = join(dirname(Bun.resolveSync("playwright-core/package.json", import.meta.dir)), "cli.js");
  if (!existsSync(cli)) return { ok: false, detail: "The browser installer was not found" };
  const r = await runCommand(`${JSON.stringify(process.execPath)} ${JSON.stringify(cli)} install chromium-headless-shell`, { cwd: homedir(), timeoutMs: 15 * 60_000, env: { PLAYWRIGHT_BROWSERS_PATH: browsersPath() } });
  return { ok: r.code === 0 && browserInstalled(), detail: (r.stderr || r.stdout).slice(-300) };
}

export type BrowserResult = { ok: boolean; skipped?: string; problems: string[]; consoleErrors: string[]; failedRequests: string[]; visited: string[]; ms: number };
export type BrowserOptions = { expectText?: string[]; click?: string; expectAfterClick?: string; timeoutMs?: number; clickButtons?: boolean };

// Buttons that sound like they send, pay, delete or publish are never pressed by a check.
const RISKY = /delet|remov|\bpay|buy|purchas|send|submit|sign.?out|log.?out|publish|deploy|reset|checkout|order|eras|clear|cancel|unsubscribe|subscribe|\bpost\b|confirm|donat|upload|install|download|transfer|withdraw|\bgo live/i;
const MAX_BUTTONS = 8;

const ignorable = (url: string) => /\/favicon\.ico(\?|$)/.test(url);
const blockedByUs = new Set<string>();

export async function browserCheck(url: string, o: BrowserOptions = {}): Promise<BrowserResult> {
  const t0 = Date.now();
  blockedByUs.clear();
  const result: BrowserResult = { ok: false, problems: [], consoleErrors: [], failedRequests: [], visited: [], ms: 0 };
  if (!browserInstalled()) return { ...result, skipped: "The hidden browser is not installed yet, so the page was not opened.", ms: 0 };
  const timeout = o.timeoutMs ?? 15000;
  const browser = await chromium.launch({ headless: true, executablePath: browserExecutable()! });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
    const page = await context.newPage();
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) result.visited.push(f.url()); });
    let pressing = "";
    const after = () => (pressing ? ` (after pressing "${pressing}")` : "");
    page.on("console", (m) => { if (m.type() === "error" && !/^Failed to load resource/.test(m.text())) result.consoleErrors.push(m.text() + after()); });
    page.on("pageerror", (e) => result.problems.push(`The page crashed with: ${e.message}${after()}`));
    page.on("requestfailed", (r) => { const why = r.failure()?.errorText ?? "failed"; if (!ignorable(r.url()) && !blockedByUs.has(r.url()) && !/ERR_ABORTED/.test(why)) result.failedRequests.push(`${r.url()} (${why})`); });
    let mainStatus = 0;
    page.on("response", (r) => {
      if (r.request().isNavigationRequest() && r.frame() === page.mainFrame() && !mainStatus) mainStatus = r.status();
      if (r.status() >= 400 && !ignorable(r.url()) && !r.request().isNavigationRequest()) result.failedRequests.push(`${r.url()} (${r.status()})`);
    });
    try { await page.goto(url, { waitUntil: "load", timeout }); }
    catch (e) { result.problems.push(`The page could not be reached: ${(e as Error).message.split("\n")[0]}`); return finish(result, t0); }
    if (mainStatus >= 400) result.problems.push(`The page answered with an error (${mainStatus})`);
    await page.waitForTimeout(500);

    const text = async () => (await page.locator("body").innerText({ timeout: 2000 }).catch(() => "")) ?? "";
    const body = await text();
    for (const want of o.expectText ?? []) if (!body.includes(want)) result.problems.push(`The words "${want}" are not on the page`);

    if (o.click) {
      try { await page.click(o.click, { timeout: Math.min(timeout, 5000) }); }
      catch { result.problems.push(`Could not find or click ${o.click} on the page`); return finish(result, t0); }
      if (o.expectAfterClick) {
        const ok = await page.waitForFunction((w) => document.body.innerText.includes(w), o.expectAfterClick, { timeout: 3000 }).then(() => true, () => false);
        if (!ok) result.problems.push(`After clicking ${o.click}, the words "${o.expectAfterClick}" did not appear`);
      }
      await page.waitForTimeout(300);
    }
    if (o.clickButtons !== false) await tryButtons(page, url, (label) => { pressing = label; }, timeout);
    return finish(result, t0);
  } finally { await browser.close().catch(() => {}); }
}

// Press each plain button once (a handful at most), to see whether the page still works when used.
// Never anything risky, never a form submit, and nothing may reach beyond the page's own address.
async function tryButtons(page: import("playwright-core").Page, url: string, setPressing: (label: string) => void, timeout: number) {
  const home = new URL(url).host;
  await page.context().route("**/*", (route) => {
    let ok = true;
    try { const u = new URL(route.request().url()); ok = u.host === home || u.protocol === "data:" || u.protocol === "blob:"; } catch { ok = false; }
    if (!ok) blockedByUs.add(route.request().url());
    return ok ? route.continue() : route.abort();
  });
  const pick = 'button[type="button"], button:not([type]):not(form button), [role="button"], input[type="button"]';
  const count = Math.min(await page.locator(pick).count().catch(() => 0), 40);
  let pressed = 0;
  for (let i = 0; i < count && pressed < MAX_BUTTONS; i++) {
    const b = page.locator(pick).nth(i);
    if (!(await b.isVisible().catch(() => false)) || !(await b.isEnabled().catch(() => false))) continue;
    const label = ((await b.innerText({ timeout: 1000 }).catch(() => "")) || (await b.getAttribute("value").catch(() => "")) || (await b.getAttribute("aria-label").catch(() => "")) || "").trim().slice(0, 60);
    if (RISKY.test(label)) continue;
    setPressing(label || "a button");
    pressed++;
    await b.click({ timeout: Math.min(timeout, 2000) }).catch(() => {});
    await page.waitForTimeout(300);
    if (page.url() !== url) await page.goto(url, { waitUntil: "load", timeout }).catch(() => {});
  }
  setPressing("");
}

function finish(r: BrowserResult, t0: number): BrowserResult {
  for (const c of r.consoleErrors) r.problems.push(`The page logged an error: ${c}`);
  for (const f of r.failedRequests) r.problems.push(`A file the page needs could not be loaded: ${f}`);
  r.ms = Date.now() - t0;
  r.ok = r.problems.length === 0;
  return r;
}

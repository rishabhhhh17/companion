// The browser check: open the page in a hidden browser (Playwright's own, never the user's Chrome),
// watch for errors, check the words and click through the part that changed. It only ever looks at
// the address it was given; it never sees the user's screen.
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { chromium } from "playwright-core";
import { runCommand, type RunOptions, type RunResult } from "./exec.ts";

export const browsersPath = () => process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), "Library", "Application Support", "Companion", "browsers");

// The exact program to launch, found in our own private folder (never the user's Chrome). Only a finished download counts:
// Playwright writes INSTALLATION_COMPLETE last, so a download that was stopped while it unpacked is not mistaken for a browser.
export function browserExecutable(root: string = browsersPath()): string | null {
  try {
    const dir = readdirSync(root).filter((d) => d.startsWith("chromium_headless_shell") && existsSync(join(root, d, "INSTALLATION_COMPLETE"))).sort().pop();
    if (!dir) return null;
    const inner = readdirSync(join(root, dir)).find((d) => d.startsWith("chrome-headless-shell"));
    const exe = inner ? join(root, dir, inner, "chrome-headless-shell") : "";
    return exe && existsSync(exe) ? exe : null;
  } catch { return null; }
}
export const browserInstalled = () => browserExecutable() !== null;

/** One line of Playwright's own download progress ("|■■■■   |  40% of 89.6 MiB"), as a percent and a size in MB. */
export function parseInstallProgress(line: string): { percent: number; mb: number } | null {
  const m = /\|\s*(\d{1,3})% of ([\d.]+) MiB\s*$/.exec(line.trim());
  if (!m) return null;
  const percent = Number(m[1]), mib = Number(m[2]);
  if (!(percent >= 0 && percent <= 100) || !Number.isFinite(mib)) return null;
  return { percent, mb: Math.round(mib * 1.048576) };
}

export type InstallProgress = { percent: number; mb?: number };
// ok: the browser is in place after the run, whatever else the installer said (see installBrowser).
export type InstallOutcome = { ok: boolean; detail: string; aborted?: boolean; timedOut?: boolean };
type Run = (command: string, o: RunOptions) => Promise<RunResult>;

// Playwright's installer adds FFmpeg (a video tool, about 1 MB, from the same servers) to every browser install, and prints
// its own "Downloading ..." line and progress bar for it after the browser's. Companion never uses it. Only the browser's
// own bar is progress; FFmpeg is part of "setting it up". The bar never goes back, even when Playwright tries a download again.
const BROWSER_DOWNLOAD = /\(playwright chromium-headless-shell v\d+\)|^Chrome Headless Shell\b/;
export function installProgressReader(onProgress: (p: InstallProgress) => void): (text: string) => void {
  let pending = "", current: "browser" | "other" | null = null, last = -1, mb: number | undefined;
  const say = (p: InstallProgress) => { if (p.percent <= last) return; last = p.percent; onProgress(p); };
  return (text: string) => {
    pending += text;
    const lines = pending.split(/\r?\n|\r/);
    pending = lines.pop() ?? "";
    if (pending.length > 4000) pending = pending.slice(-4000);
    for (const raw of lines) {
      const l = raw.replace(/\x1b\[[0-9;]*m/g, "").trim();
      const head = /^Downloading (.+)$/.exec(l);
      if (head) {
        const browser = BROWSER_DOWNLOAD.test(head[1]!);
        // Downloads run one after another, so when another one starts after the browser's, the browser is downloaded.
        if (!browser && current === "browser" && last >= 0) say({ percent: 100, ...(mb ? { mb } : {}) });
        current = browser ? "browser" : "other";
        continue;
      }
      if (current === "other") continue;
      const p = parseInstallProgress(l);
      if (!p) continue;
      mb = p.mb;
      say(p);
    }
  };
}

// Where the installer keeps its archive while it downloads: inside Companion's own browsers folder, not the Mac's shared
// temporary folder, so a download that was stopped (its archive is not cleaned up then) leaves nothing behind once this
// folder is cleared after the run. Playwright's own clean up only touches folders with browser names.
export const downloadScratch = (root: string = browsersPath()) => join(root, ".download");

// Download the hidden browser (about 200 MB on disk) into Companion's own folder, only when the person asked for it
// (see browsersetup.ts). Playwright's own installer does the download: from Playwright's own servers over https, tried again
// on failure, and thrown away if fewer bytes arrive than the server announced. The short environment means no setting of the
// person's can point it at another server. Stop everything ends it through the signal, and if the engine itself is ended by
// force, the installer ends with it (endWithUs). installer: the runner's own process tests only, a stand in for Playwright's.
// timeoutMs: 15 minutes, doubled by "my internet is slow".
export async function installBrowser(o: { signal?: AbortSignal; onProgress?: (p: InstallProgress) => void; run?: Run; installer?: string; timeoutMs?: number } = {}): Promise<InstallOutcome> {
  const cli = o.installer ?? join(dirname(Bun.resolveSync("playwright-core/package.json", import.meta.dir)), "cli.js");
  if (!existsSync(cli)) return { ok: false, detail: "The browser installer was not found" };
  const root = browsersPath(), scratch = downloadScratch(root);
  const clear = () => { try { rmSync(scratch, { recursive: true, force: true }); } catch { /* nothing to clear */ } };
  clear();
  try { mkdirSync(scratch, { recursive: true }); } catch { /* the installer says why if it cannot write here */ }
  try {
    const r = await (o.run ?? runCommand)(`${JSON.stringify(process.execPath)} ${JSON.stringify(cli)} install chromium-headless-shell`, {
      cwd: homedir(), timeoutMs: o.timeoutMs ?? 15 * 60_000, env: { PLAYWRIGHT_BROWSERS_PATH: root, TMPDIR: scratch }, signal: o.signal, endWithUs: true,
      onOutput: installProgressReader((p) => o.onProgress?.(p)),
    });
    // A failure after the browser is in place (FFmpeg not downloading, or a stop while it did) still leaves a browser that works.
    return { ok: browserInstalled(), detail: (r.stderr || r.stdout).slice(-300), ...(r.aborted ? { aborted: true } : {}), ...(r.timedOut ? { timedOut: true } : {}) };
  } finally { clear(); }
}

// A picture of the page as it first appears (before any button is pressed), and what is on it, for the visual receipt.
export type PageShot = { jpeg: string; w: number; h: number; items: import("./visualdiff.ts").PageItem[] };
// notInstalled: skipped only because the hidden browser is not on this Mac yet (the page then offers the download).
// gaps: something the check was asked to do and did not (a button from Settings it would not press), so the result is at
// best "passed with gaps".
export type BrowserResult = { ok: boolean; skipped?: string; notInstalled?: true; problems: string[]; consoleErrors: string[]; failedRequests: string[]; visited: string[]; ms: number; shot?: PageShot; gaps?: string[] };
// click and expectAfterClick: the project's own .claude/proof.json (a selector, as before). press and expectAfterPress: a
// button chosen in Settings, found by its label and pressed only when it is a plain button, link or tab whose words do not
// sound risky, checked again on the real element. viewport: the page size (today's 1280 by 800 when not given).
export type BrowserOptions = { expectText?: string[]; click?: string; expectAfterClick?: string; press?: string; expectAfterPress?: string; timeoutMs?: number; clickButtons?: boolean; shot?: boolean; signal?: AbortSignal; viewport?: { width: number; height: number } };

// Buttons that sound like they send, pay, delete or publish are never pressed by a check.
const RISKY = /delet|remov|\bpay|buy|purchas|send|submit|sign.?out|log.?out|publish|deploy|reset|checkout|order|eras|clear|cancel|unsubscribe|subscribe|\bpost\b|confirm|donat|upload|install|download|transfer|withdraw|\bgo live|eliminar|borrar|pagar|comprar|enviar|publicar|cerrar sesi|supprimer|payer|acheter|envoyer|publier|d[ée]connexion|l[öo]schen|bezahlen|kaufen|senden|absenden|abmelden|excluir|sair|remover|apagar|削除|送信|支払|购买|删除|发送|支付|삭제|결제|보내기/i;
const MAX_BUTTONS = 8;
/** Whether a button's words sound like it sends, pays, deletes or publishes: such a button is never pressed by a check. */
export const riskyLabel = (label: string): boolean => RISKY.test(label);

const ignorable = (url: string) => /\/favicon\.ico(\?|$)/.test(url);

export async function browserCheck(url: string, o: BrowserOptions = {}): Promise<BrowserResult> {
  const t0 = Date.now();
  const blockedByUs = new Set<string>();   // per check, so two checks at once never mix up their lists
  const result: BrowserResult = { ok: false, problems: [], consoleErrors: [], failedRequests: [], visited: [], ms: 0 };
  if (!browserInstalled()) return { ...result, skipped: "The hidden browser is not installed yet, so the page was not opened.", notInstalled: true, ms: 0 };
  if (o.signal?.aborted) return { ...result, skipped: "Stopped.", ms: 0 };
  const timeout = o.timeoutMs ?? 15000;
  let browser: import("playwright-core").Browser;
  try { browser = await chromium.launch({ headless: true, executablePath: browserExecutable()! }); }
  catch (e) { return { ...result, skipped: `The hidden browser could not be started (${(e as Error).message.split("\n")[0]}), so the page was not opened.`, ms: Date.now() - t0 }; }
  // However the check goes, the browser is closed by this deadline, so nothing is left running on the person's Mac.
  let hardStop: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<BrowserResult>((res) => { hardStop = setTimeout(() => { browser.close().catch(() => {}); res(finish({ ...result, problems: [...result.problems, "The page check took too long and was stopped"] }, t0)); }, timeout * 4 + 10_000); });
  // Stop: the browser closes at once and the check ends as skipped.
  let onAbort: (() => void) | undefined;
  const stopped = new Promise<BrowserResult>((res) => {
    if (!o.signal) return;
    onAbort = () => { browser.close().catch(() => {}); res({ ...result, skipped: "Stopped.", ms: Date.now() - t0 }); };
    if (o.signal.aborted) onAbort(); else o.signal.addEventListener("abort", onAbort, { once: true });
  });
  return await Promise.race([run(), deadline, stopped]).finally(() => { clearTimeout(hardStop); if (onAbort) o.signal?.removeEventListener("abort", onAbort); });

  async function run(): Promise<BrowserResult> {
  try {
    const view = o.viewport ?? { width: VIEW.w, height: VIEW.h };
    const context = await browser.newContext({ viewport: { width: view.width, height: view.height }, serviceWorkers: "block" });
    const page = await context.newPage();
    // Nothing a press does reaches beyond the page's own address, and writes are answered with "nothing to do".
    let guarded = false;
    // The press now going on, or the last one: its label, and whether the guard answered or stopped a request of its. What
    // the page does after that (a logged error, a crash on the stand in answer) comes from the guard, not the project: it
    // was not checked, so it is a gap, never a problem blamed on the code (and never a ring on a working button).
    let pressLabel = "", guardedPress = "";
    const pressStarts = (label: string) => { if (label !== pressLabel) guardedPress = ""; pressLabel = label; };
    const guard = async () => { if (guarded) return; guarded = true; await guardRoutes(page, url, blockedByUs, () => { if (pressLabel) guardedPress = pressLabel; }); };
    const fromGuard = (): boolean => {
      if (!guardedPress || guardedPress !== pressLabel) return false;
      const g = `Pressing "${guardedPress}" talks to a server, which a check never does, so what it does after that was not checked.`;
      if (!(result.gaps ??= []).includes(g)) result.gaps.push(g);
      return true;
    };
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) result.visited.push(f.url()); });
    let pressing = "";
    const after = () => (pressing ? ` (after pressing "${pressing}")` : "");
    page.on("console", (m) => { if (m.type() === "error" && !/^Failed to load resource/.test(m.text()) && !fromGuard()) result.consoleErrors.push(m.text() + after()); });
    page.on("pageerror", (e) => { if (!fromGuard()) result.problems.push(`The page crashed with: ${e.message}${after()}`); });
    page.on("requestfailed", (r) => { const why = r.failure()?.errorText ?? "failed"; if (!ignorable(r.url()) && !blockedByUs.has(r.url()) && !/ERR_ABORTED/.test(why)) result.failedRequests.push(`${r.url()} (${why})`); });
    let mainStatus = 0;
    page.on("response", (r) => {
      if (r.request().isNavigationRequest() && r.frame() === page.mainFrame() && !mainStatus) mainStatus = r.status();
      if (r.status() >= 400 && !ignorable(r.url()) && !r.request().isNavigationRequest()) result.failedRequests.push(`${r.url()} (${r.status()})`);
    });
    try { await page.goto(url, { waitUntil: "domcontentloaded", timeout }); await page.waitForLoadState("load", { timeout: Math.min(timeout, 5000) }).catch(() => {}); }
    catch (e) { result.problems.push(`The page could not be reached: ${(e as Error).message.split("\n")[0]}`); return finish(result, t0); }
    if (mainStatus >= 400) result.problems.push(`The page answered with an error (${mainStatus})`);
    await page.waitForTimeout(500);

    if (o.shot) result.shot = await pageShot(page, view).catch(() => undefined);
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
    if (o.press) {
      pressStarts(tidy(o.press).slice(0, 60));
      const p = await pressByLabel(page, o.press, guard, timeout);
      if (p.gap) (result.gaps ??= []).push(p.gap);
      if (p.problem) { result.problems.push(p.problem); return finish(result, t0); }
      if (p.pressed) {
        pressing = p.pressed;
        await page.waitForLoadState("load", { timeout: Math.min(timeout, 3000) }).catch(() => {});
        if (o.expectAfterPress) {
          const ok = await page.waitForFunction((w) => (document.body?.innerText ?? "").includes(w), o.expectAfterPress, { timeout: 3000 }).then(() => true, () => false);
          if (!ok) result.problems.push(`After pressing "${p.pressed}", the words "${o.expectAfterPress}" did not appear`);
        }
        await page.waitForTimeout(300);
        pressing = "";
        if (page.url() !== url) await page.goto(url, { waitUntil: "load", timeout }).catch(() => {});
      }
    }
    if (o.clickButtons !== false) await tryButtons(page, url, (label) => { pressing = label; if (label) pressStarts(label); }, timeout, guard);
    return finish(result, t0);
  } finally { await browser.close().catch(() => {}); }
  }
}

// Press each plain button once (a handful at most), to see whether the page still works when used.
// Never anything risky, never a form submit, and nothing may reach beyond the page's own address.
async function guardRoutes(page: import("playwright-core").Page, url: string, blockedByUs: Set<string>, answered: () => void = () => {}) {
  const home = new URL(url).host;
  await page.context().route("**/*", (route) => {
    let ok = true;
    try { const u = new URL(route.request().url()); ok = u.host === home || u.protocol === "data:" || u.protocol === "blob:"; } catch { ok = false; }
    if (!ok) { blockedByUs.add(route.request().url()); answered(); return route.abort(); }
    // Whatever the label says, a press never changes anything on a server: writes are answered with "nothing to do", as an
    // empty JSON object, so the common read of a JSON answer does not fail on the stand in.
    if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method())) { answered(); return route.fulfill({ status: 200, contentType: "application/json", body: "{}" }); }
    return route.continue();
  });
}

async function tryButtons(page: import("playwright-core").Page, url: string, setPressing: (label: string) => void, timeout: number, guard: () => Promise<void>) {
  await guard();
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

// What can be pressed by its label: buttons, links and tabs. Each is found by the words on it, its value, its accessible
// name or its title, ignoring capital letters and extra spaces.
const PRESSABLE = 'button, [role="button"], a[href], [role="link"], [role="tab"], input[type="button"], input[type="submit"]';
const tidy = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const NOT_PRESSED = (label: string, why: string) => `The check did not press "${label}", ${why}`;

/** The button chosen in Settings (check.press). Never pressed when its words, or the words on the real element, sound like it
 *  sends, pays, deletes or publishes, when it sends a form, or when it downloads something: that is a gap, never a pass.
 *  Not found on the page is a problem, as a missing word is. */
async function pressByLabel(page: import("playwright-core").Page, wanted: string, guard: () => Promise<void>, timeout: number): Promise<{ pressed?: string; gap?: string; problem?: string }> {
  const want = tidy(wanted).slice(0, 60);
  const risky = NOT_PRESSED(want, "because a check never presses a button whose words sound like it sends, pays, deletes or publishes.");
  if (!want) return {};
  if (RISKY.test(want)) return { gap: risky };
  const all = page.locator(PRESSABLE);
  const n = Math.min(await all.count().catch(() => 0), 200);
  for (let i = 0; i < n; i++) {
    const el = all.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    const words = [await el.innerText({ timeout: 1000 }).catch(() => ""), await el.getAttribute("value").catch(() => ""), await el.getAttribute("aria-label").catch(() => ""), await el.getAttribute("title").catch(() => "")].map(tidy);
    if (!words.some((w) => w.toLowerCase() === want.toLowerCase())) continue;
    // Checked again on the real element: every word it carries, whether it would send a form, whether it downloads.
    if (words.some((w) => w && RISKY.test(w))) return { gap: risky };
    const how = await el.evaluate((e) => {
      const form = (e instanceof HTMLButtonElement && e.type === "submit" && !!e.form) || (e instanceof HTMLInputElement && e.type === "submit");
      return form ? "form" : e.hasAttribute("download") ? "download" : "plain";
    }).catch(() => "form");
    if (how === "form") return { gap: NOT_PRESSED(want, "because it sends a form.") };
    if (how === "download") return { gap: NOT_PRESSED(want, "because it downloads something.") };
    if (!(await el.isEnabled().catch(() => false))) return { problem: `"${want}" is on the page but cannot be pressed` };
    await guard();
    try { await el.click({ timeout: Math.min(timeout, 5000) }); } catch { return { problem: `Could not press "${want}" on the page` }; }
    return { pressed: want };
  }
  return { problem: `Could not find a button or link called "${want}" on the page` };
}

function finish(r: BrowserResult, t0: number): BrowserResult {
  for (const c of r.consoleErrors) r.problems.push(`The page logged an error: ${c}`);
  for (const f of r.failedRequests) r.problems.push(`A file the page needs could not be loaded: ${f}`);
  r.ms = Date.now() - t0;
  r.ok = r.problems.length === 0;
  return r;
}

const VIEW = { w: 1280, h: 800 };
// Everything the person can see on the first screen: each piece of text, field, button and picture, with its place.
export function pageItems(): { key: string; x: number; y: number; w: number; h: number }[] {
  const out: { key: string; x: number; y: number; w: number; h: number }[] = [];
  const skip = new Set(["script", "style", "noscript", "template", "head", "meta", "link"]);
  const media = new Set(["img", "svg", "canvas", "video", "iframe", "picture"]);
  const fields = new Set(["input", "textarea", "select"]);
  for (const el of Array.from(document.body?.querySelectorAll("*") ?? [])) {
    const tag = el.tagName.toLowerCase();
    if (skip.has(tag)) continue;
    if (el.closest("svg") && tag !== "svg") continue;
    let text = "";
    if (media.has(tag)) text = (el.getAttribute("alt") || el.getAttribute("aria-label") || (el.getAttribute("src") ?? "").split("/").pop() || tag).slice(0, 80);
    else if (fields.has(tag)) { const f = el as HTMLInputElement; text = `${f.type ?? ""}:${f.placeholder || f.name || el.getAttribute("aria-label") || ""}:${f.type === "button" || f.type === "submit" ? f.value : ""}`; }
    else { for (const n of Array.from(el.childNodes)) if (n.nodeType === 3) text += n.textContent ?? ""; text = text.replace(/\s+/g, " ").trim().slice(0, 120); if (!text) continue; }
    const st = getComputedStyle(el);
    if (st.visibility === "hidden" || st.display === "none" || Number(st.opacity) < 0.05) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    out.push({ key: `${tag}:${text}`, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
    if (out.length >= 1500) break;
  }
  return out;
}

async function pageShot(page: import("playwright-core").Page, view: { width: number; height: number } = { width: VIEW.w, height: VIEW.h }): Promise<PageShot> {
  const items = await page.evaluate(pageItems);
  const jpeg = (await page.screenshot({ type: "jpeg", quality: 75, timeout: 5000 })).toString("base64");
  return { jpeg, w: view.width, h: view.height, items };
}

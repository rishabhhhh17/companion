// The browser check's one time download (F14: every user gets the browser check). It happens only when the person
// presses the button, it says how far along it is in plain words, a second press does nothing, and Stop everything ends it.
// Nothing here reaches the internet: the downloader is a stand in.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserSetup, pretendInstaller, type InstallFn } from "../src/proof/browsersetup.ts";
import { browserCheck, browserExecutable, installBrowser, parseInstallProgress } from "../src/proof/browser.ts";
import { PRODUCT, PRODUCT_S } from "../src/names.ts";

const made: string[] = [];
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-bs-"))); made.push(d); return d; };
// No test here may read or write Companion's real browsers folder on this Mac: each one gets its own empty folder.
const realBrowsers = process.env.PLAYWRIGHT_BROWSERS_PATH;
beforeEach(() => { process.env.PLAYWRIGHT_BROWSERS_PATH = tmp(); });
afterEach(() => {
  if (realBrowsers === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH; else process.env.PLAYWRIGHT_BROWSERS_PATH = realBrowsers;
  while (made.length) rmSync(made.pop()!, { recursive: true, force: true });
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Ev = Record<string, any>;
function setup(install: InstallFn, installed: () => boolean = () => false) {
  const events: Ev[] = [];
  let calls = 0;
  const counted: InstallFn = (o) => { calls++; return install(o); };
  const s = new BrowserSetup({ emit: (e) => events.push(e), install: counted, installed });
  return { s, events, calls: () => calls, of: (stage: string) => events.filter((e) => e.type === "browser.install" && e.stage === stage) };
}
// A download that reports progress, then waits until it is released (or stopped).
function held() {
  let release: (ok: boolean) => void = () => {};
  const install: InstallFn = ({ signal, onProgress }) => new Promise((res) => {
    onProgress({ percent: 0, mb: 94 });
    onProgress({ percent: 40, mb: 94 });
    signal.addEventListener("abort", () => res({ ok: false, detail: "", aborted: true }), { once: true });
    release = (ok) => res(ok ? { ok: true, detail: "" } : { ok: false, detail: "getaddrinfo ENOTFOUND cdn.playwright.dev" });
  });
  return { install, release: (ok: boolean) => release(ok) };
}

describe("asking whether the browser check is set up", () => {
  test("it says whether it is installed and whether a download is running, and never starts one", async () => {
    const r = setup(async () => ({ ok: true, detail: "" }), () => false);
    r.s.status();
    expect(r.events).toEqual([{ type: "browser.status", installed: false, installing: false }]);
    await sleep(20);
    expect(r.calls()).toBe(0);
  });
  test("while a download runs, the status says so", async () => {
    const h = held();
    const r = setup(h.install);
    const p = r.s.install();
    r.s.status();
    expect(r.events.find((e) => e.type === "browser.status")).toEqual({ type: "browser.status", installed: false, installing: true });
    h.release(true); await p;
  });
});

describe("the download, only when the person presses the button", () => {
  test("it reports each step in plain words and ends with Ready", async () => {
    let have = false;
    const r = setup(async ({ onProgress }) => { onProgress({ percent: 0, mb: 94 }); onProgress({ percent: 50, mb: 94 }); onProgress({ percent: 100, mb: 94 }); have = true; return { ok: true, detail: "" }; }, () => have);
    await r.s.install();
    const ds = r.of("downloading");
    expect(ds[0].detail).toMatch(/starting the download/i);
    expect(ds.find((e) => e.percent === 50)).toMatchObject({ percent: 50, mb: 94, detail: "Downloading the browser check: 50% of about 94 MB." });
    expect(ds.find((e) => e.percent === 100)!.detail).toMatch(/setting it up/i);
    expect(r.of("done")).toEqual([{ type: "browser.install", stage: "done", detail: "Ready. The next check will use it." }]);
    expect(r.events.at(-1)!.stage).toBe("done");
  });
  test("the same percent is not said twice", async () => {
    let have = false;
    const r = setup(async ({ onProgress }) => { for (const p of [10, 10, 10, 20]) onProgress({ percent: p, mb: 94 }); have = true; return { ok: true, detail: "" }; }, () => have);
    await r.s.install();
    expect(r.of("downloading").filter((e) => e.percent === 10)).toHaveLength(1);
  });
  test("a second press while downloading does nothing: one download, no new messages", async () => {
    const h = held();
    const r = setup(h.install);
    const first = r.s.install();
    const seen = r.events.length;
    await r.s.install();
    await r.s.install();
    expect(r.calls()).toBe(1);
    expect(r.events.length).toBe(seen);
    h.release(true); await first;
  });
  test("when it is already set up, pressing again downloads nothing and says it is ready", async () => {
    const r = setup(async () => ({ ok: true, detail: "" }), () => true);
    await r.s.install();
    expect(r.calls()).toBe(0);
    expect(r.of("done")).toHaveLength(1);
    expect(r.of("done")[0].detail).toMatch(/already set up/i);
  });
  test("Stop everything ends it, says so, and says nothing more about that download", async () => {
    const h = held();
    const r = setup(h.install);
    const p = r.s.install();
    r.s.stop();
    await p;
    expect(r.of("cancelled")).toHaveLength(1);
    expect(r.of("cancelled")[0].detail).toMatch(/^Stopped\./);
    expect(r.events.at(-1)!.stage).toBe("cancelled");
    expect(r.of("done")).toHaveLength(0);
    // and a new press after the stop starts a new download
    const again = r.s.install();
    expect(r.calls()).toBe(2);
    r.s.stop(); await again;
  });
  test("progress that arrives after a stop is not shown", async () => {
    let late: (p: { percent: number; mb?: number }) => void = () => {};
    const r = setup(({ signal, onProgress }) => new Promise((res) => { late = onProgress; signal.addEventListener("abort", () => setTimeout(() => res({ ok: false, detail: "", aborted: true }), 10), { once: true }); }));
    const p = r.s.install();
    r.s.stop();
    late({ percent: 70, mb: 94 });
    await p;
    expect(r.events.some((e) => e.percent === 70)).toBe(false);
  });
  test("Stop with nothing downloading does nothing", () => {
    const r = setup(async () => ({ ok: true, detail: "" }));
    r.s.stop();
    expect(r.events).toEqual([]);
  });
});

describe("when the download goes wrong, the words say what to do", () => {
  const failWith = async (out: { ok: boolean; detail: string; timedOut?: boolean }, installed = () => false) => { const r = setup(async () => out, installed); await r.s.install(); return r.of("failed")[0]; };
  test("no internet", async () => expect((await failWith({ ok: false, detail: "Error: getaddrinfo ENOTFOUND cdn.playwright.dev" })).detail).toBe(`${PRODUCT} could not reach the download server. Check your internet connection, then try again.`));
  test("a full disk", async () => expect((await failWith({ ok: false, detail: "ENOSPC: no space left on device, write" })).detail).toMatch(/not enough free space/i));
  test("too slow", async () => expect((await failWith({ ok: false, detail: "", timedOut: true })).detail).toMatch(/took too long/i));
  test("anything else: a plain line, never the raw output", async () => {
    const f = await failWith({ ok: false, detail: "Error: Download failure, code=1\n    at ChildProcess.<anonymous> (/x/coreBundle.js:33774:23)" });
    expect(f.detail).toBe("The download did not finish. Try again in a moment.");
  });
  test("an installer that failed after the browser was in place (FFmpeg, which the check never uses) ends in Ready, not a failure", async () => {
    let have = false;
    const r = setup(async () => { have = true; return { ok: false, detail: "Error: Failed to download FFmpeg (playwright ffmpeg v1013), caused by" }; }, () => have);
    await r.s.install();
    expect(r.of("failed")).toHaveLength(0);
    expect(r.of("done")).toEqual([{ type: "browser.install", stage: "done", detail: "Ready. The next check will use it." }]);
  });
  test("Stop everything after the browser was already in place says Ready, never that nothing was set up", async () => {
    let have = false;
    const r = setup(({ signal }) => new Promise((res) => { have = true; signal.addEventListener("abort", () => res({ ok: true, detail: "", aborted: true }), { once: true }); }), () => have);
    const p = r.s.install();
    r.s.stop(); await p;
    expect(r.of("cancelled")).toHaveLength(0);
    expect(r.of("done")).toHaveLength(1);
  });
  test("a download that says it worked but left no browser is a failure, not Ready", async () => {
    const f = await failWith({ ok: true, detail: "" }, () => false);
    expect(f).toBeDefined();
  });
  test("an installer that throws still ends the download, so the next press works", async () => {
    const r = setup(async () => { throw new Error("boom"); });
    await r.s.install();
    expect(r.of("failed")).toHaveLength(1);
    await r.s.install();
    expect(r.calls()).toBe(2);
  });
});

describe("the real downloader's progress", () => {
  test("Playwright's progress lines are read as percent and size", () => {
    expect(parseInstallProgress("|■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                                                |  40% of 89.6 MiB")).toEqual({ percent: 40, mb: 94 });
    expect(parseInstallProgress("|                                                                                |   0% of 89.6 MiB")).toEqual({ percent: 0, mb: 94 });
    expect(parseInstallProgress("Downloading Chrome Headless Shell 156.0.8078.4 from https://cdn.playwright.dev/x.zip")).toBeNull();
    expect(parseInstallProgress("|■■| 140% of 1 MiB")).toBeNull();
  });
  test("lines split across pieces of output are still read, and the stop signal reaches the command", async () => {
    const seen: { percent: number; mb?: number }[] = [];
    const ac = new AbortController();
    let gotSignal: AbortSignal | undefined;
    const run = async (_cmd: string, o: { onOutput?: (t: string) => void; signal?: AbortSignal; env?: Record<string, string> }) => {
      gotSignal = o.signal;
      for (const piece of ["Downloading Chrome Headless Shell\n|      |  1", "0% of 89.6 MiB\n|■■■■■■| 20", "% of 89.6 MiB\n"]) o.onOutput?.(piece);
      return { code: 1, signal: null, stdout: "", stderr: "", timedOut: false, ms: 1 };
    };
    const r = await installBrowser({ signal: ac.signal, onProgress: (p) => seen.push(p), run });
    expect(seen.map((p) => p.percent)).toEqual([10, 20]);
    expect(gotSignal).toBe(ac.signal);
    expect(r.ok).toBe(false);
  });
  // What Playwright 1.64 really prints for `install chromium-headless-shell`: the browser, then FFmpeg, which it adds to
  // every browser install (Companion never uses it). Read from its installer's source, 16 Oct 2026.
  const bar = (p: number, size: string) => { const row = Math.floor(p / 10); return `|${"■".repeat(row * 8)}${" ".repeat((10 - row) * 8)}| ${String(p).padStart(3)}% of ${size}`; };
  const browserHead = "Downloading Chrome Headless Shell 156.0.8078.4 (playwright chromium-headless-shell v1248) from https://cdn.playwright.dev/builds/cft/156.0.8078.4/mac-arm64/chrome-headless-shell-mac-arm64.zip";
  const ffmpegHead = "Downloading FFmpeg (playwright ffmpeg v1013) from https://cdn.playwright.dev/dbazure/download/playwright/builds/ffmpeg/1013/ffmpeg-mac-arm64.zip";
  const tens = (to = 100) => Array.from({ length: to / 10 + 1 }, (_, i) => i * 10);
  const feed = async (pieces: string[], code = 0) => {
    const seen: { percent: number; mb?: number }[] = [];
    const run = async (_c: string, o: { onOutput?: (t: string) => void }) => { for (const p of pieces) o.onOutput?.(p); return { code, signal: null, stdout: "", stderr: "", timedOut: false, ms: 1 }; };
    const r = await installBrowser({ onProgress: (p) => seen.push(p), run });
    return { seen, r };
  };
  test("FFmpeg's download after the browser's is not read as the browser's: the bar never goes back and the size stays the browser's", async () => {
    const out = [browserHead, ...tens().map((p) => bar(p, "89.6 MiB")), "Chrome Headless Shell 156.0.8078.4 (playwright chromium-headless-shell v1248) downloaded to /x/chromium_headless_shell-1248",
      ffmpegHead, ...tens().map((p) => bar(p, "1.1 MiB")), "FFmpeg (playwright ffmpeg v1013) downloaded to /x/ffmpeg-1013"].map((l) => l + "\n");
    const { seen } = await feed(out);
    const ps = seen.map((p) => p.percent);
    for (let i = 1; i < ps.length; i++) expect(ps[i]).toBeGreaterThanOrEqual(ps[i - 1]!);
    expect(seen.every((p) => p.mb === 94)).toBe(true);
    expect(ps.at(-1)).toBe(100);
  });
  test("when FFmpeg starts before the browser's last line was read, the browser is said to be downloaded (FFmpeg is part of setting it up)", async () => {
    const { seen } = await feed([browserHead, bar(0, "89.6 MiB"), bar(90, "89.6 MiB"), ffmpegHead, bar(0, "1.1 MiB"), bar(50, "1.1 MiB")].map((l) => l + "\n"));
    expect(seen.map((p) => p.percent)).toEqual([0, 90, 100]);
    expect(seen.at(-1)!.mb).toBe(94);
  });
  test("a browser download that Playwright tries again does not move the bar back", async () => {
    const { seen } = await feed([browserHead, bar(0, "89.6 MiB"), bar(60, "89.6 MiB"), browserHead, bar(0, "89.6 MiB"), bar(30, "89.6 MiB"), bar(70, "89.6 MiB")].map((l) => l + "\n"));
    expect(seen.map((p) => p.percent)).toEqual([0, 60, 70]);
  });
  test("the installer failing after the browser is in place (FFmpeg did not download) still counts: the browser check works", async () => {
    const prev = process.env.PLAYWRIGHT_BROWSERS_PATH;
    const root = tmp();
    const dir = join(root, "chromium_headless_shell-1248");
    mkdirSync(join(dir, "chrome-headless-shell-mac-arm64"), { recursive: true });
    writeFileSync(join(dir, "chrome-headless-shell-mac-arm64", "chrome-headless-shell"), "");
    writeFileSync(join(dir, "INSTALLATION_COMPLETE"), "");
    process.env.PLAYWRIGHT_BROWSERS_PATH = root;
    try {
      const { r } = await feed([browserHead + "\n", ffmpegHead + "\n", "Error: Failed to download FFmpeg (playwright ffmpeg v1013), caused by\n"], 1);
      expect(r.ok).toBe(true);
    } finally { if (prev === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH; else process.env.PLAYWRIGHT_BROWSERS_PATH = prev; }
  });
  test(`the installer keeps its archive in ${PRODUCT_S} own folder, and a stopped download leaves nothing there`, async () => {
    // Seen 16 Oct 2026: a stopped download left Playwright's 104 MB archive in the Mac's shared temporary folder.
    const prev = process.env.PLAYWRIGHT_BROWSERS_PATH;
    const root = tmp();
    process.env.PLAYWRIGHT_BROWSERS_PATH = root;
    let scratch = "";
    try {
      const run = async (_c: string, o: { env?: Record<string, string> }) => {
        scratch = o.env?.TMPDIR ?? "";
        if (!scratch.startsWith(root + "/")) throw new Error(`the installer's temporary folder is outside ${PRODUCT_S}: ${scratch}`);
        mkdirSync(join(scratch, "playwright-download-x"), { recursive: true });
        writeFileSync(join(scratch, "playwright-download-x", "chromium-headless-shell.zip"), "half an archive");
        return { code: null, signal: "SIGKILL", stdout: "", stderr: "", timedOut: false, ms: 1, aborted: true };
      };
      const r = await installBrowser({ run });
      expect(r.aborted).toBe(true);
      expect(scratch.startsWith(root + "/")).toBe(true);
      expect(readdirSync(root)).toEqual([]);
    } finally { if (prev === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH; else process.env.PLAYWRIGHT_BROWSERS_PATH = prev; }
  });
  test(`it installs into ${PRODUCT_S} own browsers folder, with Playwright's own installer and nothing else`, async () => {
    let cmd = "", env: Record<string, string> | undefined;
    const run = async (c: string, o: { env?: Record<string, string> }) => { cmd = c; env = o.env; return { code: 0, signal: null, stdout: "", stderr: "", timedOut: false, ms: 1 }; };
    await installBrowser({ run });
    expect(cmd).toMatch(/playwright-core\/cli\.js" install chromium-headless-shell$/);
    expect(env?.PLAYWRIGHT_BROWSERS_PATH).toBeTruthy();
  });
});

describe("what counts as installed", () => {
  const lay = (root: string, marker: boolean) => {
    const dir = join(root, "chromium_headless_shell-1248", "chrome-headless-shell-mac-arm64");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "chrome-headless-shell"), "");
    if (marker) writeFileSync(join(root, "chromium_headless_shell-1248", "INSTALLATION_COMPLETE"), "");
    return join(dir, "chrome-headless-shell");
  };
  test("a download that was stopped halfway (no finished marker) is not a browser", () => {
    const root = tmp(); lay(root, false);
    expect(browserExecutable(root)).toBeNull();
  });
  test("a finished one is", () => {
    const root = tmp(); const exe = lay(root, true);
    expect(browserExecutable(root)).toBe(exe);
  });
  test("an empty or missing folder is not", () => {
    expect(browserExecutable(tmp())).toBeNull();
    expect(browserExecutable(join(tmp(), "nope"))).toBeNull();
  });
  test("a check with no browser says the browser is the reason, so the page can offer it", async () => {
    const prev = process.env.PLAYWRIGHT_BROWSERS_PATH;
    process.env.PLAYWRIGHT_BROWSERS_PATH = tmp();
    try {
      const r = await browserCheck("http://127.0.0.1:9/");
      expect(r.skipped).toMatch(/not installed/);
      expect(r.notInstalled).toBe(true);
    } finally { if (prev === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH; else process.env.PLAYWRIGHT_BROWSERS_PATH = prev; }
  });
});

describe("the pretend download for the runner's own process tests", () => {
  test("it reports progress and then counts as installed, and a stop ends it", async () => {
    const p = pretendInstaller(1);
    const seen: number[] = [];
    expect(p.installed()).toBe(false);
    expect((await p.install({ signal: new AbortController().signal, onProgress: (x) => seen.push(x.percent) })).ok).toBe(true);
    expect(seen.at(-1)).toBe(100);
    expect(p.installed()).toBe(true);
    const q = pretendInstaller(50), ac = new AbortController();
    const run = q.install({ signal: ac.signal, onProgress: () => {} });
    ac.abort();
    expect((await run).aborted).toBe(true);
    expect(q.installed()).toBe(false);
  });
});

describe("nothing downloads the browser on its own", () => {
  // installBrowser() may be called from exactly one place: the setup that runs on the person's press.
  const src = new URL("../src/", import.meta.url).pathname;
  const files = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? files(join(d, f)) : f.endsWith(".ts") ? [join(d, f)] : []));
  test("only the button's setup calls the downloader", () => {
    const callers = files(src).filter((f) => /\binstallBrowser\(/.test(readFileSync(f, "utf8").replace(/export async function installBrowser\(/, "")));
    expect(callers.map((f) => f.slice(src.length))).toEqual(["proof/browsersetup.ts"]);
  });
  test("the runner program starts a download only for the browser.install command", () => {
    const main = readFileSync(join(src, "main.ts"), "utf8");
    const presses = main.match(/browser\.install\(\)/g) ?? [];
    expect(presses).toHaveLength(1);
    expect(main).toMatch(/cmd\.type === "browser\.install"\)[^\n]*browser\.install\(\)/);
  });
});

// The browser check's one time download (F14: every user gets the browser check). It runs only when the person presses
// the button on the card (the browser.install command), one download at a time, with its progress said in plain words.
// A second press while it runs does nothing, and Stop everything (or the app closing) ends it. If the app has to end the
// engine by force, the installer ends with it (see endWithUs in exec.ts).
import { browserInstalled, installBrowser, type InstallOutcome, type InstallProgress } from "./browser.ts";

export type InstallFn = (o: { signal: AbortSignal; onProgress: (p: InstallProgress) => void }) => Promise<InstallOutcome>;
type Emit = (e: Record<string, unknown>) => void;

// What went wrong, in words a person can act on. The installer's own output is never shown.
export function failureWords(r: InstallOutcome): string {
  if (r.timedOut) return "The download took too long and was stopped. Try again on a faster connection.";
  const t = r.detail;
  if (/ENOSPC|no space left/i.test(t)) return "There is not enough free space on your Mac. Free up about 300 MB, then try again.";
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|socket hang up|server closed connection|certificate|self.signed|proxy/i.test(t)) return "Companion could not reach the download server. Check your internet connection, then try again.";
  if (/installer was not found/i.test(t)) return "The browser installer is missing from this copy of Companion. Install Companion again, then try again.";
  return "The download did not finish. Try again in a moment.";
}

export const progressWords = (p: InstallProgress): string =>
  p.percent >= 100 ? "Downloaded. Setting it up, this takes a few seconds."
  : `Downloading the browser check: ${p.percent}%${p.mb ? ` of about ${p.mb} MB` : ""}.`;

export class BrowserSetup {
  private running: AbortController | null = null;
  private job: Promise<void> | null = null;
  private download: InstallFn;
  private installed: () => boolean;
  // installer: the runner's own process tests only, a stand in for Playwright's installer program (see engines.ts).
  constructor(private o: { emit: Emit; install?: InstallFn; installed?: () => boolean; installer?: string }) {
    this.download = o.install ?? ((x) => installBrowser({ ...x, ...(o.installer ? { installer: o.installer } : {}) }));
    this.installed = o.installed ?? browserInstalled;
  }

  /** Is it set up, and is a download running? Reading a folder only; never starts anything. */
  status(): void { this.o.emit({ type: "browser.status", installed: this.installed(), installing: this.running !== null }); }

  /** The person pressed the button. Resolves when this download has ended (or at once, if one is already running). */
  async install(): Promise<void> {
    if (this.running) return;   // a second press while it downloads does nothing
    const say = (stage: string, detail: string, extra: Record<string, unknown> = {}) => this.o.emit({ type: "browser.install", stage, detail, ...extra });
    if (this.installed()) { say("done", "The browser check is already set up. The next check will use it."); return; }
    const ac = new AbortController();
    this.running = ac;
    const run = (async () => {
      let last = -1;
      try {
        say("downloading", "Starting the download. This happens once.");
        let r: InstallOutcome | null = null;
        try {
          r = await this.download({
            signal: ac.signal,
            onProgress: (p) => {
              if (ac.signal.aborted || p.percent === last) return;
              last = p.percent;
              say("downloading", progressWords(p), { percent: p.percent, ...(p.mb ? { mb: p.mb } : {}) });
            },
          });
        } catch { r = null; }
        // What counts is whether the browser is in place. Playwright sets up FFmpeg (which the check never uses) after it,
        // so a failure or a stop at that point still leaves a check that works, and "nothing was set up" would be untrue.
        if (this.installed()) say("done", "Ready. The next check will use it.");
        else if (ac.signal.aborted || r?.aborted) say("cancelled", "Stopped. Nothing was set up. Press the button to start again.");
        else say("failed", r ? failureWords(r.ok ? { ...r, detail: "" } : r) : "The download did not finish. Try again in a moment.");
      } finally { if (this.running === ac) this.running = null; }
    })();
    this.job = run;
    await run;
  }

  /** Stop everything, or the app closing. Returns when the download has really ended. */
  stop(): Promise<void> { this.running?.abort(); return this.job ?? Promise.resolve(); }
}

// For the runner's own process tests only (the scripted engine): a pretend download, so no test reaches the internet.
export function pretendInstaller(stepMs: number): { install: InstallFn; installed: () => boolean } {
  let have = false;
  const wait = (ms: number, signal: AbortSignal) => new Promise<void>((res) => { const t = setTimeout(res, ms); signal.addEventListener("abort", () => { clearTimeout(t); res(); }, { once: true }); });
  return {
    installed: () => have,
    install: async ({ signal, onProgress }) => {
      for (let p = 0; p <= 100; p += 20) {
        if (signal.aborted) return { ok: false, detail: "", aborted: true };
        onProgress({ percent: p, mb: 94 });
        await wait(stepMs, signal);
      }
      if (signal.aborted) return { ok: false, detail: "", aborted: true };
      have = true;
      return { ok: true, detail: "" };
    },
  };
}

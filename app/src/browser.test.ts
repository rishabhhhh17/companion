// The browser check's one time download on the card (F14). The offer appears only when a check really skipped the page
// because no browser is installed (the engine says so with needs: "browser"), and every stage reads in plain words.
import { describe, expect, test } from "bun:test";
import { parseCommand, serialize } from "../../protocol/index.ts";
import { checkBrowser, getBrowser } from "./commands.ts";
import { browserView, initial, reduce, type Model } from "./model.ts";
import { S } from "./strings.ts";

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const task = ev({ type: "checkpoint.created", agent: "a", checkpoint: "cp_0001", label: "Before: add a page", files: 3, skipped: [] });
const missing = { rung: "browser", label: "Opening it in a browser", status: "skipped", detail: "The hidden browser is not installed yet, so the page was not opened.", needs: "browser" };
const gaps = ev({ type: "proof.result", agent: "a", verdict: "passed_with_gaps", steps: [{ rung: "checks", label: "Building", status: "passed", detail: "ok" }, missing], tries: 1 });
const progress = (percent: number) => ev({ type: "browser.install", stage: "downloading", detail: `Downloading the browser check: ${percent}% of about 94 MB.`, percent, mb: 94 });

describe("commands", () => {
  test("asking and pressing are valid protocol, and name no folder or address", () => {
    for (const c of [checkBrowser(), getBrowser()]) {
      expect(parseCommand(serialize(c)).ok).toBe(true);
      expect(Object.keys(c).sort()).toEqual(["id", "type", "v"]);
    }
    expect(getBrowser().type).toBe("browser.install");
    expect(checkBrowser().type).toBe("browser.check");
  });
});

describe("when the offer appears", () => {
  test("nothing is offered before any check", () => expect(browserView(initial())).toBeNull());
  test("a task's check that skipped the page for want of a browser offers it, with its size", () => {
    const v = browserView(run([task, gaps]))!;
    expect(v.line).toBe(S.browserNeeded);
    expect(v.button).toBe(S.browserGet);
    expect(S.browserGet).toMatch(/once/);
    expect(v.busy).toBe(false);
  });
  test("it is offered from a check with no task too (Rescue, Ship check)", () => {
    expect(browserView(run([gaps]))?.button).toBe(S.browserGet);
  });
  test("Point at the problem finding gaps for want of a browser offers it", () => {
    const m = run([{ type: "ui.findProblem" }, ev({ type: "problem.found", project: "/p", agent: "a", verdict: "passed_with_gaps", needs: "browser" })]);
    expect(m.point?.stage).toBe("gaps");
    expect(browserView(m)?.button).toBe(S.browserGet);
  });
  test("a preview that could not be opened for want of a browser offers it (it cannot go live until checked)", () => {
    const m = run([ev({ type: "ship.status", project: "/p", stage: "failed", detail: "The preview could not be checked.", previewUrl: "https://x.vercel.app", canGoLive: false, needs: "browser" })]);
    expect(m.shipFlow?.stage).toBe("failed");
    expect(browserView(m)?.button).toBe(S.browserGet);
    expect(browserView(run([ev({ type: "ship.status", project: "/p", stage: "failed", detail: "Vercel said no." })]))).toBeNull();
  });
  test("a page skipped for any other reason offers nothing (no guessing from the words)", () => {
    const other = ev({ type: "proof.result", agent: "a", verdict: "passed_with_gaps", steps: [{ rung: "browser", label: "Opening it in a browser", status: "skipped", detail: "The hidden browser is not installed yet, so the page was not opened." }], tries: 1 });
    expect(browserView(run([task, other]))).toBeNull();
    expect(browserView(run([task, ev({ type: "proof.result", agent: "a", verdict: "passed", steps: [{ rung: "browser", status: "passed", detail: "" }], tries: 1 })]))).toBeNull();
    expect(browserView(run([ev({ type: "problem.found", project: "/p", agent: "a", verdict: "passed_with_gaps" })]))).toBeNull();
  });
  test("a check whose page opened takes the offer away", () => {
    expect(browserView(run([gaps, ev({ type: "proof.result", agent: "a", verdict: "passed", steps: [{ rung: "browser", status: "passed", detail: "" }], tries: 1 })]))).toBeNull();
  });
  test("when the engine says it is already installed, nothing is offered", () => {
    expect(browserView(run([gaps, ev({ type: "browser.status", installed: true, installing: false })]))).toBeNull();
  });
});

describe("every stage of the download", () => {
  const offered = () => run([task, gaps]);
  test("pressed: starting, and the button cannot be pressed again", () => {
    const v = browserView(reduce(offered(), { type: "ui.browserInstallAsked" } as never))!;
    expect(v.line).toBe(S.browserStarting);
    expect(v.busy).toBe(true);
    expect(v.button).toBeUndefined();
  });
  test("a second press while it downloads changes nothing", () => {
    const m = run([{ type: "ui.browserInstallAsked" }, progress(40)], offered());
    expect(reduce(m, { type: "ui.browserInstallAsked" } as never)).toBe(m);
  });
  test("downloading: the percent and the real size, and a bar", () => {
    const v = browserView(run([{ type: "ui.browserInstallAsked" }, progress(40)], offered()))!;
    expect(v.line).toBe(S.browserProgress(40, 94));
    expect(v.line).toBe("Downloading the browser check: 40% of about 94 MB");
    expect(v.percent).toBe(40);
    expect(v.busy).toBe(true);
  });
  test("the first message, before any percent, says it is starting", () => {
    const v = browserView(run([ev({ type: "browser.install", stage: "downloading", detail: "Starting the download." })], offered()))!;
    expect(v.line).toBe(S.browserStarting);
    expect(v.percent).toBeUndefined();
  });
  test("all of it downloaded: being set up", () => {
    expect(browserView(run([progress(100)], offered()))!.line).toBe(S.browserSettingUp);
  });
  test("done: Ready, the next check will use it, and it can be closed", () => {
    const m = run([progress(40), ev({ type: "browser.install", stage: "done", detail: "Ready. The next check will use it." })], offered());
    const v = browserView(m)!;
    expect(v.line).toBe("Ready. The next check will use it.");
    expect(v.line).toBe(S.browserReady);
    expect(v.button).toBeUndefined();
    expect(v.closable).toBe(true);
    expect(browserView(reduce(m, { type: "ui.browserClosed" } as never))).toBeNull();
  });
  test("failed: the engine's plain reason and Try again", () => {
    const v = browserView(run([progress(10), ev({ type: "browser.install", stage: "failed", detail: "Companion could not reach the download server. Check your internet connection, then try again." })], offered()))!;
    expect(v.line).toMatch(/could not reach/);
    expect(v.button).toBe(S.browserTryAgain);
    expect(v.busy).toBe(false);
  });
  test("stopped: says so and offers it again", () => {
    const v = browserView(run([progress(10), ev({ type: "browser.install", stage: "cancelled", detail: "Stopped." })], offered()))!;
    expect(v.line).toBe(S.browserStopped);
    expect(v.button).toBe(S.browserGet);
  });
  test("Stop everything ends the download on the card at once", () => {
    const v = browserView(run([progress(30), { type: "app.stop_everything" }], offered()))!;
    expect(v.line).toBe(S.browserStopped);
    expect(v.busy).toBe(false);
  });
  test("the offer can be put away without downloading", () => {
    expect(browserView(reduce(offered(), { type: "ui.browserClosed" } as never))).toBeNull();
  });
  test("a download started from another page shows on this one too", () => {
    expect(browserView(run([progress(20)]))?.busy).toBe(true);
    expect(browserView(run([ev({ type: "browser.status", installed: false, installing: true })]))?.line).toBe(S.browserStarting);
  });
  test("a status that says nothing is running any more ends a download the card missed the end of", () => {
    const m = run([progress(60), ev({ type: "browser.status", installed: true, installing: false })], offered());
    expect(browserView(m)?.line).toBe(S.browserReady);
    expect(browserView(run([progress(60), ev({ type: "browser.status", installed: false, installing: false })], offered()))?.button).toBe(S.browserGet);
  });
  test("the engine restarting mid download offers it again instead of a bar that never moves", () => {
    const v = browserView(run([progress(30), { type: "app.runner_restarted" }], offered()))!;
    expect(v.busy).toBe(false);
    expect(v.button).toBe(S.browserGet);
  });
  test("a new task or another folder clears an old offer, but never a download that is running", () => {
    expect(browserView(run([task], offered()))).toBeNull();
    expect(browserView(run([{ type: "ui.projectChanged", project: "/other" }], offered()))).toBeNull();
    expect(browserView(run([progress(30), task], offered()))?.busy).toBe(true);
    expect(browserView(run([progress(30), { type: "ui.projectChanged", project: "/other" }], offered()))?.busy).toBe(true);
  });
});

describe("the words", () => {
  test("plain, short, and no raw codes", () => {
    for (const t of [S.browserNeeded, S.browserGet, S.browserStarting, S.browserSettingUp, S.browserReady, S.browserStopped, S.browserTryAgain, S.browserProgress(5, 94), S.browserProgress(5)]) {
      expect(t.length).toBeLessThan(140);
      expect(/[–—]|\bMiB\b|\bnull\b|\bundefined\b/.test(t), t).toBe(false);
    }
    expect(S.browserProgress(5)).toBe("Downloading the browser check: 5%");
  });
});

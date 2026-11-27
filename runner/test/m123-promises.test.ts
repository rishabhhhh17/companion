// M123 slice 1: "did it do what you asked". The ask becomes 1 to 5 promises a person could check by looking, a validator
// throws away any promise that names something the ask and the change do not contain, each promise maps to one hidden
// browser step, and the stamp says works only when the checks passed and no checkable promise was broken.
// Pure rules: no model, no browser, no files.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";
import { runLadder } from "../src/proof/ladder.ts";
import type { RunResult } from "../src/proof/exec.ts";
import { cleanAsk, forReceipt, MAX_FRAME, outcomeFrom, promisesFrom, stampWith, stepFor, tryPromises, validPromise, type AskPromise } from "../src/review/promises.ts";
import type { BrowserResult } from "../src/proof/browser.ts";

const ok: BrowserResult = { ok: true, problems: [], consoleErrors: [], failedRequests: [], visited: ["/pricing"], ms: 10 };
const fail = (p: string): BrowserResult => ({ ...ok, ok: false, problems: [p] });

describe("promises from an ask", () => {
  test("the founder's example: a page, linked from the menu", () => {
    const ps = promisesFrom("add a pricing page with three plans, and link it from the menu.", ["app/pricing/page.tsx", "components/nav.tsx"]);
    expect(ps.map((p) => p.kind)).toEqual(["opens", "links"]);
    expect(ps[0]).toMatchObject({ kind: "opens", path: "/pricing" });
    expect(ps[0].say).toBe("a pricing page opens at /pricing");
    expect(ps[1]).toMatchObject({ kind: "links", path: "/", label: "pricing", to: "/pricing" });
  });
  test("an explicit path wins and is kept as written", () => {
    const ps = promisesFrom("make /settings/billing show the plan", []);
    expect(ps[0]).toMatchObject({ kind: "opens", path: "/settings/billing" });
  });
  test("a page named in words only counts when the change made it", () => {
    expect(promisesFrom("add a pricing page", ["app/about/page.tsx"])).toEqual([]);
    expect(promisesFrom("add a pricing page", ["src/pages/pricing.tsx"])[0]).toMatchObject({ path: "/pricing" });
  });
  test("quoted words: a button to press, or text to see", () => {
    const ps = promisesFrom("on /checkout add a button that says \"Pay now\" and show 'Secure checkout' above it", []);
    expect(ps).toContainEqual(expect.objectContaining({ kind: "presses", path: "/checkout", label: "Pay now" }));
    expect(ps).toContainEqual(expect.objectContaining({ kind: "shows", path: "/checkout", text: "Secure checkout" }));
  });
  test("a quoted button with nothing else still gets a page to try it on", () => {
    expect(promisesFrom("add a 'Sign up' button", [])[0]).toMatchObject({ kind: "presses", path: "/", label: "Sign up" });
  });
  test("an ask with nothing a person could see gives no promises", () => {
    expect(promisesFrom("refactor the database helpers and speed up the tests", ["src/db.ts"])).toEqual([]);
    expect(promisesFrom("", [])).toEqual([]);
  });
  test("never more than five, and no duplicates", () => {
    const ask = "show 'a' and 'b' and 'c' and 'd' and 'e' and 'f' and 'a' on /x";
    const ps = promisesFrom(ask, []);
    expect(ps.length).toBe(5);
    expect(new Set(ps.map((p) => p.say)).size).toBe(5);
  });
  test("a web address is not a path", () => {
    expect(promisesFrom("copy the look of https://example.com/pricing", [])).toEqual([]);
  });
});

describe("the validator", () => {
  const ask = "add a pricing page and link it from the menu";
  const changed = ["app/pricing/page.tsx"];
  test("keeps what the ask or the change names", () => {
    expect(validPromise({ kind: "opens", path: "/pricing", say: "x" }, ask, changed)).toBe(true);
  });
  test("drops a page nobody named", () => {
    expect(validPromise({ kind: "opens", path: "/admin", say: "x" }, ask, changed)).toBe(false);
  });
  test("drops a button or text the ask never said", () => {
    expect(validPromise({ kind: "presses", path: "/", label: "Delete account", say: "x" }, ask, changed)).toBe(false);
    expect(validPromise({ kind: "shows", path: "/", text: "Free forever", say: "x" }, ask, changed)).toBe(false);
  });
  test("drops odd paths", () => {
    for (const path of ["pricing", "/../etc", "//evil.com", "/a?b=1", "/" + "a".repeat(90)]) expect(validPromise({ kind: "opens", path, say: "x" }, ask, changed)).toBe(false);
  });
});

describe("one browser step per promise", () => {
  test("opens, shows, presses, links", () => {
    expect(stepFor({ kind: "opens", path: "/pricing", say: "" })).toEqual({ path: "/pricing", options: { shot: true } });
    expect(stepFor({ kind: "shows", path: "/", text: "Hi", say: "" })).toEqual({ path: "/", options: { shot: true, expectText: ["Hi"] } });
    expect(stepFor({ kind: "presses", path: "/", label: "Go", say: "" })).toEqual({ path: "/", options: { shot: true, press: "Go" } });
    expect(stepFor({ kind: "links", path: "/", label: "pricing", to: "/pricing", say: "" })).toEqual({ path: "/", options: { shot: true, press: "pricing" } });
  });
});

describe("what happened to each promise", () => {
  const p: AskPromise = { kind: "opens", path: "/pricing", say: "a pricing page opens at /pricing" };
  test("kept, not kept, could not check", () => {
    expect(outcomeFrom(p, ok).result).toBe("kept");
    const bad = outcomeFrom(p, fail("The page answered 404."));
    expect(bad).toMatchObject({ result: "not_kept", why: "The page answered 404." });
    expect(outcomeFrom(p, { ...ok, ok: false, skipped: "The hidden browser is not installed yet, so the page was not opened.", notInstalled: true }).result).toBe("could_not_check");
    expect(outcomeFrom(p, { ...ok, ok: false, gaps: ["It asked for a sign in."] })).toMatchObject({ result: "could_not_check", why: "It asked for a sign in." });
  });
  test("a kept promise carries the picture", () => {
    expect(outcomeFrom(p, { ...ok, shot: { jpeg: "abc", w: 1, h: 1, items: [] } }).shot).toBe("abc");
  });
  test("a long problem is clipped and keys are hidden", () => {
    const o = outcomeFrom(p, fail("x".repeat(500) + " sk-ant-api03-" + "A".repeat(60)));
    expect(o.why.length).toBeLessThanOrEqual(200);
    expect(o.why).not.toContain("AAAAAAAAAAAAAAAAAAAA");
  });
});

describe("the stamp", () => {
  const kept = { promise: { kind: "opens", path: "/", say: "" } as AskPromise, result: "kept" as const, why: "" };
  const broke = { ...kept, result: "not_kept" as const };
  const unknown = { ...kept, result: "could_not_check" as const };
  test("works only when the checks passed and nothing checkable broke", () => {
    expect(stampWith(true, [kept, kept])).toBe("works");
    expect(stampWith(true, [kept, broke])).toBe("not_done");
    expect(stampWith(false, [kept])).toBe("not_done");
    expect(stampWith(true, [])).toBe("works");
  });
  test("could not check never counts as kept, and never hides a failure", () => {
    expect(stampWith(true, [unknown])).toBe("works");
    expect(stampWith(true, [unknown, broke])).toBe("not_done");
  });
});

describe("the ask typed on the done card (F33)", () => {
  test("trimmed, one line, clipped, keys hidden", () => {
    expect(cleanAsk("  add a\n\npricing   page  ")).toBe("add a pricing page");
    expect(cleanAsk("a".repeat(900)).length).toBe(600);
    expect(cleanAsk("use sk-ant-api03-" + "B".repeat(60))).not.toContain("BBBBBBBBBBBBBBBBBBBB");
    expect(cleanAsk("   ")).toBe("");
    expect(cleanAsk(undefined as unknown as string)).toBe("");
  });
});

describe("trying the promises on the running app", () => {
  const ps: AskPromise[] = [
    { kind: "opens", path: "/pricing", say: "a pricing page opens at /pricing" },
    { kind: "links", path: "/", label: "pricing", to: "/pricing", say: "the menu links to /pricing" },
  ];
  test("one step each, in order, on the app's own address, with the ladder's hints", async () => {
    const calls: [string, unknown][] = [];
    const browser = async (url: string, o: object) => { calls.push([url, o]); return url.endsWith("/pricing") ? ok : fail("No button or link named “pricing” was found."); };
    const out = await tryPromises("http://127.0.0.1:5173", ps, browser, { timeoutMs: 9000 });
    expect(calls.map((c) => c[0])).toEqual(["http://127.0.0.1:5173/pricing", "http://127.0.0.1:5173/"]);
    expect(calls[1][1]).toMatchObject({ press: "pricing", shot: true, timeoutMs: 9000 });
    expect(out.map((o) => o.result)).toEqual(["kept", "not_kept"]);
  });
  test("a stop leaves the rest as could not check, and a browser that throws is could not check", async () => {
    const ac = new AbortController();
    const browser = async () => { ac.abort(); return ok; };
    const out = await tryPromises("http://127.0.0.1:1/", ps, browser, { signal: ac.signal });
    expect(out.map((o) => o.result)).toEqual(["kept", "could_not_check"]);
    const boom = await tryPromises("http://127.0.0.1:1/", ps.slice(0, 1), async () => { throw new Error("crash"); }, {});
    expect(boom[0]).toMatchObject({ result: "could_not_check" });
  });
  test("no promises, no browser", async () => {
    let n = 0;
    expect(await tryPromises("http://127.0.0.1:1/", [], async () => { n++; return ok; }, {})).toEqual([]);
    expect(n).toBe(0);
  });
});

describe("the proof ladder tries the promises after the page opened", () => {
  const made: string[] = [];
  const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-m123-"))); made.push(d); return d; };
  afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
  const ladder = async (promises: AskPromise[] | undefined, answer: (url: string) => Partial<BrowserResult> = () => ({})) => {
    const dir = tmp(); writeFileSync(join(dir, "index.html"), "<!doctype html><h1>Hello</h1>");
    const store = new CheckpointStore(tmp(), dir); const snap = await store.snapshot("now");
    const urls: string[] = [];
    const r = await runLadder({ project: dir, store, beforeId: snap.id, afterId: snap.id, noRoomWaitsMs: [], ...(promises ? { promises } : {}),
      run: async () => ({ code: 0, stdout: "", stderr: "", timedOut: false } as RunResult),
      browser: async (url) => { urls.push(url); return { ...ok, visited: [url], ...answer(url) }; } });
    return { r, urls };
  };
  test("no promises: the ladder runs exactly as before", async () => {
    const { r, urls } = await ladder(undefined);
    expect(r.promises).toBeUndefined();
    expect(urls.length).toBe(1);
  });
  test("each promise is one more step, and a broken one does not change the verdict", async () => {
    const { r, urls } = await ladder([{ kind: "opens", path: "/pricing", say: "a pricing page opens at /pricing" }], (u) => (u.endsWith("/pricing") ? { ok: false, problems: ["The page answered 404."] } : {}));
    expect(urls.length).toBe(2);
    expect(urls[1]).toMatch(/\/pricing$/);
    expect(r.promises?.[0]).toMatchObject({ result: "not_kept", why: "The page answered 404." });
    expect(r.verdict === "passed" || r.verdict === "passed_with_gaps").toBe(true);
  });
});

describe("slice 4: a picture for each promise (watch it try)", () => {
  const out = (result: "kept" | "not_kept" | "could_not_check", shot?: string) => ({ promise: { kind: "opens" as const, path: "/", say: `p ${result}` }, result, why: result === "kept" ? "" : "x", ...(shot ? { shot } : {}) });
  test("each promise keeps its own picture when pictures are on", () => {
    const rows = forReceipt([out("kept", "AAAA"), out("not_kept", "BBBB"), out("could_not_check")], { pictures: true });
    expect(rows).toEqual([{ say: "p kept", result: "kept", image: "AAAA" }, { say: "p not_kept", result: "not_kept", why: "x", image: "BBBB" }, { say: "p could_not_check", result: "could_not_check", why: "x" }]);
  });
  test("no pictures when they are off, or off the record", () => {
    expect(forReceipt([out("kept", "AAAA")], { pictures: false })[0].image).toBeUndefined();
  });
  test("a picture too big or not a picture is left out, never cut", () => {
    expect(forReceipt([out("kept", "A".repeat(MAX_FRAME + 4))], { pictures: true })[0].image).toBeUndefined();
    expect(forReceipt([out("kept", "<svg onload=x>")], { pictures: true })[0].image).toBeUndefined();
  });
});

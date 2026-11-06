// M74, your way (docs/milestones/M74-your-way.md): the engine's side of the new settings. Each one adds a choice and keeps a
// fixed floor: the person's own lists only ever add to the built in ones, keys and open data always stop, the spend
// warning carries no amount, and safety copies never drop below what Undo needs now. Fixture folders only.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEvent, PROTOCOL_VERSION, reviewModeOf, type Command, type Event } from "../../protocol/index.ts";
import { AgentRunner } from "../src/agent.ts";
import { CheckpointStore } from "../src/checkpoints.ts";
import { ScriptedEngine } from "../src/engine.ts";
import type { FastLike } from "../src/lanes.ts";
import { Ledger } from "../src/ledger.ts";
import { coveredBy, patternTest, patternTests } from "../src/pathglob.ts";
import { ignoredPath, type WatchFn } from "../src/review/batcher.ts";
import { applyStrictness } from "../src/review/look.ts";
import { maxFilesOf, rate, stopTouchesOf, type RateInput } from "../src/review/rate.ts";
import { CHECKS_ONLY, ReviewService } from "../src/review/service.ts";
import { isEnvFile, ownSecretPatternCount, setOwnSecretPatterns } from "../src/secretfiles.ts";
import { RunnerSettings } from "../src/settings.ts";
import { warnCrossed } from "../src/spending.ts";
import { storeLimits } from "../src/storelimits.ts";
import { TaskLog } from "../src/tasklog.ts";

const made: string[] = [];
const services: ReviewService[] = [];
afterEach(() => {
  setOwnSecretPatterns([]);
  while (services.length) services.pop()!.stop();
  while (made.length) rmSync(made.pop()!, { recursive: true, force: true });
});
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-m74-${l}-`))); made.push(d); return d; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const write = (dir: string, files: Record<string, string>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(join(dir, p, ".."), { recursive: true }); writeFileSync(join(dir, p), c); } };

describe("names and paths the person adds (pathglob.ts)", () => {
  test("a name covers that file or folder anywhere, a path covers it from the project folder, capitals do not matter", () => {
    const t = patternTests(["notes", "*.csv", "docs/clients", "Drafts/"]);
    expect(coveredBy("notes/plan.md", t)).toBe(true);
    expect(coveredBy("src/notes", t)).toBe(true);
    expect(coveredBy("footnotes.md", t), "never part of a name").toBe(false);
    expect(coveredBy("data/sales.CSV", t)).toBe(true);
    expect(coveredBy("docs/clients/acme.md", t)).toBe(true);
    expect(coveredBy("docs/other.md", t)).toBe(false);
    expect(coveredBy("drafts/a.txt", t)).toBe(true);
    expect(coveredBy("/Users/me/shop/docs/clients/acme.md", t), "a whole path, by its last names").toBe(true);
  });
  test("a pattern that would cover everything, an empty one or a long one is left out", () => {
    for (const p of ["*", "**", "/", "./", ".", "  ", "*/*", "?", "x".repeat(121), 42, null]) expect(patternTest(p), String(p)).toBeNull();
    expect(patternTests(["*", "notes"]).length).toBe(1);
    expect(patternTests("notes")).toEqual([]);
  });
  test("** crosses folders, ? is one letter", () => {
    expect(coveredBy("a/b/c/secret-plan.txt", patternTests(["a/**/secret-*"]))).toBe(true);
    expect(coveredBy("v1.txt", patternTests(["v?.txt"]))).toBe(true);
    expect(coveredBy("v10.txt", patternTests(["v?.txt"]))).toBe(false);
  });
});

describe("Files never sent to Claude (privacy.neverSend)", () => {
  test("the person's own patterns are added to the built in rule", () => {
    expect(isEnvFile("clients/acme-contract.pdf")).toBe(false);
    setOwnSecretPatterns(["clients", "*.contract"]);
    expect(ownSecretPatternCount()).toBe(2);
    expect(isEnvFile("clients/acme-contract.pdf")).toBe(true);
    expect(isEnvFile("/Users/me/shop/legal/nda.contract")).toBe(true);
    expect(isEnvFile("src/App.tsx")).toBe(false);
  });
  test("nothing the person types removes the built in rule: .env and key files stay secret with any list, or none", () => {
    for (const list of [[], ["!.env"], ["-.env"], ["notes"], "not a list", null]) {
      setOwnSecretPatterns(list);
      for (const f of [".env", ".env.local", "config/prod.env", "id_rsa", "server.pem", "credentials.json", ".npmrc"]) expect(isEnvFile(f), `${JSON.stringify(list)} ${f}`).toBe(true);
    }
  });
  test("a pattern for everything is not taken, so the engine can still work", () => {
    setOwnSecretPatterns(["*", "**"]);
    expect(ownSecretPatternCount()).toBe(0);
    expect(isEnvFile("src/App.tsx")).toBe(false);
  });
  test("the engine takes the list from the settings the shell applies", () => {
    const s = new RunnerSettings();
    s.apply({ v: PROTOCOL_VERSION, id: "a", type: "settings.apply", values: { "privacy.neverSend": ["clients"] } } as never);
    setOwnSecretPatterns(s.get("privacy.neverSend"));
    expect(isEnvFile("clients/a.txt")).toBe(true);
    s.apply({ v: PROTOCOL_VERSION, id: "b", type: "settings.apply", values: {} } as never);
    setOwnSecretPatterns(s.get("privacy.neverSend"));
    expect(isEnvFile("clients/a.txt")).toBe(false);
  });
});

describe("Folders and files reviews skip (review.ignore)", () => {
  test("the person's own list is added to the built in one, which always holds", () => {
    const own = patternTests(["notes", "data/*.json"]);
    expect(ignoredPath("notes/today.md", own)).toBe(true);
    expect(ignoredPath("data/orders.json", own)).toBe(true);
    expect(ignoredPath("src/App.tsx", own)).toBe(false);
    for (const p of ["node_modules/x/index.js", ".git/HEAD", "dist/app.js", "a.tsbuildinfo"]) {
      expect(ignoredPath(p, []), p).toBe(true);
      expect(ignoredPath(p, own), p).toBe(true);
    }
  });
});

describe("Review changes in this project (review.modeHere)", () => {
  test("the project's own choice wins; Same as everywhere is the app's mode", () => {
    expect(reviewModeOf("ask", "same")).toBe("ask");
    expect(reviewModeOf("automatic", undefined)).toBe("automatic");
    expect(reviewModeOf("ask", "off")).toBe("off");
    expect(reviewModeOf("off", "automatic")).toBe("automatic");
    expect(reviewModeOf("nonsense", "nonsense")).toBe("ask");
  });
});

const base = (o: Partial<RateInput> = {}): RateInput => ({ changes: [{ file: "src/auth/login.ts", kind: "modified" }], touches: ["sign_in"], secrets: [], stillUsed: [], secretFiles: [], checks: "not_run", count: 1, capped: false, ...o });
describe("Also stop for (review.stopKinds)", () => {
  test("today: a change to sign in is worth a look, not a stop", () => {
    expect(rate(base()).rating).toBe("worth_a_look");
  });
  test("chosen: a change to sign in or payments is Fix this first, and Quiet still shows it", () => {
    const r = rate(base({ stopTouches: ["sign_in"] }));
    expect(r.rating).toBe("stop");
    expect(r.reasons[0]).toMatchObject({ kind: "chosen_stop" });
    expect(r.reasons[0].say).toContain("sign in");
    expect(applyStrictness(r, "quiet", new Set()).rating).toBe("stop");
    expect(rate(base({ stopTouches: ["payments"] })).rating, "payments not touched here").toBe("worth_a_look");
  });
  test("only sign in and payments can be chosen; keys always stop with nothing chosen", () => {
    expect(stopTouchesOf(["sign_in", "payments", "data", "secrets", 3])).toEqual(["sign_in", "payments"]);
    expect(stopTouchesOf("sign_in")).toEqual([]);
    const key = rate(base({ touches: [], stopTouches: [], secrets: [{ file: "src/a.ts", line: 3 }] }));
    expect(key.rating).toBe("stop");
    expect(key.reasons[0].kind).toBe("secret_in_code");
  });
});

describe("Biggest change to read file by file (review.maxFiles)", () => {
  test("50, 200 or 500; anything else is the usual 200", () => {
    expect([maxFilesOf("50"), maxFilesOf("500"), maxFilesOf("200"), maxFilesOf("9"), maxFilesOf(undefined)]).toEqual([50, 500, 200, 200, 200]);
    const many = base({ touches: [], count: 80, changes: Array.from({ length: 80 }, (_, i) => ({ file: `src/f${i}.ts`, kind: "modified" as const })) });
    expect(rate(many).reasons.some((x) => x.kind === "too_many")).toBe(false);
    expect(rate({ ...many, maxFiles: 50 }).reasons.some((x) => x.kind === "too_many")).toBe(true);
  });
});

describe("the spend warning (spend.warnAt)", () => {
  test("it is said only at the moment a project passes the chosen level of its daily limit", () => {
    expect(warnCrossed(7.9, 8.1, 10, "80")).toBe(80);
    expect(warnCrossed(8.1, 8.5, 10, "80"), "already past").toBeNull();
    expect(warnCrossed(4, 5, 10, "50")).toBe(50);
    expect(warnCrossed(4, 9, 10, "off")).toBeNull();
    expect(warnCrossed(4, 9, 10, "90"), "not a choice").toBeNull();
    expect(warnCrossed(0, 1, 0, "80")).toBeNull();
  });
  test("the engine says it once a day per project, with no amount in it, and Off says nothing", async () => {
    const run = async (warnAt?: string) => {
      const events: Event[] = [];
      const settings = new RunnerSettings();
      if (warnAt) settings.apply({ v: PROTOCOL_VERSION, id: "s", type: "settings.apply", values: { "spend.warnAt": warnAt } } as never);
      const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), ledger: new Ledger(":memory:"), dailyCeilingUsd: 10, settings });
      for (const usd of [3, 3, 2.5, 1, 1]) runner.bookSpend("/p/shop", usd);
      return events.filter((e) => e.type === "spending.warn") as any[];
    };
    const usual = await run();
    expect(usual.map((e) => ({ project: e.project, percent: e.percent }))).toEqual([{ project: "/p/shop", percent: 80 }]);
    for (const e of usual) {
      expect(parseEvent(JSON.stringify({ v: 1, id: "x", ...e })).ok).toBe(true);
      expect(Object.keys(e).filter((k) => !["v", "id", "ts", "type", "project", "percent"].includes(k)), "no amount, nothing else").toEqual([]);
    }
    expect((await run("50")).map((e) => e.percent)).toEqual([50]);
    expect(await run("off")).toEqual([]);
  });
});

describe("Safety copies (undo.keepSize, undo.keepAge)", () => {
  test("the usual values are what was built: about 2 GB and any age", () => {
    expect(storeLimits(() => undefined)).toEqual({ capBytes: 2 * 1024 ** 3, maxAgeDays: null });
    expect(storeLimits((k) => (k === "undo.keepSize" ? "5" : "30"))).toEqual({ capBytes: 5 * 1024 ** 3, maxAgeDays: 30 });
    expect(storeLimits((k) => (k === "undo.keepSize" ? "100" : "forever"))).toEqual({ capBytes: 2 * 1024 ** 3, maxAgeDays: null });
  });
  test("past the age, old copies go, but starred saves, guarded ones and the newest 20 stay", async () => {
    const p = tmp("p"), shadow = join(tmp("s"), "p.git");
    writeFileSync(join(p, "a.txt"), "0");
    const s = new CheckpointStore(shadow, p, { keepNewest: 100, pruneSlack: 0 });
    let now = Date.now();
    s.ageNow = () => now;
    const first = await s.snapshot("Before: the starred one");
    const second = await s.snapshot("Before: the one History points at");
    expect(s.mark(first.id, { star: true }).ok).toBe(true);
    s.guard(() => [second.id]);
    for (let i = 1; i <= 25; i++) { writeFileSync(join(p, "a.txt"), String(i)); await s.snapshot(`Review: ${i}`); }
    expect((await s.list()).length).toBe(27);
    // 30 days later, with a 7 day limit: the old ones go at the next snapshot.
    now += 30 * 24 * 60 * 60_000;
    s.setLimits({ maxAgeDays: 7 });
    expect(s.limits().maxAgeDays).toBe(7);
    writeFileSync(join(p, "a.txt"), "new"); await s.snapshot("Review: new");
    const left = (await s.list()).map((c) => c.id);
    expect(left).toContain(first.id);
    expect(left).toContain(second.id);
    expect(left.length).toBe(22);   // the two kept above and the newest 20
  });
  test("with any age (the usual), nothing goes for being old", async () => {
    const p = tmp("p"), shadow = join(tmp("s"), "p.git");
    writeFileSync(join(p, "a.txt"), "0");
    const s = new CheckpointStore(shadow, p, { keepNewest: 100, pruneSlack: 0 });
    s.ageNow = () => Date.now() + 365 * 24 * 60 * 60_000;
    for (let i = 1; i <= 25; i++) { writeFileSync(join(p, "a.txt"), String(i)); await s.snapshot(`Review: ${i}`); }
    expect((await s.list()).length).toBe(25);
  });
});

// The review service with a stand in watcher and stand in models (as review-service.test.ts).
function setup(values: Record<string, unknown>) {
  const project = tmp("proj"), shadow = tmp("shadow");
  write(project, { "src/App.tsx": "export const title = 'Hello';\n", "notes/today.md": "plan\n" });
  const store = new CheckpointStore(join(shadow, "p.git"), project);
  const events: Record<string, any>[] = [];
  let send: ((rel: string) => void) | null = null;
  const watch: WatchFn = (_d, on) => { send = on; return { close: () => { send = null; } }; };
  const asked: string[] = [];
  const lane: FastLike = { run: async () => { asked.push("model"); return { text: JSON.stringify({ summary: "Changed.", notes: [], concern: false }), costUsd: 0.001 }; } };
  const all: Record<string, unknown> = { "review.mode": "ask", "flow.on": true, ...values };
  const seenProject: (string | undefined)[] = [];
  const svc = new ReviewService({
    emit: (e) => events.push(e), setting: (k, p) => { if (k === "review.modeHere") seenProject.push(p); return all[k]; }, store: () => store,
    cheap: lane, strong: lane, spend: { room: () => 10, book: () => {} }, watch, graceMs: 20, quietMs: () => 30,
  });
  services.push(svc);
  const change = (files: Record<string, string>) => { write(project, files); for (const f of Object.keys(files)) send?.(f); };
  const until = async (pred: () => boolean, ms = 8000) => { for (let i = 0; i < ms / 20 && !pred(); i++) await sleep(20); expect(pred()).toBe(true); };
  const of = (t: string) => events.filter((e) => e.type === t);
  const cmd = (type: string, extra: Record<string, unknown> = {}) => ({ v: PROTOCOL_VERSION, id: `c_${type}`, type, project, ...extra }) as Command;
  return { project, svc, events, change, until, of, cmd, asked, seenProject, watching: () => send !== null };
}

describe("the review service with the new settings", () => {
  test("this project Off: its folder is not watched even with reviews on everywhere, and the setting is asked for this project", async () => {
    const t = setup({ "review.modeHere": "off" });
    t.svc.setProject(t.project);
    await t.svc.ready();
    expect(t.watching()).toBe(false);
    expect(t.seenProject).toContain(t.project);
    expect(t.svc.cannotReview(t.project)).toContain("off");
  });
  test("this project Automatic, with Ask first everywhere: a batch is reviewed by itself", async () => {
    const t = setup({ "review.modeHere": "automatic" });
    t.svc.setProject(t.project);
    await t.svc.ready();
    t.change({ "src/App.tsx": "export const title = 'Hi';\n" });
    await t.until(() => t.of("review.result").length === 1);
    expect(t.of("review.batch")[0].auto).toBe(true);
  });
  test("Checks only: no model is asked, and the card says the rules wrote the words", async () => {
    const t = setup({ "review.send": "checksOnly" });
    t.svc.setProject(t.project);
    await t.svc.ready();
    t.change({ "src/App.tsx": "export const title = 'Hi';\n" });
    await t.until(() => t.of("review.batch").length === 1);
    await t.svc.handle(t.cmd("review.now", { batch: t.of("review.batch")[0].batch }) as never);
    const [r] = t.of("review.result");
    expect(r).toMatchObject({ ok: true, lane: "none", note: CHECKS_ONLY, usdEstimate: 0 });
    expect(t.asked).toEqual([]);
  });
  test("a skipped folder never wakes a batch and is left out of one", async () => {
    const t = setup({ "review.ignore": ["notes"] });
    t.svc.setProject(t.project);
    await t.svc.ready();
    t.change({ "notes/today.md": "a new plan\n" });
    await sleep(200);
    expect(t.of("review.batch")).toEqual([]);
    t.change({ "src/App.tsx": "export const title = 'Hi';\n", "notes/today.md": "another plan\n" });
    await t.until(() => t.of("review.batch").length === 1);
    expect(t.of("review.batch")[0].files.map((f: { file: string }) => f.file)).toEqual(["src/App.tsx"]);
  });
});

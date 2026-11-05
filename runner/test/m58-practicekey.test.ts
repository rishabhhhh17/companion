// M58 feature 9, the sixth practice (docs/milestones/M58-fix-and-first-run.md, B2): Squibby plays the AI tool. A fixed
// script with no model (practicekey.ts) writes a made up payments key into the practice copy, the review's own rules stop
// it with no model and no cost, and the fixed fix moves it to .env.local, also with no model. Every folder here is a
// temporary fixture; nothing is written anywhere but a practice copy of this practice.
import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEvent, PROTOCOL_VERSION } from "../../protocol/index.ts";
import { CheckpointStore } from "../src/checkpoints.ts";
import type { FastLike } from "../src/lanes.ts";
import { NAMES } from "../src/names.ts";
import { fixedFix, isKeyPractice, KEY_PLACE, keyInCode, practiceKeyStep, PRETEND_KEY, pretendWrite, type PracticeKeyDeps } from "../src/practicekey.ts";
import { hasKeyShape } from "../src/redact.ts";
import { rate, secretsInCode } from "../src/review/rate.ts";
import { ReviewService } from "../src/review/service.ts";
import type { WatchFn } from "../src/review/batcher.ts";

const SAMPLE = join(import.meta.dir, "../../app/sample/stuck-key");
const CATALOG = JSON.parse(readFileSync(join(import.meta.dir, "../../app/sample/practices.json"), "utf8")) as { practices: { id: string; folder: string; order: number; find: string; fix: string; prove: string; expect: { file: string; line: number; about: string }; needsNode: boolean; budgetUsd: number; costUsd: number }[] };
const made: string[] = [];
const services: ReviewService[] = [];
afterEach(() => { while (services.length) services.pop()!.stop(); while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** A copy of the sample in a temporary home, in a folder named the way the shell names it (or any other name). */
function copy(name = `${NAMES.practiceCopyBase} key in the code`, from = SAMPLE): string {
  const home = mkdtempSync(join(tmpdir(), "companion-test-practicekey-")); made.push(home);
  const dir = join(home, name);
  cpSync(from, dir, { recursive: true });
  return dir;
}
const pay = (dir: string) => readFileSync(join(dir, "pay.js"), "utf8");

describe("the catalog entry", () => {
  test("the key practice comes first, is found by the review, fixed by a fixed move, and needs no Node, no model and no money", () => {
    const e = CATALOG.practices.find((p) => p.id === "key")!;
    expect(e).toMatchObject({ folder: "stuck-key", find: "review", fix: "fixed", prove: "review", needsNode: false, budgetUsd: 0, costUsd: 0 });
    expect([...CATALOG.practices].sort((a, b) => a.order - b.order)[0].id).toBe("key");
    // The place the review points at is the one practicekey.ts writes.
    expect(e.expect).toEqual({ file: KEY_PLACE.file, line: KEY_PLACE.line, about: "secret_in_code" });
  });
});

describe("the pretend AI's change", () => {
  test("writes the fixed made up key into pay.js of a practice copy of this practice, and nothing else", () => {
    const dir = copy(), before = pay(dir);
    expect(isKeyPractice(dir)).toBe(true);
    expect(keyInCode(dir)).toBe(false);
    const r = pretendWrite(dir);
    expect(r).toEqual({ ok: true, wrote: true, file: "pay.js", line: 2 });
    const after = pay(dir).split("\n");
    expect(after[1]).toContain(PRETEND_KEY);
    // Every other line is as it was, and no other file is touched.
    expect(after.slice(3).join("\n")).toBe(before.split("\n").slice(2).join("\n"));
    expect(readFileSync(join(dir, "server.js"), "utf8")).toBe(readFileSync(join(SAMPLE, "server.js"), "utf8"));
    expect(existsSync(join(dir, ".env.local"))).toBe(false);
    expect(keyInCode(dir)).toBe(true);
  });
  test("the value is fixed and made up: shaped like a payments key, but no provider issues it, so no real key's rule matches it", () => {
    expect(PRETEND_KEY).toMatch(/^sk_practice_[a-z0-9]{16,}$/);
    expect(PRETEND_KEY).not.toMatch(/sk_(live|test)_|rk_(live|test)_/);
    expect(hasKeyShape(PRETEND_KEY)).toBe(false);
    // It is the named value the review's own rule catches (a secret's name given a quoted value).
    const dir = copy(); pretendWrite(dir);
    const lines = pay(dir).split("\n").map((text, i) => ({ file: "pay.js", line: i + 1, text }));
    expect(secretsInCode(lines)).toEqual([{ file: "pay.js", line: 2 }]);
  });
  test("pressed again, it writes nothing more: the key is already there", () => {
    const dir = copy(); pretendWrite(dir);
    const once = pay(dir);
    expect(pretendWrite(dir)).toEqual({ ok: true, wrote: false, file: "pay.js", line: 2 });
    expect(pay(dir)).toBe(once);
  });
  test("refused anywhere but a practice copy of this practice: a folder of the person's, another practice, a changed copy", () => {
    // The same files in a folder of the person's own name.
    const mine = copy("my shop");
    expect(isKeyPractice(mine)).toBe(false);
    expect(pretendWrite(mine)).toMatchObject({ ok: false });
    expect(pay(mine)).toBe(readFileSync(join(SAMPLE, "pay.js"), "utf8"));
    // Another practice's copy.
    const other = copy(`${NAMES.practiceCopyBase} signup page`, join(SAMPLE, "../stuck-signup"));
    expect(pretendWrite(other)).toMatchObject({ ok: false });
    expect(existsSync(join(other, "pay.js"))).toBe(false);
    // A copy whose package needs packages is not a practice copy any more.
    const deps = copy();
    writeFileSync(join(deps, "package.json"), JSON.stringify({ name: "practice-key", dependencies: { stripe: "1.0.0" } }));
    expect(pretendWrite(deps)).toMatchObject({ ok: false });
    // A copy whose pay.js was changed some other way: nothing is guessed or overwritten.
    const changed = copy();
    writeFileSync(join(changed, "pay.js"), "// my own code\n");
    expect(pretendWrite(changed)).toMatchObject({ ok: false });
    expect(pay(changed)).toBe("// my own code\n");
  });
  test("never writes through a link: a pay.js that points elsewhere is refused and the file it points at is untouched", () => {
    const dir = copy(), outside = join(dir, "..", "elsewhere.js");
    writeFileSync(outside, readFileSync(join(SAMPLE, "pay.js")));
    rmSync(join(dir, "pay.js")); symlinkSync(outside, join(dir, "pay.js"));
    expect(pretendWrite(dir)).toMatchObject({ ok: false });
    expect(readFileSync(outside, "utf8")).toBe(readFileSync(join(SAMPLE, "pay.js"), "utf8"));
    expect(lstatSync(join(dir, "pay.js")).isSymbolicLink()).toBe(true);
  });
  test("the review's rules stop it: one Fix this first reason, a key written into pay.js at line 2", () => {
    const dir = copy(); pretendWrite(dir);
    const lines = pay(dir).split("\n").map((text, i) => ({ file: "pay.js", line: i + 1, text }));
    const r = rate({ changes: [{ file: "pay.js", kind: "modified" }], touches: ["payments"], secrets: secretsInCode(lines), stillUsed: [], secretFiles: [], checks: "not_run", count: 1, capped: false });
    expect(r.rating).toBe("stop");
    expect(r.reasons[0]).toMatchObject({ kind: "secret_in_code", file: "pay.js", line: 2 });
    // The words never show the key.
    expect(r.reasons[0].say).not.toContain(PRETEND_KEY);
  });
});

describe("the fixed fix, with no model", () => {
  test("moves the key to .env.local and puts the line that reads it back; the review's key rule then finds nothing", () => {
    const dir = copy(); pretendWrite(dir);
    const r = fixedFix(dir);
    expect(r).toEqual({ ok: true, changed: [{ file: ".env.local", kind: "added" }, { file: "pay.js", kind: "modified" }] });
    expect(pay(dir)).toBe(readFileSync(join(SAMPLE, "pay.js"), "utf8"));
    expect(readFileSync(join(dir, ".env.local"), "utf8")).toBe(`PAYMENTS_SECRET_KEY=${PRETEND_KEY}\n`);
    expect(keyInCode(dir)).toBe(false);
  });
  test("keeps what .env.local already has, and adds the key only once", () => {
    const dir = copy(); pretendWrite(dir);
    writeFileSync(join(dir, ".env.local"), "SHOP_NAME=Plants\n");
    expect(fixedFix(dir)).toEqual({ ok: true, changed: [{ file: ".env.local", kind: "modified" }, { file: "pay.js", kind: "modified" }] });
    expect(readFileSync(join(dir, ".env.local"), "utf8")).toBe(`SHOP_NAME=Plants\nPAYMENTS_SECRET_KEY=${PRETEND_KEY}\n`);
    pretendWrite(dir); fixedFix(dir);
    expect(readFileSync(join(dir, ".env.local"), "utf8").match(/PAYMENTS_SECRET_KEY=/g)).toHaveLength(1);
  });
  test("refused when there is no pretend key in the code, or outside a practice copy of this practice", () => {
    const clean = copy();
    expect(fixedFix(clean)).toMatchObject({ ok: false });
    expect(existsSync(join(clean, ".env.local"))).toBe(false);
    const mine = copy("my shop");
    writeFileSync(join(mine, "pay.js"), pay(mine).replace('const key = process.env.PAYMENTS_SECRET_KEY || "";', `const PAYMENTS_SECRET_KEY = "${PRETEND_KEY}";\nconst key = PAYMENTS_SECRET_KEY;`));
    expect(fixedFix(mine)).toMatchObject({ ok: false });
  });
  test("practicekey.ts never runs git, a model, a shell or the network", () => {
    const src = readFileSync(join(import.meta.dir, "../src/practicekey.ts"), "utf8");
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/**")).join("\n");
    for (const bad of ["child_process", "Bun.spawn", "spawn(", "exec(", "fetch(", "\"git", "lanes", "sdkEngine", "query("]) expect(code, bad).not.toContain(bad);
    expect(code).not.toMatch(/^import .*from "\.\/(agent|engines?|lanes|sdkEngine)\.ts"/m);
  });
});

describe("end to end in the review, with no model", () => {
  function setup(name?: string, fixes: unknown[] = []) {
    const project = copy(name), shadow = mkdtempSync(join(tmpdir(), "companion-test-practicekey-shadow-")); made.push(shadow);
    mkdirSync(shadow, { recursive: true });
    const store = new CheckpointStore(join(shadow, "p.git"), project);
    const events: Record<string, any>[] = [];
    let send: ((rel: string) => void) | null = null;
    const watch: WatchFn = (_d, on) => { send = on; return { close: () => { send = null; } }; };
    const asked: string[] = [];
    const lane: FastLike = { run: async () => { asked.push("model"); return { text: JSON.stringify({ summary: "x", notes: [], concern: false }), costUsd: 0.01 }; } };
    const booked: number[] = [];
    const svc = new ReviewService({
      emit: (e) => events.push(e), setting: (k) => ({ "review.mode": "ask", "flow.on": true } as Record<string, unknown>)[k], store: () => store,
      cheap: lane, strong: lane, spend: { room: () => 10, book: (_p, usd) => { booked.push(usd); } },
      rulesOnly: (p) => isKeyPractice(p), watch, graceMs: 20, quietMs: () => 30, fix: (start) => { fixes.push(start); },
    });
    services.push(svc);
    return { project, svc, events, asked, booked, fire: (rel: string) => send?.(rel) };
  }
  test("the pretend AI's change is reviewed at once: a stop on pay.js line 2, by the rules alone, costing nothing", async () => {
    const t = setup();
    t.svc.setProject(t.project); await t.svc.ready();
    pretendWrite(t.project); t.fire("pay.js");
    await t.svc.handle({ v: PROTOCOL_VERSION, id: "c1", type: "review.now", project: t.project });
    for (let i = 0; i < 200 && !t.events.some((e) => e.type === "review.result"); i++) await sleep(20);
    const r = t.events.find((e) => e.type === "review.result")!;
    expect(r).toMatchObject({ ok: true, rating: "stop", lane: "none", usdEstimate: 0 });
    expect(r.reasons[0]).toMatchObject({ kind: "secret_in_code", file: "pay.js", line: 2 });
    // No model was asked and nothing was booked; no note pretends that Claude is missing.
    expect(t.asked).toEqual([]);
    expect(t.booked).toEqual([]);
    expect(r.note).toBeUndefined();
    // The key never leaves in any event, and Send back is there for Copy for my AI.
    expect(JSON.stringify(t.events)).not.toContain(PRETEND_KEY);
    expect(typeof r.sendBack).toBe("string");
    for (const e of t.events) expect(parseEvent(JSON.stringify({ v: 1, id: "x", ts: "2026-11-05T00:00:00Z", ...e })).ok, e.type).toBe(true);
  });
  test("Fix it on the key practice's review never starts a model fix: refused before the plan gate, in plain words", async () => {
    const fixes: unknown[] = [];
    const t = setup(undefined, fixes);
    t.svc.setProject(t.project); await t.svc.ready();
    pretendWrite(t.project); t.fire("pay.js");
    await t.svc.handle({ v: PROTOCOL_VERSION, id: "c1", type: "review.now", project: t.project });
    for (let i = 0; i < 200 && !t.events.some((e) => e.type === "review.result"); i++) await sleep(20);
    const r = t.events.find((e) => e.type === "review.result")!;
    await t.svc.handle({ v: PROTOCOL_VERSION, id: "c2", type: "review.fix", project: t.project, batch: r.batch, agent: "builder-1", model: "m", budgetUsd: 1 } as never);
    expect(fixes).toEqual([]);
    expect(t.asked).toEqual([]);
    const no = t.events.filter((e) => e.type === "protocol.error" && e.failed === "review.fix");
    expect(no.map((e) => e.reason)).toEqual(["In this practice, Fix it is the practice's own move."]);
  });
  test("any other project is reviewed as before, with the model's words", async () => {
    const t = setup("my shop");
    t.svc.setProject(t.project); await t.svc.ready();
    writeFileSync(join(t.project, "pay.js"), pay(t.project).replace('const key = process.env.PAYMENTS_SECRET_KEY || "";', `const PAYMENTS_SECRET_KEY = "${PRETEND_KEY}";\nconst key = PAYMENTS_SECRET_KEY;`)); t.fire("pay.js");
    await t.svc.handle({ v: PROTOCOL_VERSION, id: "c1", type: "review.now", project: t.project });
    for (let i = 0; i < 200 && !t.events.some((e) => e.type === "review.result"); i++) await sleep(20);
    expect(t.events.find((e) => e.type === "review.result")).toMatchObject({ ok: true, rating: "stop", lane: "strong" });
    expect(t.asked).toEqual(["model"]);
  });
});

describe("one practice.key step, as main.ts runs it", () => {
  function deps(project: string, o: { cannot?: string | null; busy?: boolean } = {}) {
    const shadow = mkdtempSync(join(tmpdir(), "companion-test-practicekey-step-")); made.push(shadow);
    const store = new CheckpointStore(join(shadow, "p.git"), project);
    const said: Record<string, any>[] = [], log: string[] = [];
    const d: PracticeKeyDeps = {
      say: (e) => { said.push(e); log.push(`say:${e.step}`); }, cannotReview: () => o.cannot ?? null, ready: async () => { log.push("ready"); },
      review: async () => { log.push(`review:${keyInCode(project)}`); }, busy: () => o.busy === true,
      snapshot: async (_p, label) => { log.push("snapshot"); return store.snapshot(label); }, own: async (_p, work) => { log.push("own"); return work(); },
    };
    return { d, said, log, store };
  }
  test("write: waits for the review's starting point, writes, says so, then the review looks at once", async () => {
    const dir = copy(), t = deps(dir);
    await practiceKeyStep({ project: dir, step: "write" }, t.d);
    expect(t.log).toEqual(["ready", "say:wrote", "review:true"]);
    expect(t.said).toEqual([{ type: "practice.key", project: dir, step: "wrote", written: true }]);
    for (const e of t.said) expect(parseEvent(JSON.stringify({ v: 1, id: "x", ts: "2026-11-05T00:00:00Z", ...e })).ok).toBe(true);
  });
  test("write is refused, with nothing written, while reviews are off or Squibby is working here", async () => {
    for (const o of [{ cannot: "Reviews of changes are off. Turn them on in Settings." }, { busy: true }]) {
      const dir = copy(), t = deps(dir, o);
      await practiceKeyStep({ project: dir, step: "write" }, t.d);
      expect(t.said).toHaveLength(1);
      expect(t.said[0]).toMatchObject({ step: "refused" });
      expect(keyInCode(dir)).toBe(false);
      expect(t.log).not.toContain("review:true");
    }
  });
  test("fix: a safety copy first, as the engine's own work, then the fixed fix; Undo to that copy brings the key back", async () => {
    const dir = copy(), t = deps(dir);
    pretendWrite(dir);
    await practiceKeyStep({ project: dir, step: "fix" }, t.d);
    expect(t.log).toEqual(["own", "snapshot", "say:fixed"]);
    const ev = t.said[0];
    expect(ev).toMatchObject({ type: "practice.key", step: "fixed", clean: true, changed: [{ file: ".env.local", kind: "added" }, { file: "pay.js", kind: "modified" }] });
    expect(parseEvent(JSON.stringify({ v: 1, id: "x", ts: "2026-11-05T00:00:00Z", ...ev })).ok).toBe(true);
    expect(keyInCode(dir)).toBe(false);
    await t.store.restore(ev.checkpoint);
    expect(keyInCode(dir)).toBe(true);
    expect(JSON.stringify(t.said)).not.toContain(PRETEND_KEY);
  });
  test("fix is refused, with no safety copy made, when there is no key in the code or outside the practice's copy", async () => {
    const clean = copy(), t = deps(clean);
    await practiceKeyStep({ project: clean, step: "fix" }, t.d);
    expect(t.log).toEqual(["say:refused"]);
    const mine = copy("my shop"), u = deps(mine);
    await practiceKeyStep({ project: mine, step: "write" }, u.d);
    expect(u.log).toEqual(["say:refused"]);
  });
  test("main.ts runs it: the write is not the engine's own work (so it is reviewed), the fix is, and the review is rules only here", () => {
    const main = readFileSync(join(import.meta.dir, "../src/main.ts"), "utf8");
    expect(main).toContain("rulesOnly: (p) => isKeyPractice(p),");
    expect(main).toContain('own: (x, work) => ownWork(x, work, "practice.key")');
    expect(main).toContain('type: "review.now", project: x');
  });
});

// M102, every warning shows why. A model's worry may raise the rating only when it names a file and a line that code finds
// inside a changed place of this batch; otherwise it is an ordinary note. Every reason carries its proof (the rule and
// file:line, the failing check and its exit code, the OSV id, the house rule), and Fix it and Looks fine are counted per
// reason kind, on this Mac only. Stand in models and temporary fixture folders only: no model is ever called.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEvent, PROTOCOL_VERSION, REVIEW_REASONS, type Command, type ReviewReason } from "../../protocol/index.ts";
import { CheckpointStore } from "../src/checkpoints.ts";
import type { FastLike, FastReq } from "../src/lanes.ts";
import { Metrics, KIND_NOTES, NOTES } from "../src/metrics.ts";
import { concernPlace, rate, withProofs, type RateInput } from "../src/review/rate.ts";
import { ReviewService, type ReviewDeps } from "../src/review/service.ts";
import { parseWords, wordsRequest } from "../src/review/words.ts";
import { packageReason } from "../src/review/osv.ts";
import { houseRuleReasons } from "../src/review/look.ts";
import { diffForExplain, type Hunk } from "../src/teach.ts";
import type { WatchFn } from "../src/review/batcher.ts";

const made: string[] = [];
const services: ReviewService[] = [];
afterEach(() => { while (services.length) services.pop()!.stop(); while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tmp = (label: string) => { const d = mkdtempSync(join(tmpdir(), `companion-test-m102-${label}-`)); made.push(d); return d; };
const write = (dir: string, files: Record<string, string>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(join(dir, p, ".."), { recursive: true }); writeFileSync(join(dir, p), c); } };

const base = (o: Partial<RateInput> = {}): RateInput => ({ changes: [{ file: "src/a.ts", kind: "modified" }], touches: [], secrets: [], stillUsed: [], secretFiles: [], checks: "not_run", count: 1, capped: false, ...o });
const hunk = (file: string, afterAt: number, after: string[], before: string[] = []): Hunk => ({ file, beforeAt: afterAt, before, afterAt, after, context: [] });

describe("a model's worry needs a place that code checks", () => {
  // The place at 40 only took a line away; the line now standing there is "save()" (teach.ts gives it as next).
  const hunks = [hunk("src/list.ts", 10, ["a", "b", "c"]), { ...hunk("src/list.ts", 40, [], ["gone"]), next: "save()" }, hunk("src/other.ts", 3, ["x"])];
  test("a concern with no file and line cannot raise the rating", () => {
    expect(concernPlace({}, hunks)).toBeNull();
    expect(concernPlace({ file: "src/list.ts" }, hunks)).toBeNull();
    expect(concernPlace({ line: 11 }, hunks)).toBeNull();
    const r = rate(base({ concern: true, concernSay: "The list may load twice." }));
    expect(r.rating).toBe("safe");
    expect(r.reasons).toEqual([]);
  });
  test("a file and line outside the changed places cannot raise it", () => {
    expect(concernPlace({ file: "src/list.ts", line: 9 }, hunks)).toBeNull();
    expect(concernPlace({ file: "src/list.ts", line: 13 }, hunks)).toBeNull();
    expect(concernPlace({ file: "src/list.ts", line: 41 }, hunks)).toBeNull();
    expect(concernPlace({ file: "src/nothere.ts", line: 3 }, hunks)).toBeNull();
    expect(concernPlace({ file: "src/list.ts", line: 0 }, hunks)).toBeNull();
    expect(concernPlace({ file: "src/list.ts", line: 10.5 }, hunks)).toBeNull();
  });
  test("a place inside a changed place passes: its first and last added line, and where lines were only taken away", () => {
    expect(concernPlace({ file: "src/list.ts", line: 10 }, hunks)).toEqual({ file: "src/list.ts", line: 10 });
    expect(concernPlace({ file: "src/list.ts", line: 12 }, hunks)).toEqual({ file: "src/list.ts", line: 12 });
    expect(concernPlace({ file: "src/list.ts", line: 40 }, hunks)).toEqual({ file: "src/list.ts", line: 40 });
    // The model may write the file with a leading ./ ; it is the same file.
    expect(concernPlace({ file: "./src/other.ts", line: 3 }, hunks)).toEqual({ file: "src/other.ts", line: 3 });
  });
  test("an inside concern is a reason with its proof line, and never lowers a rating", () => {
    const r = rate(base({ concern: true, concernSay: "The list may load twice.", concernAt: { file: "src/list.ts", line: 11 } }));
    expect(r.rating).toBe("worth_a_look");
    expect(r.reasons).toEqual([{ kind: "model_concern", file: "src/list.ts", line: 11, say: "The list may load twice.", proof: { by: "line", file: "src/list.ts", line: 11 } }]);
    expect(rate(base({ concern: true, concernAt: { file: "src/list.ts", line: 11 }, checks: "failed" })).rating).toBe("stop");
  });
});

describe("a worry about code that was taken away can raise the rating too (M102 review)", () => {
  test("only where the line really stands: the line after them, or the last line when they ended the file", () => {
    const mid = { ...hunk("src/cart.ts", 5, [], ["  if (!items.length) return;"]), next: "  save(items);" };
    expect(concernPlace({ file: "src/cart.ts", line: 5 }, [mid])).toEqual({ file: "src/cart.ts", line: 5 });
    expect(concernPlace({ file: "src/cart.ts", line: 4 }, [mid])).toBeNull();
    // Taken away at the end of the file: line 9 is one past the last line, so it is not a place; line 8, the last, is.
    const end = hunk("src/cart.ts", 9, [], ["  return total;"]);
    expect(concernPlace({ file: "src/cart.ts", line: 9 }, [end])).toBeNull();
    expect(concernPlace({ file: "src/cart.ts", line: 8 }, [end])).toEqual({ file: "src/cart.ts", line: 8 });
    // A file whose every line was taken away has no line to point at.
    expect(concernPlace({ file: "src/cart.ts", line: 0 }, [hunk("src/cart.ts", 1, [], ["x"])])).toBeNull();
    expect(concernPlace({ file: "src/cart.ts", line: 1 }, [hunk("src/cart.ts", 1, [], ["x"])])).toBeNull();
  });
  test("the numbered change shows the line standing after lines only taken away, with its number, keys hidden", () => {
    const d = diffForExplain([{ file: "src/cart.ts", beforeAt: 5, before: ["  if (!items.length) return;"], afterAt: 5, after: [], context: ["a", "b"], next: "  save(items);" }], 6000, true);
    expect(d).toBe(["--- src/cart.ts", "@@ line 5", "   3  a", "   4  b", "-       if (!items.length) return;", "   5    save(items);"].join("\n"));
    const key = diffForExplain([{ file: "src/k.ts", beforeAt: 2, before: ["x"], afterAt: 2, after: [], context: [], next: 'const k = "sk_live_' + "a".repeat(24) + '";' }], 6000, true);
    expect(key).not.toContain("sk_live_" + "a".repeat(24));
    // Unnumbered (Explain) is as before: no extra line.
    expect(diffForExplain([{ file: "src/cart.ts", beforeAt: 5, before: ["old"], afterAt: 5, after: [], context: [], next: "  save(items);" }])).toBe(["--- src/cart.ts", "@@ line 5", "- old"].join("\n"));
  });
  test("the request tells the model how to point at lines only taken away", () => {
    const req = wordsRequest({ files: [{ file: "src/a.ts", kind: "modified" }], count: 1, touches: [], reasons: [], diff: "-  x", checks: "not run" });
    expect(req.text).toMatch(/only taken away, the line number shown right after them/);
  });
});

describe("the model is asked for the place, and its answer is read", () => {
  test("the request asks for concernFile and concernLine, and says a worry without them is only a note", () => {
    const req = wordsRequest({ files: [{ file: "src/a.ts", kind: "modified" }], count: 1, touches: [], reasons: [], diff: "+ 3  x", checks: "not run" });
    expect(req.text).toContain('"concernFile"');
    expect(req.text).toContain('"concernLine"');
    expect(req.text).toMatch(/only as a note/);
  });
  test("parseWords keeps the file and a whole line number, and nothing else", () => {
    expect(parseWords(JSON.stringify({ summary: "S.", notes: [], concern: true, concernSay: "It breaks.", concernFile: "src/a.ts", concernLine: 14 }))).toMatchObject({ concern: true, concernFile: "src/a.ts", concernLine: 14 });
    // "file:line" in one field is read as both.
    expect(parseWords(JSON.stringify({ summary: "S.", notes: [], concern: true, concernSay: "It breaks.", concernFile: "src/a.ts:14" }))).toMatchObject({ concernFile: "src/a.ts", concernLine: 14 });
    const bad = parseWords(JSON.stringify({ summary: "S.", notes: [], concern: true, concernSay: "It breaks.", concernFile: "src/a.ts", concernLine: "fourteen" }))!;
    expect(bad.concernLine).toBeUndefined();
    const none = parseWords(JSON.stringify({ summary: "S.", notes: [], concern: false, concernFile: "src/a.ts", concernLine: 2 }))!;
    expect(none.concernFile).toBeUndefined();
    expect(none.concernLine).toBeUndefined();
  });
  test("the change sent for the words numbers the lines as they are now, so the model can name one", () => {
    const d = diffForExplain([{ file: "src/a.ts", beforeAt: 3, before: ["old"], afterAt: 3, after: ["new", "more"], context: ["one", "two"] }], 6000, true);
    expect(d).toBe(["--- src/a.ts", "@@ line 3", "   1  one", "   2  two", "-     old", "+  3  new", "+  4  more"].join("\n"));
    // Without numbering it is as before (Explain and the other callers).
    expect(diffForExplain([{ file: "src/a.ts", beforeAt: 3, before: ["old"], afterAt: 3, after: ["new"], context: [] }])).toBe(["--- src/a.ts", "@@ line 3", "- old", "+ new"].join("\n"));
  });
});

describe("every reason carries its proof", () => {
  const all = (): ReviewReason[] => REVIEW_REASONS.map((kind) => ({ kind, say: `${kind} said.` }));
  test("each kind gets a proof of the right sort, and one already given is kept", () => {
    const got = withProofs<ReviewReason>([
      { kind: "secret_in_code", file: "src/pay.ts", line: 2, say: "k" },
      { kind: "checks_failed", say: "c" },
      { kind: "risky_with_failing_checks", say: "r" },
      { kind: "claimed_passed", say: "w" },
      { kind: "touches_risky", say: "t" },
      { kind: "files_removed", say: "f" },
      { kind: "secret_file_changed", say: "s" },
      { kind: "too_many", say: "m" },
      { kind: "chosen_stop", say: "cs" },
      { kind: "open_private_page", say: "o" },
      { kind: "package_critical", file: "package.json", line: 5, say: "p", proof: { by: "osv", id: "GHSA-aaaa-bbbb-cccc", file: "package.json", line: 5 } },
    ], { checks: "failed", runs: [{ label: "Tests", rung: "test", status: "passed", exit: 0 }, { label: "Build", rung: "build", status: "failed", exit: 2 }], touchAt: { sign_in: "src/auth/login.ts" }, touches: ["sign_in"], removed: ["src/old.ts"], secretFiles: [".env"], count: 300, max: 200 });
    expect(got.map((r) => r.proof) as unknown[]).toEqual([
      { by: "rule", file: "src/pay.ts", line: 2 },
      { by: "check", check: "Build", exit: 2 },
      { by: "check", check: "Build", exit: 2 },
      { by: "check", outcome: "failed" },
      { by: "rule", file: "src/auth/login.ts" },
      { by: "rule", file: "src/old.ts" },
      { by: "rule", file: ".env" },
      { by: "setting", count: 300, max: 200 },
      { by: "setting" },
      { by: "run" },
      { by: "osv", id: "GHSA-aaaa-bbbb-cccc", file: "package.json", line: 5 },
    ]);
  });
  test("every reason kind the engine knows ends with a proof, and every one passes the protocol", () => {
    const got = withProofs(all(), { checks: "not_run", count: 1, max: 200 });
    for (const r of got) {
      if (r.kind === "model_concern") { expect(r.proof, r.kind).toBeUndefined(); continue; }   // never sent without its place
      expect(r.proof, r.kind).toBeDefined();
    }
    const e = { v: 1, id: "x", type: "review.result", project: "/p", batch: "rv_0123456789", ok: true, rating: "stop", touches: [], summary: "S.", notes: [], reasons: got.filter((r) => r.proof), files: [], count: 1, capped: false, secretFiles: [], checks: "not_run", sendBack: "x", lane: "none", usdEstimate: 0 };
    const p = parseEvent(JSON.stringify(e));
    expect(p.ok, p.ok ? "" : p.error).toBe(true);
  });
  test("a claimed pass with checks that did not run says so", () => {
    expect(withProofs<ReviewReason>([{ kind: "claimed_passed", say: "w" }], { checks: "not_run", count: 1, max: 200 })[0].proof).toEqual({ by: "check", outcome: "not_run" });
  });
  test("an OSV finding names its id, and a house rule quotes the rule (secrets hidden)", () => {
    const p = packageReason({ pkg: { name: "lodash", version: "4.17.20", ecosystem: "npm", file: "package.json", line: 7 } as never, id: "GHSA-aaaa-bbbb-cccc", severity: "critical", fixed: "4.17.21" });
    expect(p.proof).toEqual({ by: "osv", id: "GHSA-aaaa-bbbb-cccc", file: "package.json", line: 7 });
    const h = houseRuleReasons([{ kind: "never_edit", pattern: "src/pay/**", text: "Never edit src/pay/**" } as never], [{ file: "src/pay/a.ts", kind: "modified" }]);
    expect(h[0].proof).toEqual({ by: "house_rule", rule: "Never edit src/pay/**", file: "src/pay/a.ts" });
  });
  test("the protocol refuses a proof of an unknown sort, a stray field, or text where a number belongs", () => {
    const ev = (proof: unknown) => parseEvent(JSON.stringify({ v: 1, id: "x", type: "review.result", project: "/p", batch: "rv_0123456789", ok: true, rating: "stop", touches: [], summary: "S.", notes: [], reasons: [{ kind: "checks_failed", say: "c", proof }], files: [], count: 1, capped: false, secretFiles: [], checks: "failed", sendBack: "x", lane: "none", usdEstimate: 0 })).ok;
    expect(ev({ by: "check", check: "Tests", exit: 1 })).toBe(true);
    expect(ev({ by: "guess" })).toBe(false);
    expect(ev({ by: "check", exit: "one" })).toBe(false);
    expect(ev({ by: "check", text: "const key = 1" })).toBe(false);
    expect(ev({ by: "osv", id: "has spaces in it" })).toBe(false);
    expect(ev({ by: "rule", line: 0 })).toBe(false);
  });
});

type Ev = Record<string, any>;
function rig(words: string, files: Record<string, string>, check?: ReviewDeps["check"]) {
  const project = tmp("proj"), shadow = tmp("shadow");
  write(project, files);
  const store = new CheckpointStore(join(shadow, "p.git"), project);
  const events: Ev[] = [];
  let send: ((rel: string) => void) | null = null;
  const watch: WatchFn = (_d, on) => { send = on; return { close: () => { send = null; } }; };
  const asked: FastReq[] = [];
  const lane: FastLike = { run: async (req) => { asked.push(req); return { text: words, costUsd: 0.001 }; } };
  const values: Record<string, unknown> = { "review.mode": "ask", "flow.on": true, "replay.model": false };
  const svc = new ReviewService({ emit: (e) => events.push(e), setting: (k) => values[k], store: () => store, cheap: lane, strong: lane, spend: { room: () => 10, book: () => {} }, check, fix: () => {}, watch, graceMs: 20, quietMs: () => 30 });
  services.push(svc);
  const change = (f: Record<string, string>) => { write(project, f); for (const r of Object.keys(f)) send?.(r); };
  const until = async (pred: () => boolean, ms = 8000) => { for (let i = 0; i < ms / 20 && !pred(); i++) await sleep(20); expect(pred()).toBe(true); };
  const of = (t: string) => events.filter((e) => e.type === t);
  const cmd = (type: string, extra: Record<string, unknown> = {}) => ({ v: PROTOCOL_VERSION, id: `c_${type}`, type, project, ...extra }) as Command;
  return { project, svc, change, until, of, cmd, asked };
}
const LIST = "export function load() {\n  return fetch('/api');\n}\n";
async function reviewed(words: Record<string, unknown>, check?: ReviewDeps["check"]) {
  const t = rig(JSON.stringify(words), { "src/list.ts": LIST, "src/App.tsx": "export const title = 'Hello';\n" }, check);
  t.svc.setProject(t.project); await t.svc.ready();
  t.change({ "src/list.ts": "export function load() {\n  fetch('/api');\n  return fetch('/api');\n}\n" });
  await t.until(() => t.of("review.batch").length === 1);
  await t.svc.handle(t.cmd("review.now", { batch: t.of("review.batch")[0].batch, proof: !!check }) as never);
  await t.until(() => t.of("review.result").length === 1);
  const r = t.of("review.result")[0];
  const p = parseEvent(JSON.stringify({ v: 1, id: "x", ...r }));
  expect(p.ok, p.ok ? "" : p.error).toBe(true);
  return { r, t };
}
const say = { summary: "The list now loads twice.", notes: ["Open the list page once."], concern: true, concernSay: "The list may load twice." };

describe("end to end with a stand in model", () => {
  test("a worry with no place leaves the rating alone and is kept as a note", async () => {
    const { r, t } = await reviewed(say);
    expect(r.rating).toBe("safe");
    expect(r.reasons).toEqual([]);
    expect(r.notes[0]).toBe("The list may load twice.");
    expect(r.notes).toContain("Open the list page once.");
    expect(r.summary).toBe("The list now loads twice.");
    // The change was sent with its lines numbered as they are now.
    expect(t.asked[0].text).toContain("+  2    fetch('/api');");
  });
  test("a worry about a line the change did not touch leaves the rating alone", async () => {
    const { r } = await reviewed({ ...say, concernFile: "src/list.ts", concernLine: 4 });
    expect(r.rating).toBe("safe");
    expect(r.notes[0]).toBe("The list may load twice.");
    const other = await reviewed({ ...say, concernFile: "src/App.tsx", concernLine: 1 });
    expect(other.r.rating).toBe("safe");
  });
  test("a worry about a changed line raises it to worth a look, with why I'm sure", async () => {
    const { r } = await reviewed({ ...say, concernFile: "src/list.ts", concernLine: 2 });
    expect(r.rating).toBe("worth_a_look");
    const c = r.reasons.find((x: Ev) => x.kind === "model_concern");
    expect(c).toMatchObject({ kind: "model_concern", file: "src/list.ts", line: 2, say: "The list may load twice.", proof: { by: "line", file: "src/list.ts", line: 2 } });
    // Shown once: not again as a note.
    expect(r.notes).not.toContain("The list may load twice.");
  });
  test("a worry about a removed guard points at the line now standing there and raises it", async () => {
    const t = rig(JSON.stringify({ summary: "Empty orders can now be saved.", notes: [], concern: true, concernSay: "The check that stopped empty orders was removed.", concernFile: "src/cart.ts", concernLine: 3 }),
      { "src/cart.ts": "export function order(items: string[]) {\n  if (!items.length) return;\n  save(items);\n}\n" });
    t.svc.setProject(t.project); await t.svc.ready();
    t.change({ "src/cart.ts": "export function order(items: string[]) {\n  save(items);\n}\n" });
    await t.until(() => t.of("review.batch").length === 1);
    await t.svc.handle(t.cmd("review.now", { batch: t.of("review.batch")[0].batch, proof: false }) as never);
    await t.until(() => t.of("review.result").length === 1);
    const r = t.of("review.result")[0];
    // The model was shown the line standing where the guard was, with its number.
    expect(t.asked[0].text).toContain("-       if (!items.length) return;\n   2    save(items);");
    // Line 3 is not where the guard was taken away, so naming it raises nothing; line 2, the line shown, does.
    expect(r.rating).toBe("safe");
    const t2 = rig(JSON.stringify({ summary: "Empty orders can now be saved.", notes: [], concern: true, concernSay: "The check that stopped empty orders was removed.", concernFile: "src/cart.ts", concernLine: 2 }),
      { "src/cart.ts": "export function order(items: string[]) {\n  if (!items.length) return;\n  save(items);\n}\n" });
    t2.svc.setProject(t2.project); await t2.svc.ready();
    t2.change({ "src/cart.ts": "export function order(items: string[]) {\n  save(items);\n}\n" });
    await t2.until(() => t2.of("review.batch").length === 1);
    await t2.svc.handle(t2.cmd("review.now", { batch: t2.of("review.batch")[0].batch, proof: false }) as never);
    await t2.until(() => t2.of("review.result").length === 1);
    const r2 = t2.of("review.result")[0];
    expect(r2.rating).toBe("worth_a_look");
    expect(r2.reasons.find((x: Ev) => x.kind === "model_concern")).toMatchObject({ file: "src/cart.ts", line: 2, proof: { by: "line", file: "src/cart.ts", line: 2 } });
  });
  test("failed checks carry the failing check and its exit code", async () => {
    const { r } = await reviewed({ summary: "S.", notes: [], concern: false }, async () => ({ outcome: "failing", reason: "The build did not pass.", runs: [{ label: "Build", rung: "build", status: "failed", exit: 1 }] }));
    expect(r.rating).toBe("stop");
    expect(r.reasons.find((x: Ev) => x.kind === "checks_failed").proof).toEqual({ by: "check", check: "Build", exit: 1 });
    for (const x of r.reasons) expect(x.proof, x.kind).toBeDefined();
  });
});

describe("Fix it and Looks fine are counted per reason kind, on this Mac only", () => {
  const now = () => new Date(2026, 10, 17, 12);
  const result = (batch: string, kinds: string[]) => ({ v: 1, id: "e", type: "review.result", project: "/p", batch, ok: true, rating: "stop", reasons: kinds.map((kind) => ({ kind, say: "x" })) }) as never;
  const c = (o: Record<string, unknown>) => ({ v: 1, id: "c", project: "/p", ...o }) as never;
  test("the counts are stored per kind, once per kind per card, and only with counting on", () => {
    const f = join(tmp("m"), "metrics.json");
    const m = new Metrics(f, now);
    m.observe(result("rv_000000000a", ["secret_in_code"]));
    m.observeCommand(c({ type: "review.fix", batch: "rv_000000000a", agent: "a", model: "m", budgetUsd: 1 }));
    expect(m.summary().totals).toEqual({});   // off: nothing counted
    m.setEnabled(true);
    m.observe(result("rv_000000000b", ["secret_in_code", "touches_risky", "secret_in_code"]));
    m.observe(result("rv_000000000c", ["model_concern"]));
    m.observeCommand(c({ type: "review.fix", batch: "rv_000000000b", agent: "a", model: "m", budgetUsd: 1 }));
    m.observeCommand(c({ type: "review.dismiss", batch: "rv_000000000c", how: "looksFine" }));
    m.observeCommand(c({ type: "review.dismiss", batch: "rv_00000000ff", how: "looksFine" }));   // a card not seen: no kind
    const t = m.summary().totals as Record<string, number>;
    expect(t.review_fix).toBe(1);
    expect(t.review_looks_fine).toBe(2);
    expect(t["review_fix_kind:secret_in_code"]).toBe(1);
    expect(t["review_fix_kind:touches_risky"]).toBe(1);
    expect(t["review_looks_fine_kind:model_concern"]).toBe(1);
    expect(Object.keys(t).filter((k) => k.includes("_kind:")).sort()).toEqual(["review_fix_kind:secret_in_code", "review_fix_kind:touches_risky", "review_looks_fine_kind:model_concern"]);
    // Kept on disk with the rest, read back after a restart, and only names from the fixed list.
    const again = new Metrics(f, now).summary().totals as Record<string, number>;
    expect(again["review_fix_kind:secret_in_code"]).toBe(1);
    const disk = readFileSync(f, "utf8");
    expect(disk).not.toContain("rv_000000000b");
    for (const k of Object.keys(again)) expect([...KIND_NOTES, ...NOTES] as string[]).toContain(k);
  });
  test("a page cannot add a kind count by name, and a damaged file cannot plant one", () => {
    const f = join(tmp("m2"), "metrics.json");
    const m = new Metrics(f, now);
    m.setEnabled(true);
    expect(m.note("review_fix_kind:secret_in_code")).toBe(false);
    writeFileSync(f, JSON.stringify({ enabled: true, days: { "2026-11-17": { "review_fix_kind:secret_in_code": 3, "review_fix_kind:not_a_kind": 9 } } }));
    const t = new Metrics(f, now).summary().totals as Record<string, number>;
    expect(t["review_fix_kind:secret_in_code"]).toBe(3);
    expect(t["review_fix_kind:not_a_kind"]).toBeUndefined();
  });
});

describe("the shared fixture (read by the Rust shell's suite and the pages too)", () => {
  test("m102e1 parses, and every reason carries its proof", () => {
    const line = readFileSync(join(import.meta.dir, "../../protocol/fixtures/events.jsonl"), "utf8").split("\n").find((l) => l.includes('"id":"m102e1"'))!;
    const p = parseEvent(line);
    expect(p.ok, p.ok ? "" : p.error).toBe(true);
    const e = JSON.parse(line);
    expect(e.reasons.map((r: ReviewReason) => r.proof?.by)).toEqual(["check", "rule", "house_rule", "osv", "rule", "line", "setting"]);
  });
});

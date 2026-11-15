// M95, a light tutor: what the person has learned, from explicit signals inside Squibby only (rule 15), kept in the memory
// module's own folder (the profile's, never the project's) as kinds, sources and days, never words or files (rule 16).
// Every project here is a temporary fixture folder; the engine, the fast lane and the checks are stand ins.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { AgentRunner, type ProofContext } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { RunnerSettings } from "../src/settings.ts";
import { MemoryStore } from "../src/memory/store.ts";
import { LEARNED_FILE, LearnedStore, kindFromText, kindOfPractice, kindOfReason, kindOfTask } from "../src/memory/learned.ts";
import { fixFoundPrompt } from "../src/fixfound.ts";
import { fixPrompt } from "../src/review/sendback.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import { LEARNED_KINDS, MAX_LEARNED, PRACTICE_LEARNED, PROTOCOL_VERSION, REVIEW_REASONS, parseCommand, parseEvent, serialize, type Command, type Event } from "../../protocol/index.ts";
import catalog from "../../app/sample/practices.json";
import { CheckpointStore } from "../src/checkpoints.ts";
import { ReviewService } from "../src/review/service.ts";
import type { WatchFn } from "../src/review/batcher.ts";

const made: string[] = [];
const services: ReviewService[] = [];
afterEach(() => { while (services.length) services.pop()!.stop(); while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-m95-${l}-`))); made.push(d); return d; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DAY = new Date(2026, 10, 14, 20, 30);

describe("the store: kinds, sources and days, in the profile's own folder", () => {
  test("a signal is kept once, with its local day, in a private file in the memory folder and nowhere else", () => {
    const dir = tmp("d"), project = tmp("p");
    const s = new LearnedStore({ dir });
    expect(s.note({ key: "practice:key", kind: "key_in_code", source: "practice" }, DAY)).toEqual({ ok: true, added: true });
    expect(s.note({ key: "practice:key", kind: "key_in_code", source: "practice" }, DAY)).toEqual({ ok: true, added: false });
    expect(s.list()).toEqual([{ kind: "key_in_code", source: "practice", date: "2026-11-14" }]);
    const f = join(dir, LEARNED_FILE);
    expect(statSync(f).mode & 0o777).toBe(0o600);
    expect(readdirSync(project)).toEqual([]);
    // Only kinds, sources, days and hashed keys: the key given is never written as it is.
    const text = readFileSync(f, "utf8");
    expect(text).not.toContain("practice:key");
    const j = JSON.parse(text);
    expect(Object.keys(j).sort()).toEqual(["forgotten", "signals", "version"]);
    for (const x of j.signals) expect(Object.keys(x).every((k) => ["id", "kind", "source", "date", "missed"].includes(k))).toBe(true);
  });
  test("a wrong check answer is kept as missed, apart from what was learned", () => {
    const s = new LearnedStore({ dir: tmp("d") });
    s.note({ key: "a", kind: "renamed_file", source: "check", missed: true }, DAY);
    s.note({ key: "b", kind: "renamed_file", source: "yourTurn" }, DAY);
    expect(s.list()).toEqual([{ kind: "renamed_file", source: "check", date: "2026-11-14", missed: true }, { kind: "renamed_file", source: "yourTurn", date: "2026-11-14" }]);
  });
  test("forget takes away exactly one line (or what a suggestion was made from), and a forgotten signal never comes back", () => {
    const s = new LearnedStore({ dir: tmp("d") });
    s.note({ key: "a", kind: "key_in_code", source: "practice" }, DAY);
    s.note({ key: "b", kind: "key_in_code", source: "check", missed: true }, DAY);
    s.note({ key: "c", kind: "open_table", source: "review" }, DAY);
    s.forget("key_in_code", "learned");
    expect(s.list().map((x) => [x.kind, !!x.missed])).toEqual([["key_in_code", true], ["open_table", false]]);
    expect(s.note({ key: "a", kind: "key_in_code", source: "practice" }, DAY)).toEqual({ ok: false, reason: "You asked me to forget that." });
    s.forget("key_in_code", "missed");
    expect(s.list().map((x) => x.kind)).toEqual(["open_table"]);
    // A new event of the same kind is new, so it counts.
    expect(s.note({ key: "d", kind: "key_in_code", source: "yourTurn" }, DAY).ok).toBe(true);
  });
  test("Pause memory stops new signals too, and what is there stays", () => {
    let paused = false;
    const s = new LearnedStore({ dir: tmp("d"), paused: () => paused });
    s.note({ key: "a", kind: "key_in_code", source: "practice" }, DAY);
    paused = true;
    expect(s.note({ key: "b", kind: "open_table", source: "practice" }, DAY)).toEqual({ ok: false, reason: "Learning is paused." });
    expect(s.list().length).toBe(1);
  });
  test("a damaged file is kept aside, never written over, and learning starts again empty", () => {
    const dir = tmp("d");
    writeFileSync(join(dir, LEARNED_FILE), "{ not json");
    const s = new LearnedStore({ dir });
    expect(s.list()).toEqual([]);
    expect(readFileSync(join(dir, "learned.damaged.json"), "utf8")).toBe("{ not json");
    expect(s.note({ key: "a", kind: "key_in_code", source: "practice" }, DAY).ok).toBe(true);
    expect(s.list().length).toBe(1);
  });
  test("a hand edited file keeps only what it knows: unknown kinds, sources and fields are dropped", () => {
    const dir = tmp("d");
    writeFileSync(join(dir, LEARNED_FILE), JSON.stringify({ version: 1, signals: [{ id: "t_" + "1".repeat(20), kind: "mood", source: "practice", date: "2026-11-01" }, { id: "t_" + "2".repeat(20), kind: "open_table", source: "chat", date: "2026-11-01" }, { id: "t_" + "3".repeat(20), kind: "open_table", source: "review", date: "2026-11-01", note: "hello" }, { id: "../x", kind: "open_table", source: "review", date: "2026-11-01" }], forgotten: [] }));
    expect(new LearnedStore({ dir }).list()).toEqual([{ kind: "open_table", source: "review", date: "2026-11-01" }]);
  });
  test(`at most ${MAX_LEARNED} signals are kept, the oldest going first`, () => {
    const s = new LearnedStore({ dir: tmp("d") });
    for (let i = 0; i < MAX_LEARNED + 5; i++) s.note({ key: `k${i}`, kind: i < 5 ? "open_table" : "other", source: "review" }, DAY);
    const l = s.list();
    expect(l.length).toBe(MAX_LEARNED);
    expect(l.some((x) => x.kind === "open_table")).toBe(false);
  });
});

describe("the kind of problem, decided by fixed rules with no model", () => {
  test("every practice in the catalog has its kind, and only those", () => {
    const ids = (catalog as { practices: { id: string }[] }).practices.map((p) => p.id).sort();
    expect(Object.keys(PRACTICE_LEARNED).sort()).toEqual(ids);
    for (const id of ids) expect(LEARNED_KINDS).toContain(kindOfPractice(id)!);
    expect(kindOfPractice("nope")).toBeNull();
  });
  test("review reasons map to a kind only where the problem is clear", () => {
    expect(kindOfReason("secret_in_code")).toBe("key_in_code");
    expect(kindOfReason("key_in_page")).toBe("key_in_code");
    expect(kindOfReason("open_table")).toBe("open_table");
    expect(kindOfReason("signed_in_open")).toBe("open_table");
    expect(kindOfReason("weakened_check")).toBe("weakened_check");
    expect(kindOfReason("claimed_passed")).toBe("done_not_done");
    expect(kindOfReason("removed_still_used")).toBe("renamed_file");
    for (const k of ["too_many", "touches_risky", "model_concern", "house_rule", "files_removed", "chosen_stop"]) expect(kindOfReason(k)).toBeNull();
    for (const k of REVIEW_REASONS) { const v = kindOfReason(k); if (v) expect(LEARNED_KINDS).toContain(v); }
  });
  test("words from a task or a failing check name a kind, or other", () => {
    expect(kindFromText("Error: Cannot find module './prices-list'")).toBe("renamed_file");
    expect(kindFromText("SHOP_NAME is not set")).toBe("missing_setting");
    expect(kindFromText("The Stripe API key is hard coded in pay.js")).toBe("key_in_code");
    expect(kindFromText("the notes table has no row level security")).toBe("open_table");
    expect(kindFromText("The link goes to /prices but the page is a 404")).toBe("broken_link");
    expect(kindFromText("POST /api/signup answered 500")).toBe("failing_request");
    expect(kindFromText("make the header blue")).toBe("other");
    expect(kindFromText()).toBe("other");
  });
  test("an ordinary feature request is not a problem: a mention is not enough, the rules need fix words or an error", () => {
    for (const t of ["Add a password reset page to the code", "Add a /api/contact route for the form", "Make the logo link goes to / home",
      "Show a message when the user name is not set", "Add a dark mode toggle", "Add a 404 page design", "Let people reset their password from the settings page"]) expect(kindFromText(t), t).toBe("other");
  });
  test("a task gives a kind only when it really was a fix; every other task gives nothing to note", () => {
    const feature = { mode: "drive", prompt: "Add a password reset page to the code", label: "Add a password reset page" };
    expect(kindOfTask(feature)).toBeNull();
    expect(kindOfTask({ ...feature, prompt: "Fix Cannot find module './prices'" })).toBeNull();   // the person's own words are not proof of a fix
    expect(kindOfTask({ ...feature, practice: "route" })).toBe("broken_link");
    expect(kindOfTask({ ...feature, mode: "rescue", prompt: "Error: Cannot find module './prices'" })).toBe("renamed_file");
    expect(kindOfTask({ ...feature, prompt: fixFoundPrompt({ label: "Starting the app", detail: "SHOP_NAME is not set" }) })).toBe("missing_setting");
    expect(kindOfTask({ ...feature, prompt: fixFoundPrompt({ label: "Tests", detail: "expected 2, got 3" }) })).toBe("other");
    const review = fixPrompt({ rating: "stop", summary: "", reasons: [{ kind: "secret_in_code", say: "A live Stripe key is written into the code in src/pay.ts." }], touches: [], notes: [], files: [{ file: "src/pay.ts", kind: "modified" }], count: 1 } as never);
    expect(kindOfTask({ ...feature, prompt: review })).toBe("key_in_code");
    // The review's own words for each clear kind, and never the request's fixed words (which mention keys every time).
    const fixOf = (kind: string, say: string) => kindOfTask({ ...feature, prompt: fixPrompt({ rating: "stop", summary: "", reasons: [{ kind, say }], touches: [], notes: [], files: [{ file: "src/a.ts", kind: "modified" }], count: 1 } as never) });
    expect(fixOf("secret_in_code", "A key or password is written into src/pay.ts at line 3. It belongs in a settings file such as .env, not in the code.")).toBe("key_in_code");
    expect(fixOf("removed_still_used", "src/utils/date.ts was removed, but src/App.tsx still uses it at line 1, so the project may not start.")).toBe("renamed_file");
    expect(fixOf("weakened_check", "A test was skipped in a.test.ts at line 4. A check that is skipped cannot fail, so it proves nothing.")).toBe("weakened_check");
    expect(fixOf("claimed_passed", "The words say the checks pass, but the checks failed here.")).toBe("done_not_done");
    expect(fixOf("too_many", "This change touches 40 files.")).toBe("other");
    // Proof that first failed and then passed: the kind comes from the failing check, and a plain failure names nothing.
    expect(kindOfTask({ ...feature, failed: { label: "Build", detail: "Error: Cannot find module './logo'" } })).toBe("renamed_file");
    expect(kindOfTask({ ...feature, failed: { label: "Tests", detail: "expected 2, got 3" } })).toBeNull();
  });
});

describe("the protocol: notes name only a practice or a checkpoint, the event only kinds, sources and days", () => {
  const c = (x: Record<string, unknown>) => parseCommand(JSON.stringify({ v: PROTOCOL_VERSION, id: "c", ...x }));
  test("commands", () => {
    expect(c({ type: "tutor.list" }).ok).toBe(true);
    expect(c({ type: "tutor.note", project: "/p", source: "practice", practice: "key" }).ok).toBe(true);
    expect(c({ type: "tutor.note", project: "/p", source: "practice", practice: "made-up" }).ok).toBe(false);
    expect(c({ type: "tutor.note", project: "/p", source: "practice", practice: "key", right: true }).ok).toBe(false);
    expect(c({ type: "tutor.note", project: "/p", source: "check", checkpoint: "cp_1", right: true }).ok).toBe(true);
    expect(c({ type: "tutor.note", project: "/p", source: "check", checkpoint: "cp_1" }).ok).toBe(false);
    expect(c({ type: "tutor.note", project: "/p", source: "yourTurn", checkpoint: "cp_1", right: true }).ok).toBe(false);
    expect(c({ type: "tutor.forget", kind: "key_in_code", part: "learned" }).ok).toBe(true);
    expect(c({ type: "tutor.forget", kind: "moods", part: "learned" }).ok).toBe(false);
  });
  test("the event", () => {
    const e = (x: Record<string, unknown>) => parseEvent(JSON.stringify({ v: PROTOCOL_VERSION, id: "e", type: "tutor.learned", on: true, paused: false, ...x }));
    expect(e({ signals: [{ kind: "open_table", source: "review", date: "2026-11-14" }] }).ok).toBe(true);
    expect(e({ signals: [{ kind: "open_table", source: "review", date: "2026-11-14", words: "x" }] }).ok).toBe(false);
    expect(e({ signals: [{ kind: "open_table", source: "review", date: "2026-11-14", missed: false }] }).ok).toBe(false);
    expect(e({ signals: [], score: 3 }).ok).toBe(false);
    const fx = readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").filter((l) => l.includes('"tutor.learned"'));
    expect(fx.length).toBe(2);
    for (const l of fx) expect(parseEvent(l).ok).toBe(true);
  });
});

// ---------- through the engine ----------

const say = (text: string): Step => ({ text, costUsd: 0.01 });
const edit = (file_path: string, old_string: string, new_string: string): Step => ({ tool: { name: "Edit", input: { file_path, old_string, new_string } }, costUsd: 0.01 });
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const passed = (): LadderResult => ({ verdict: "passed", steps: [] });
const QUESTION = '{"why":["The file had a new name, so the old name found nothing.","Now the line uses the new name."],"question":{"text":"Why did it stop?","options":["The old name was used","The computer was slow"],"correct":0}}';
const REASONS = '{"why":["The file had a new name, so the old name found nothing.","Now the line uses the new name."]}';
const A = "import x\nconst n = user.name;\nend\n";
const B = "function t() {\n  return title(user.name);\n}\n";

function rig(o: { rounds: Step[][]; values?: Record<string, unknown>; explain?: string; proofs?: (ctx: ProofContext) => Promise<LadderResult> }) {
  const project = tmp("p"), data = tmp("d"), events: Event[] = [];
  for (const [f, t] of Object.entries({ "src/a.js": A, "src/b.js": B })) { mkdirSync(dirname(join(project, f)), { recursive: true }); writeFileSync(join(project, f), t); }
  const settings = new RunnerSettings();
  settings.apply({ v: 1, id: "s", type: "settings.apply", values: { "teach.yourTurn": true, ...o.values } });
  const explainer = async () => ({ text: o.explain ?? QUESTION, costUsd: 0.002 });
  const runner = new AgentRunner({ settings, shadowRoot: tmp("s"), engine: new ScriptedEngine(o.rounds), log: new TaskLog(":memory:"), emit: (e) => events.push(e), memoryDir: data, explainer, proof: async (ctx) => (o.proofs ? o.proofs(ctx) : passed()) });
  const start = (prompt = fixFoundPrompt({ label: "Starting the app", detail: "Error: Cannot find module './prices'" })) => runner.handle({ v: 1, id: "s" + Math.random(), type: "agent.start", project, agent: "b1", mode: "drive", prompt, model: "m", budgetUsd: 1 } as never);
  const cmd = (c: Record<string, unknown>) => runner.handle({ v: 1, id: "c" + Math.random(), project, ...c } as never);
  const learned = () => of(events, "tutor.learned").at(-1);
  return { project, data, events, settings, start, cmd, learned };
}
const oneFix: Step[] = [edit("src/a.js", "user.name", "user?.name"), say("Fixed.")];
const oneFixB: Step[] = [edit("src/b.js", "user.name", "user?.name"), say("Fixed.")];
const bothPlaces: Step[] = [edit("src/a.js", "user.name", "user?.name"), edit("src/b.js", "user.name", "user?.name"), say("Both.")];

describe("through the engine", () => {
  test("Learn asks, and is told the switch, the pause and the signals; every event passes the protocol", async () => {
    const t = rig({ rounds: [] });
    await t.cmd({ type: "tutor.list" });
    expect(t.learned()).toMatchObject({ type: "tutor.learned", on: true, paused: false, signals: [] });
    await t.cmd({ type: "tutor.note", source: "practice", practice: "import" });
    expect(t.learned().signals).toEqual([{ kind: "renamed_file", source: "practice", date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }]);
    for (const e of of(t.events, "tutor.learned")) expect(parseEvent(serialize(e)).ok).toBe(true);
  });
  test("an Explain check question answered right is learned once; a wrong one is missed; the kind comes from the task", async () => {
    const t = rig({ rounds: [oneFix, [edit("src/b.js", "user.name", "user?.name"), say("Fixed.")]] });
    await t.start(); await sleep(100);
    const cp = of(t.events, "explain.ready")[0].checkpoint;
    await t.cmd({ type: "tutor.note", source: "check", checkpoint: cp, right: true });
    await t.cmd({ type: "tutor.note", source: "check", checkpoint: cp, right: false });   // a second press on the same question counts for nothing
    expect(t.learned().signals.map((s: any) => [s.kind, s.source, !!s.missed])).toEqual([["renamed_file", "check", false]]);
    await t.start(fixFoundPrompt({ label: "Starting the app", detail: "SHOP_NAME is not set" })); await sleep(100);
    const cp2 = of(t.events, "explain.ready")[1].checkpoint;
    await t.cmd({ type: "tutor.note", source: "check", checkpoint: cp2, right: false });
    expect(t.learned().signals.map((s: any) => [s.kind, s.source, !!s.missed])).toEqual([["renamed_file", "check", false], ["missing_setting", "check", true]]);
  });
  test("a check question under an ordinary feature task is not noted, right or wrong, and its Your turn is not either", async () => {
    const t = rig({ rounds: [oneFix, oneFixB] });
    await t.start("Add a password reset page to the code"); await sleep(100);
    await t.cmd({ type: "tutor.note", source: "check", checkpoint: of(t.events, "explain.ready")[0].checkpoint, right: true });
    await t.start("Add a dark mode toggle"); await sleep(100);
    await t.cmd({ type: "tutor.note", source: "check", checkpoint: of(t.events, "explain.ready")[1].checkpoint, right: false });
    await t.cmd({ type: "tutor.list" });
    expect(t.learned().signals).toEqual([]);
  });
  test("a Your turn change under an ordinary feature task is not noted", async () => {
    const t = rig({ rounds: [bothPlaces] });
    await t.start("Show a message when the user name is not set");
    const cp = of(t.events, "receipt").at(-1).checkpoint;
    await t.cmd({ type: "teach.try", checkpoint: cp });
    writeFileSync(join(t.project, "src/b.js"), "function t() {\n  return title(user?.name);\n}\n");
    await t.cmd({ type: "teach.check", agent: "b1", checkpoint: cp });
    expect(of(t.events, "teach.result").at(-1).verdict).toBe("passed");
    await t.cmd({ type: "tutor.list" });
    expect(t.learned().signals).toEqual([]);
  });
  test("a feature task whose proof failed and then passed is noted with the failing check's kind", async () => {
    let n = 0;
    const t = rig({ rounds: [oneFix, [edit("src/b.js", "user.name", "user?.name"), say("Fixed.")]], proofs: async () => (n++ === 0 ? { verdict: "failed", steps: [{ rung: "checks", label: "Building", status: "failed", detail: "Error: Cannot find module './logo'", ms: 1 }] } : passed()) });
    await t.start("Add a logo to the header"); await sleep(150);
    await t.cmd({ type: "tutor.note", source: "check", checkpoint: of(t.events, "explain.ready")[0].checkpoint, right: true });
    expect(t.learned().signals.map((s: any) => [s.kind, s.source])).toEqual([["renamed_file", "check"]]);
  });
  test("erasing the profile's memory on the Memory page clears what was learned too, and it is not learned again", async () => {
    const t = rig({ rounds: [] });
    await t.cmd({ type: "tutor.note", source: "practice", practice: "key" });
    expect(t.learned().signals.length).toBe(1);
    await t.cmd({ type: "memory.erase", scope: "profile" });
    expect(t.learned().signals).toEqual([]);
    await t.cmd({ type: "tutor.note", source: "practice", practice: "key" });   // the practice record still says done
    await t.cmd({ type: "tutor.list" });
    expect(t.learned().signals).toEqual([]);
    expect(JSON.parse(readFileSync(join(t.data, LEARNED_FILE), "utf8")).signals).toEqual([]);
    await t.cmd({ type: "tutor.note", source: "practice", practice: "route" });   // something new is learned as usual
    expect(t.learned().signals.map((s: any) => s.kind)).toEqual(["broken_link"]);
  });
  test("a check note for a checkpoint with no question the engine asked counts for nothing", async () => {
    const t = rig({ rounds: [oneFix], explain: REASONS });
    await t.start(); await sleep(100);
    const cp = of(t.events, "explain.ready")[0].checkpoint;
    await t.cmd({ type: "tutor.note", source: "check", checkpoint: cp, right: true });
    await t.cmd({ type: "tutor.note", source: "check", checkpoint: "cp_999", right: true });
    expect(t.learned().signals).toEqual([]);
  });
  test("a Your turn change of the person's own that the checks proved is learned; one that failed is not", async () => {
    let n = 0;
    const t = rig({ rounds: [bothPlaces], proofs: async () => (n++ === 1 ? { verdict: "failed", steps: [{ rung: "tests", label: "Tests", status: "failed", detail: "no", ms: 1 }] } : passed()) });
    await t.start(fixFoundPrompt({ label: "Starting the app", detail: "Error: Cannot find module './prices' in two places" }));
    const cp = of(t.events, "receipt")[0].checkpoint;
    await t.cmd({ type: "teach.try", checkpoint: cp });
    writeFileSync(join(t.project, "src/b.js"), "function t() {\n  return title(user.nam);\n}\n");
    await t.cmd({ type: "teach.check", agent: "b1", checkpoint: cp });
    expect(of(t.events, "teach.result").at(-1).verdict).toBe("failed");
    await t.cmd({ type: "tutor.list" });
    expect(t.learned().signals).toEqual([]);
    writeFileSync(join(t.project, "src/b.js"), "function t() {\n  return title(user?.name);\n}\n");
    await t.cmd({ type: "teach.check", agent: "b1", checkpoint: cp });
    expect(of(t.events, "teach.result").at(-1).verdict).toBe("passed");
    expect(t.learned().signals.map((s: any) => [s.kind, s.source])).toEqual([["renamed_file", "yourTurn"]]);
  });
  test("with the switch off nothing is learned and Learn is told it is off; Pause memory stops it too", async () => {
    const t = rig({ rounds: [], values: { "tutor.on": false } });
    await t.cmd({ type: "tutor.note", source: "practice", practice: "key" });
    await t.cmd({ type: "tutor.list" });
    expect(t.learned()).toMatchObject({ on: false, signals: [] });
    t.settings.apply({ v: 1, id: "s2", type: "settings.apply", values: { "tutor.on": true } });
    new MemoryStore({ project: "", profileDir: t.data }).setPaused(true);
    await t.cmd({ type: "tutor.note", source: "practice", practice: "key" });
    expect(t.learned()).toMatchObject({ on: true, paused: true, signals: [] });
  });
  test("forget through the engine, and the forgotten practice is not learned again from the record", async () => {
    const t = rig({ rounds: [] });
    await t.cmd({ type: "tutor.note", source: "practice", practice: "key" });
    await t.cmd({ type: "tutor.note", source: "practice", practice: "route" });
    await t.cmd({ type: "tutor.forget", kind: "key_in_code", part: "learned" });
    await t.cmd({ type: "tutor.note", source: "practice", practice: "key" });
    expect(t.learned().signals.map((s: any) => s.kind)).toEqual(["broken_link"]);
  });
  test("scope: it stays in the memory folder, never in the project, never in the project's memory, never told to Claude", async () => {
    const t = rig({ rounds: [oneFix] });
    await t.start(); await sleep(100);
    await t.cmd({ type: "tutor.note", source: "check", checkpoint: of(t.events, "explain.ready")[0].checkpoint, right: true });
    await t.cmd({ type: "tutor.note", source: "practice", practice: "key" });
    expect(existsSync(join(t.data, LEARNED_FILE))).toBe(true);
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    expect(walk(t.project).some((f) => f.includes("learned"))).toBe(false);
    const m = new MemoryStore({ project: t.project, profileDir: t.data });
    const told = m.forAgent(5000);
    for (const w of ["key_in_code", "renamed_file", "practice", "learned"]) expect(told).not.toContain(w);
    for (const e of [...m.list("profile").entries, ...m.list("project").entries]) expect(e.text).not.toMatch(/key_in_code|renamed_file/);
  });
});

// ---------- a review's problem that a later change fixed, and the person kept ----------

const KEY = "sk_live_51HabcdefghijklmnopQRSTUVwx";
function reviewRig(o: { rulesOnly?: boolean; on?: boolean } = {}) {
  const project = tmp("proj"), shadow = tmp("shadow");
  mkdirSync(join(project, "src"), { recursive: true });
  writeFileSync(join(project, "src/App.tsx"), "export const title = 'Hello';\n");
  const store = new CheckpointStore(join(shadow, "p.git"), project);
  const events: Record<string, any>[] = [];
  let send: ((rel: string) => void) | null = null;
  const watch: WatchFn = (_d, on) => { send = on; return { close: () => { send = null; } }; };
  const values: Record<string, unknown> = { "review.mode": "ask", "flow.on": true, "tutor.on": o.on ?? true };
  const learned: { project: string; kind: string; key: string }[] = [];
  const svc = new ReviewService({
    emit: (e) => events.push(e), setting: (k) => values[k], store: () => store, cheap: null, strong: null,
    spend: { room: () => 10, book: () => {} }, watch, graceMs: 20, quietMs: () => 30, silenced: () => [],
    rulesOnly: () => o.rulesOnly === true, learned: (p, kind, key) => learned.push({ project: p, kind, key }),
  });
  services.push(svc);
  const change = (files: Record<string, string>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(join(project, p, ".."), { recursive: true }); writeFileSync(join(project, p), c); send?.(p); } };
  const until = async (pred: () => boolean, ms = 8000) => { for (let i = 0; i < ms / 20 && !pred(); i++) await sleep(20); expect(pred()).toBe(true); };
  const review = async (n: number) => {
    await until(() => events.filter((e) => e.type === "review.batch").length >= n);
    const batch = events.filter((e) => e.type === "review.batch").at(-1)!.batch;
    await svc.handle({ v: PROTOCOL_VERSION, id: "c", type: "review.now", project, batch } as Command as never);
  };
  const remove = (p: string) => { rmSync(join(project, p)); send?.(p); };
  return { project, svc, events, learned, change, remove, review, until };
}

describe("a problem a review found, fixed by a later change and kept", () => {
  test("a key taken out after a review is learned once, as a key written into the code", async () => {
    const t = reviewRig();
    t.svc.setProject(t.project); await t.svc.ready();
    t.change({ "src/pay.ts": `export const k = "${KEY}";\n` });
    await t.review(1);
    t.change({ "src/pay.ts": "export const k = process.env.STRIPE_KEY;\n" });
    await t.review(2);
    await t.until(() => t.events.some((e) => e.type === "review.recheck"));
    expect(t.learned.map((l) => [l.project, l.kind])).toEqual([[t.project, "key_in_code"]]);
    expect(t.learned[0].key).not.toContain(KEY);
  });
  test("not when the later change only undid the whole change", async () => {
    const t = reviewRig();
    t.svc.setProject(t.project); await t.svc.ready();
    t.change({ "src/pay.ts": `export const k = "${KEY}";\n` });
    await t.review(1);
    t.remove("src/pay.ts");
    await t.review(2);
    await t.until(() => t.events.some((e) => e.type === "review.recheck"));
    expect(t.learned).toEqual([]);
  });
  test("not in the key practice's copy (the practice counts it), and not with the tutor off", async () => {
    for (const o of [{ rulesOnly: true }, { on: false }]) {
      const t = reviewRig(o);
      t.svc.setProject(t.project); await t.svc.ready();
      t.change({ "src/pay.ts": `export const k = "${KEY}";\n` });
      await t.review(1);
      t.change({ "src/pay.ts": "export const k = process.env.STRIPE_KEY;\n" });
      await t.review(2);
      await t.until(() => t.events.some((e) => e.type === "review.recheck"));
      expect(t.learned).toEqual([]);
      t.svc.stop();
    }
  });
});

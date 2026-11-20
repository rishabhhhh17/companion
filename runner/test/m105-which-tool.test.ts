// M105 (docs/milestones/M105-which-tool-finished.md): which tool finished, and did it work. Each tool's done hook touches its
// own marker so the review says which tool finished; a line written before M105 still works; Codex's PermissionRequest hook
// says it is waiting, prints nothing, exits 0 and never reads its input; Remove takes every line out. Every folder is a
// temporary fixture, the hooks are the real commands run by /bin/sh, and no model, key or git command is used.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEvent, PROTOCOL_VERSION, type Command } from "../../protocol/index.ts";
import { CheckpointStore } from "../src/checkpoints.ts";
import { DoneSignals, eventOf, HOOK_FILE, hookCommand, markerOf, TOOL_HOOKS, waitTouchCommand, type DoneTool } from "../src/donesignal.ts";
import { HookGuard } from "../src/guard.ts";
import type { WatchFn } from "../src/review/batcher.ts";
import { ReviewService } from "../src/review/service.ts";

const made: string[] = [];
const services: ReviewService[] = [];
const signals: DoneSignals[] = [];
const guards: HookGuard[] = [];
afterEach(() => {
  while (services.length) services.pop()!.stop();
  while (signals.length) signals.pop()!.stop();
  while (guards.length) guards.pop()!.stop();
  while (made.length) rmSync(made.pop()!, { recursive: true, force: true });
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tmp = (label: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-test-m105-${label}-`))); made.push(d); return d; };
const until = async (pred: () => boolean, ms = 6000) => { for (let i = 0; i < ms / 20 && !pred(); i++) await sleep(20); expect(pred()).toBe(true); };
const json = (f: string) => JSON.parse(readFileSync(f, "utf8"));
/** Every command string anywhere in a hook file. */
const commandsIn = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.flatMap(commandsIn);
  if (v && typeof v === "object") return Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => (k === "command" && typeof x === "string" ? [x] : commandsIn(x)));
  return [];
};
const run = (cmd: string, input = "") => Bun.spawnSync(["/bin/sh", "-c", cmd], { stdin: new TextEncoder().encode(input) });
/** Every file under a folder, with its bytes. */
function dump(dir: string): string {
  const out: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d).sort()) { const f = join(d, n); if (statSync(f).isDirectory()) walk(f); else out.push(`${f}\n${readFileSync(f, "utf8")}`); } };
  if (existsSync(dir)) walk(dir);
  return out.join("\n");
}

describe("one done marker per tool", () => {
  test("each tool's done line touches its own marker, and the signal names that tool", async () => {
    const data = tmp("data"), p = tmp("proj");
    const said: [string, DoneTool | null][] = [];
    const s = new DoneSignals(data, { onDone: (q, t) => said.push([q, t]) });
    signals.push(s);
    expect(s.start()).toBe(true);
    for (const t of ["claude", "codex", "cursor", "copilot", "antigravity", "gemini", "windsurf"] as const) s.add(p, t);
    for (const t of ["codex", "cursor", "claude", "windsurf"] as const) {
      const cmd = commandsIn(json(join(p, HOOK_FILE[t]))).find((c) => c.startsWith("/usr/bin/touch -- ") && c.endsWith("printf '{}'"))!;
      expect(cmd).toBe(hookCommand(s.markerFor(p, false, t)!));
      expect(cmd).toContain(`.${t}'`);
      expect(run(cmd).exitCode).toBe(0);
      await until(() => said.length > 0 && said.at(-1)![1] === t);
    }
    expect(said.map((x) => x[1])).toEqual(["codex", "cursor", "claude", "windsurf"]);
    expect(said.every((x) => x[0] === p)).toBe(true);
    // Every marker is taken away as it is read.
    await until(() => readdirSync(join(data, "done")).length === 0, 2000);
  });
  test("a marker's name: the token, its tool, and wait; anything else is nothing", () => {
    const t = "0123456789abcdef01234567";
    expect(markerOf(t)).toEqual({ token: t, tool: null, wait: false });
    expect(markerOf(`${t}.codex`)).toEqual({ token: t, tool: "codex", wait: false });
    expect(markerOf(`${t}.codex.wait`)).toEqual({ token: t, tool: "codex", wait: true });
    // M115 (changed on purpose): Zed is one of the tools now, so a tool that is not on the list stands in for it.
    for (const bad of [`${t}.lovable`, `${t}.wait`, `${t}.codex.wait.x`, `${t}x`, "notes.txt", `${t}.Codex`, `../${t}.codex`]) expect(markerOf(bad)).toBeNull();
  });
  test("a stray file in the done folder and a marker of an unknown project say nothing", async () => {
    const data = tmp("data"), p = tmp("proj");
    const said: unknown[] = [];
    const s = new DoneSignals(data, { onDone: (...a) => said.push(a), onWaiting: (...a) => said.push(a) });
    signals.push(s);
    s.add(p, "codex"); s.start();
    writeFileSync(join(data, "done", "abcdefabcdefabcdefabcdef.codex"), "");
    writeFileSync(join(data, "done", "readme.txt"), "");
    await sleep(300);
    expect(said).toEqual([]);
    expect(existsSync(join(data, "done", "readme.txt"))).toBe(true);
  });
});

describe("lines from before M105 (the migration)", () => {
  /** The done line exactly as Squibby wrote it before M105: it touched <token>, with no tool. */
  const oldLine = (s: DoneSignals, p: string, t: DoneTool) => {
    s.add(p, t);
    const f = join(p, HOOK_FILE[t]);
    const text = readFileSync(f, "utf8").replace(`${s.markerFor(p, false)!}.${t}'`, `${s.markerFor(p, false)!}'`);
    writeFileSync(f, text);
    return hookCommand(s.markerFor(p, false)!);
  };
  test("an old line is still on, is shown as older with Update, and is credited to the one tool that has it", async () => {
    const data = tmp("data"), p = tmp("proj");
    const said: (DoneTool | null)[] = [];
    const s = new DoneSignals(data, { onDone: (_q, t) => said.push(t) });
    signals.push(s);
    const old = oldLine(s, p, "codex");
    expect(commandsIn(json(join(p, HOOK_FILE.codex)))).toContain(old);
    const plan = s.plan(p, "codex");
    expect(plan.on).toBe(true);
    expect(plan.stale).toBe(true);
    s.start();
    expect(run(old).exitCode).toBe(0);
    await until(() => said.length === 1);
    expect(said).toEqual(["codex"]);
  });
  test("with two tools' done lines on, an old marker is credited to no tool, and the review still moves on", async () => {
    const data = tmp("data"), p = tmp("proj");
    const said: (DoneTool | null)[] = [];
    const s = new DoneSignals(data, { onDone: (_q, t) => said.push(t) });
    signals.push(s);
    const old = oldLine(s, p, "claude");
    s.add(p, "cursor");
    expect(s.creditOf(p)).toBeNull();
    s.start();
    run(old);
    await until(() => said.length === 1);
    expect(said).toEqual([null]);
  });
  test("Update writes today's line in place of the old one, never beside it, and keeps the person's own hook", () => {
    const data = tmp("data"), p = tmp("proj");
    mkdirSync(join(p, ".codex"));
    writeFileSync(join(p, HOOK_FILE.codex), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "say done" }] }] } }));
    const s = new DoneSignals(data);
    const old = oldLine(s, p, "codex");
    expect(json(join(p, HOOK_FILE.codex)).hooks.Stop).toHaveLength(2);
    const r = s.add(p, "codex");
    expect(r.on).toBe(true);
    expect(r.stale).toBeUndefined();
    const stop = json(join(p, HOOK_FILE.codex)).hooks.Stop;
    expect(stop).toHaveLength(2);
    expect(stop[0].hooks[0].command).toBe("say done");
    expect(commandsIn(stop)).not.toContain(old);
    expect(commandsIn(stop)).toContain(hookCommand(s.markerFor(p, false, "codex")!));
  });
  test("Remove takes out an old line too", () => {
    const data = tmp("data"), p = tmp("proj");
    const s = new DoneSignals(data);
    oldLine(s, p, "cursor");
    s.remove(p, "cursor");
    expect(existsSync(join(p, ".cursor"))).toBe(false);
  });
  test("an old marker still starts the review before the quiet time", async () => {
    const project = tmp("rp"), shadow = tmp("shadow"), data = tmp("data");
    writeFileSync(join(project, "app.js"), "export const a = 1;\n");
    const store = new CheckpointStore(join(shadow, "p.git"), project);
    const events: Record<string, any>[] = [];
    let send: ((rel: string) => void) | null = null;
    const watch: WatchFn = (_d, on) => { send = on; return { close: () => { send = null; } }; };
    const svc = new ReviewService({ emit: (e) => events.push(e), setting: (k) => ({ "review.mode": "ask", "flow.on": true } as Record<string, unknown>)[k], store: () => store, spend: { room: () => 10, book: () => {} }, watch, graceMs: 20, quietMs: () => 60_000, doneSettleMs: 30 });
    services.push(svc);
    const s = new DoneSignals(data, { onDone: (q, t) => svc.doneSignal(q, t) });
    signals.push(s);
    svc.setProject(project); await svc.ready();
    const old = oldLine(s, project, "claude");
    s.start();
    writeFileSync(join(project, "app.js"), "export const a = 2;\n"); (send as ((rel: string) => void) | null)?.("app.js");
    await sleep(100);
    run(old);
    await until(() => events.some((e) => e.type === "review.batch" && e.count > 0), 4000);
    // The one tool with a done line here was Claude Code, so the old marker is credited to it.
    expect(events.find((e) => e.type === "review.batch")!.by).toBe("claude");
  });
});

describe("Codex's waiting signal (PermissionRequest)", () => {
  test("Codex has a waiting hook under PermissionRequest; the other tools have none, and Claude Code keeps its own", () => {
    // M113 (changed on purpose): Codex also has the live feed hook.
    // M114 (changed on purpose): and approve, beside the waiting signal under PermissionRequest.
    expect([...TOOL_HOOKS.codex]).toEqual(["done", "guard", "waiting", "feed", "approve"]);
    expect(eventOf("codex", "waiting")).toBe("PermissionRequest");
    expect(eventOf("claude", "waiting")).toBe("Notification");
    for (const t of ["cursor", "copilot", "antigravity", "gemini", "windsurf"] as const) expect(TOOL_HOOKS[t].includes("waiting")).toBe(false);
  });
  test("the plan shows the exact line in .codex/hooks.json and writes nothing until the yes", () => {
    const data = tmp("data"), p = tmp("proj");
    const s = new DoneSignals(data);
    const plan = s.plan(p, "codex", "waiting");
    expect(plan.rel).toBe(".codex/hooks.json");
    expect(plan.problem).toBeUndefined();
    expect(Object.keys(JSON.parse(plan.adds).hooks)).toEqual(["PermissionRequest"]);
    expect(existsSync(join(p, ".codex"))).toBe(false);
  });
  test("its command prints nothing, exits 0, never reads its input, and touches only an empty marker", async () => {
    const data = tmp("data"), p = tmp("proj");
    const waits: [string, DoneTool][] = [], dones: unknown[] = [];
    const s = new DoneSignals(data, { onDone: (...a) => dones.push(a), onWaiting: (q, t) => waits.push([q, t]) });
    signals.push(s);
    expect(s.add(p, "codex", "waiting").on).toBe(true);
    const entry = json(join(p, HOOK_FILE.codex)).hooks.PermissionRequest;
    expect(entry).toHaveLength(1);
    expect(entry[0].matcher).toBeUndefined();
    const cmd = entry[0].hooks[0].command as string;
    const marker = s.markerFor(p, false, "codex", true)!;
    expect(cmd).toBe(waitTouchCommand(marker));
    // Nothing in it reads standard input or prints: no cat, no read, no redirect from input, no printf or echo.
    for (const w of ["cat", "read ", "<", "printf", "echo", "$("]) expect(cmd.includes(w)).toBe(false);
    s.start();
    const input = JSON.stringify({ hook_event_name: "PermissionRequest", tool_name: "Bash", tool_input: { command: "rm -rf build SECRET-WORDS-105" } });
    const r = run(cmd, input);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.toString()).toBe("");
    expect(r.stderr.toString()).toBe("");
    await until(() => waits.length === 1);
    expect(waits).toEqual([[p, "codex"]]);
    expect(dones).toEqual([]);
    expect(dump(data)).not.toContain("SECRET-WORDS");
    // A folder that cannot be written still ends with 0 and says nothing, so Codex is never held up.
    const broken = run(waitTouchCommand("/nonexistent/folder/x.codex.wait"));
    expect(broken.exitCode).toBe(0);
    expect(broken.stdout.toString() + broken.stderr.toString()).toBe("");
  });
  test("the guard says Codex is waiting with no words, and the next hook event for the project ends it", async () => {
    const data = tmp("data"), p = tmp("proj");
    const events: Record<string, unknown>[] = [];
    const s = new DoneSignals(data);
    const g = new HookGuard(s.guardFolder, { projectOf: (t: string) => s.projectOf(t), snapshot: async () => ({ id: "cp" }), emit: (e: Record<string, unknown>) => events.push(e) } as never);
    guards.push(g);
    g.toolWaiting(p, "codex");
    expect(events).toEqual([{ type: "hook.waiting", project: p, waiting: true, tool: "codex" }]);
    g.activity(p);
    expect(events.at(-1)).toEqual({ type: "hook.waiting", project: p, waiting: false });
    for (const e of events) expect(parseEvent(JSON.stringify({ v: PROTOCOL_VERSION, id: "x", ...e })).ok).toBe(true);
    expect(g.waits().timers).toBe(0);
  });
  test("Remove takes the PermissionRequest line out, and the file Squibby made goes with it", () => {
    const data = tmp("data"), p = tmp("proj");
    const s = new DoneSignals(data);
    s.add(p, "codex", "waiting");
    s.add(p, "codex");
    s.remove(p, "codex", "waiting");
    const j = json(join(p, HOOK_FILE.codex));
    expect(j.hooks.PermissionRequest).toBeUndefined();
    expect(j.hooks.Stop).toHaveLength(1);
    s.remove(p, "codex");
    expect(existsSync(join(p, ".codex"))).toBe(false);
  });
  test("the person's own PermissionRequest hook stays", () => {
    const data = tmp("data"), p = tmp("proj");
    mkdirSync(join(p, ".codex"));
    const theirs = { hooks: { PermissionRequest: [{ matcher: "Bash", hooks: [{ type: "command", command: "./notify.sh" }] }] } };
    writeFileSync(join(p, HOOK_FILE.codex), JSON.stringify(theirs));
    const s = new DoneSignals(data);
    s.add(p, "codex", "waiting");
    expect(json(join(p, HOOK_FILE.codex)).hooks.PermissionRequest).toHaveLength(2);
    s.remove(p, "codex", "waiting");
    expect(json(join(p, HOOK_FILE.codex))).toEqual(theirs);
  });
});

describe("the review names the tool that finished", () => {
  function setup() {
    const project = tmp("rp"), shadow = tmp("shadow"), data = tmp("data");
    writeFileSync(join(project, "app.js"), "export const a = 1;\n");
    const store = new CheckpointStore(join(shadow, "p.git"), project);
    const events: Record<string, any>[] = [];
    let send: ((rel: string) => void) | null = null;
    const watch: WatchFn = (_d, on) => { send = on; return { close: () => { send = null; } }; };
    const svc = new ReviewService({
      emit: (e) => events.push(e), setting: (k) => ({ "review.mode": "ask", "flow.on": true } as Record<string, unknown>)[k], store: () => store,
      cheap: null, strong: null, spend: { room: () => 10, book: () => {} }, watch, graceMs: 20, quietMs: () => 60_000, doneSettleMs: 30,
    });
    services.push(svc);
    const s = new DoneSignals(data, { onDone: (q, t) => svc.doneSignal(q, t) });
    signals.push(s);
    const change = (f: string, c: string) => { writeFileSync(join(project, f), c); send?.(f); };
    const of = (t: string) => events.filter((e) => e.type === t);
    const cmd = (type: string, extra: Record<string, unknown> = {}) => ({ v: PROTOCOL_VERSION, id: `c_${type}`, type, project, ...extra }) as Command;
    return { project, svc, s, events, change, of, cmd };
  }
  test("Codex's done signal credits the batch and its result to Codex, with no model call", async () => {
    const t = setup();
    t.svc.setProject(t.project); await t.svc.ready();
    t.s.add(t.project, "codex"); t.s.add(t.project, "claude"); t.s.start();
    t.change("app.js", "export const a = 2;\n");
    await sleep(80);
    expect(run(hookCommand(t.s.markerFor(t.project, false, "codex")!)).exitCode).toBe(0);
    await until(() => t.of("review.batch").some((e) => e.count > 0));
    const b = t.of("review.batch").find((e) => e.count > 0)!;
    expect(b.by).toBe("codex");
    await t.svc.handle(t.cmd("review.now", { batch: b.batch }) as never);
    const r = t.of("review.result").at(-1)!;
    expect(r).toMatchObject({ ok: true, batch: b.batch, by: "codex" });
    // No model is set up at all (cheap and strong are none), so the words are the rules' own.
    expect(r.lane).toBe("none");
    for (const e of t.events) { const v = parseEvent(JSON.stringify({ v: 1, id: "x", ...e })); expect(v.ok, JSON.stringify(e)).toBe(true); }
  });
  test("changes said by the quiet time alone carry no tool; a done signal after them credits that open batch", async () => {
    const t = setup();
    t.svc.setProject(t.project); await t.svc.ready();
    t.s.add(t.project, "cursor"); t.s.start();
    t.change("app.js", "export const a = 5;\n");
    // No signal: the batch is said when asked (Review now measures it), with no tool.
    await sleep(80);
    await t.svc.handle(t.cmd("review.now") as never);
    const b = t.of("review.batch").find((e) => e.count > 0)!;
    expect(b.by).toBeUndefined();
    const plain = t.of("review.result").at(-1)!;
    expect(plain.by).toBeUndefined();
  });
  test("a done signal with nothing changed credits nothing later", async () => {
    const t = setup();
    t.svc.setProject(t.project); await t.svc.ready();
    expect(t.svc.doneSignal(t.project, "codex")).toBe(false);
    t.change("app.js", "export const a = 9;\n");
    await sleep(80);
    await t.svc.handle(t.cmd("review.now") as never);
    expect(t.of("review.batch").find((e) => e.count > 0)!.by).toBeUndefined();
  });
});

describe("the protocol (shared fixtures, read by the shell's suite and the pages too)", () => {
  const fx = readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").filter((l) => l.includes('"id":"m105e')).map((l) => JSON.parse(l));
  test("a batch and results credited to a tool, and Codex waiting, parse", () => {
    expect(fx.length).toBe(4);
    for (const e of fx) expect(parseEvent(JSON.stringify(e)).ok).toBe(true);
    expect(fx.map((e) => e.by ?? e.tool)).toEqual(["codex", "codex", "cursor", "codex"]);
  });
  test("an unknown tool, and words on another tool's waiting signal, are refused", () => {
    // M115 (changed on purpose): Zed is one of the tools now; a tool that is not on the list is still refused.
    expect(parseEvent(JSON.stringify({ ...fx[0], by: "lovable" })).ok).toBe(false);
    expect(parseEvent(JSON.stringify({ ...fx[1], by: "Codex" })).ok).toBe(false);
    expect(parseEvent(JSON.stringify({ ...fx[3], tool: "lovable" })).ok).toBe(false);
    expect(parseEvent(JSON.stringify({ ...fx[3], message: "Codex wants to run rm" })).ok).toBe(false);
    // Claude Code's own waiting line keeps its short notice.
    expect(parseEvent(JSON.stringify({ ...fx[3], tool: "claude", message: "Claude needs your permission" })).ok).toBe(true);
  });
});

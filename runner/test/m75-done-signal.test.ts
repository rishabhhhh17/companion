// M75 (roadmap 19, F30): review the moment the other tool says it is done. The hook Squibby adds after the person's yes, its
// removal, the signal reaching the review before the quiet time, and nothing reaching git. Every folder is a temporary
// fixture; the person's own git is never written or read.
import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCommand, parseEvent, PROTOCOL_VERSION } from "../../protocol/index.ts";
import { CheckpointStore } from "../src/checkpoints.ts";
import { DoneSignals, HOOK_FILE, hookCommand } from "../src/donesignal.ts";
import { ignoredPath, type WatchFn } from "../src/review/batcher.ts";
import { ReviewService } from "../src/review/service.ts";

const made: string[] = [];
const services: ReviewService[] = [];
const signals: DoneSignals[] = [];
afterEach(() => { while (services.length) services.pop()!.stop(); while (signals.length) signals.pop()!.stop(); while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tmp = (label: string) => { const d = mkdtempSync(join(tmpdir(), `companion-test-m75-${label}-`)); made.push(d); return d; };
const until = async (pred: () => boolean, ms = 6000) => { for (let i = 0; i < ms / 20 && !pred(); i++) await sleep(20); expect(pred()).toBe(true); };
/** Every file under a folder with a hash of its bytes: the same before and after means nothing in it changed. */
function print(dir: string): string {
  const out: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d).sort()) { const f = join(d, n); if (statSync(f).isDirectory()) walk(f); else out.push(`${f.slice(dir.length)} ${createHash("sha256").update(readFileSync(f)).digest("hex")}`); } };
  walk(dir);
  return out.join("\n");
}
function gitProject(): string {
  const p = tmp("proj");
  writeFileSync(join(p, "index.html"), "<h1>Hi</h1>\n");
  Bun.spawnSync(["git", "init", "-q"], { cwd: p, env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } });
  return p;
}

describe("the hook Squibby adds, only after a yes", () => {
  test("the plan names the exact file and the exact lines, and writes nothing", () => {
    const data = tmp("data"), p = gitProject();
    const s = new DoneSignals(data);
    const plan = s.plan(p, "claude");
    expect(plan.rel).toBe(".claude/settings.local.json");
    expect(plan.file).toBe(join(p, ".claude/settings.local.json"));
    expect(plan.creates).toBe(true);
    expect(plan.on).toBe(false);
    expect(JSON.parse(plan.adds).hooks.Stop[0].hooks[0].type).toBe("command");
    expect(existsSync(join(p, ".claude"))).toBe(false);
    expect(s.plan(p, "codex").rel).toBe(".codex/hooks.json");
  });
  test("adding keeps every other key and hook of the file, and adding twice adds once", () => {
    const data = tmp("data"), p = gitProject();
    mkdirSync(join(p, ".claude"));
    const theirs = { permissions: { allow: ["Bash(npm test)"] }, hooks: { Stop: [{ hooks: [{ type: "command", command: "say done" }] }], PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo hi" }] }] } };
    writeFileSync(join(p, HOOK_FILE.claude), JSON.stringify(theirs));
    const s = new DoneSignals(data);
    const r = s.add(p, "claude");
    expect(r.problem).toBeUndefined();
    expect(r.on).toBe(true);
    const j = JSON.parse(readFileSync(join(p, HOOK_FILE.claude), "utf8"));
    expect(j.permissions).toEqual(theirs.permissions);
    expect(j.hooks.PreToolUse).toEqual(theirs.hooks.PreToolUse);
    expect(j.hooks.Stop).toHaveLength(2);
    expect(j.hooks.Stop[0]).toEqual(theirs.hooks.Stop[0]);
    s.add(p, "claude");
    expect(JSON.parse(readFileSync(join(p, HOOK_FILE.claude), "utf8")).hooks.Stop).toHaveLength(2);
    // Remove takes out only Squibby's own entry; the person's file stays, with what it had.
    const off = s.remove(p, "claude");
    expect(off.on).toBe(false);
    expect(JSON.parse(readFileSync(join(p, HOOK_FILE.claude), "utf8"))).toEqual(theirs);
  });
  test("a file that is not plain JSON is refused and left exactly as it was", () => {
    const data = tmp("data"), p = gitProject();
    mkdirSync(join(p, ".codex"));
    writeFileSync(join(p, HOOK_FILE.codex), "{ this is not json");
    const r = new DoneSignals(data).add(p, "codex");
    expect(r.problem).toContain(".codex/hooks.json");
    expect(readFileSync(join(p, HOOK_FILE.codex), "utf8")).toBe("{ this is not json");
    // A list at the top, or hooks that are not an object, are refused too.
    writeFileSync(join(p, HOOK_FILE.codex), "[1,2]");
    expect(new DoneSignals(data).add(p, "codex").problem).toBeTruthy();
    writeFileSync(join(p, HOOK_FILE.codex), JSON.stringify({ hooks: { Stop: "nope" } }));
    expect(new DoneSignals(data).add(p, "codex").problem).toBeTruthy();
    expect(readFileSync(join(p, HOOK_FILE.codex), "utf8")).toBe(JSON.stringify({ hooks: { Stop: "nope" } }));
  });
  test("a file and folder Squibby made are gone once its entry is removed; the git folder is the same throughout", () => {
    const data = tmp("data"), p = gitProject();
    const before = print(join(p, ".git"));
    const s = new DoneSignals(data);
    s.add(p, "codex");
    expect(existsSync(join(p, HOOK_FILE.codex))).toBe(true);
    expect(s.state(p).find((x) => x.tool === "codex")?.on).toBe(true);
    s.remove(p, "codex");
    expect(existsSync(join(p, ".codex"))).toBe(false);
    expect(print(join(p, ".git"))).toBe(before);
  });
  test("the command never reads its input, touches only the marker, prints {} and ends with 0", async () => {
    const data = tmp("data"), p = gitProject();
    const s = new DoneSignals(data);
    s.add(p, "claude");
    const cmd = JSON.parse(readFileSync(join(p, HOOK_FILE.claude), "utf8")).hooks.Stop[0].hooks[0].command as string;
    const marker = s.markerFor(p, false)!;
    expect(cmd).toBe(hookCommand(marker));
    // The turn's JSON, as the tool gives it, with words in it: none of it may land anywhere.
    const input = JSON.stringify({ session_id: "s1", cwd: p, hook_event_name: "Stop", last_assistant_message: "I changed the secret SECRET-WORDS-123" });
    const r = Bun.spawnSync(["/bin/sh", "-c", cmd], { stdin: new TextEncoder().encode(input), cwd: p });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.toString()).toBe("{}");
    expect(existsSync(marker)).toBe(true);
    expect(readFileSync(marker, "utf8")).toBe("");
    expect(print(data)).not.toContain("SECRET-WORDS");
    for (const f of readdirSync(join(data, "done"))) expect(readFileSync(join(data, "done", f), "utf8")).toBe("");
    // A marker folder that cannot be written still ends with 0, so the tool is never held up.
    const broken = hookCommand("/nonexistent/folder/x");
    expect(Bun.spawnSync(["/bin/sh", "-c", broken]).exitCode).toBe(0);
  });
  test("a data folder with a quote in its name still makes a command that touches it", () => {
    const base = tmp("data"), data = join(base, "it's here");
    mkdirSync(data);
    const s = new DoneSignals(data);
    const p = gitProject();
    s.add(p, "claude");
    const marker = s.markerFor(p, false)!;
    expect(Bun.spawnSync(["/bin/sh", "-c", hookCommand(marker)]).exitCode).toBe(0);
    expect(existsSync(marker)).toBe(true);
  });
  test("the review never counts the tools' own folders as a change", () => {
    expect(ignoredPath(".claude/settings.local.json")).toBe(true);
    expect(ignoredPath(".codex/hooks.json")).toBe(true);
  });
});

describe("the signal starts the review then", () => {
  function setup() {
    const project = tmp("rp"), shadow = tmp("shadow"), data = tmp("data");
    writeFileSync(join(project, "app.js"), "export const a = 1;\n");
    const store = new CheckpointStore(join(shadow, "p.git"), project);
    const events: Record<string, any>[] = [];
    let send: ((rel: string) => void) | null = null;
    const watch: WatchFn = (_d, on) => { send = on; return { close: () => { send = null; } }; };
    const svc = new ReviewService({
      emit: (e) => events.push(e), setting: (k) => ({ "review.mode": "ask", "flow.on": true } as Record<string, unknown>)[k], store: () => store,
      spend: { room: () => 10, book: () => {} }, watch, graceMs: 20, quietMs: () => 60_000, doneSettleMs: 30,
    });
    services.push(svc);
    const sig = new DoneSignals(data, { onDone: (p) => svc.doneSignal(p) });
    signals.push(sig);
    const batches = () => events.filter((e) => e.type === "review.batch");
    const change = (f: string, c: string) => { writeFileSync(join(project, f), c); send?.(f); };
    return { project, data, svc, sig, batches, change, events };
  }
  test("a marker for the project reviewed says the batch long before the quiet time", async () => {
    const t = setup();
    t.svc.setProject(t.project); await t.svc.ready();
    expect(t.sig.start()).toBe(true);
    t.sig.add(t.project, "claude");
    t.change("app.js", "export const a = 2;\n");
    await sleep(100);
    expect(t.batches()).toHaveLength(0);   // the quiet time is a minute here
    const r = Bun.spawnSync(["/bin/sh", "-c", hookCommand(t.sig.markerFor(t.project, false)!)]);
    expect(r.exitCode).toBe(0);
    await until(() => t.batches().length === 1, 4000);
    expect(t.batches()[0].files).toEqual([{ file: "app.js", kind: "modified" }]);
    // The marker is taken away as it is read.
    await until(() => readdirSync(join(t.data, "done")).length === 0, 2000);
    for (const e of t.events) { const p = parseEvent(JSON.stringify({ v: 1, id: "x", ...e })); expect(p.ok).toBe(true); }
  });
  test("a signal with nothing changed says nothing, and one for another folder does nothing", async () => {
    const t = setup();
    t.svc.setProject(t.project); await t.svc.ready();
    t.sig.start();
    expect(t.svc.doneSignal(t.project)).toBe(false);
    t.change("app.js", "export const a = 3;\n");
    expect(t.svc.doneSignal(tmp("other"))).toBe(false);
    await sleep(200);
    expect(t.batches()).toHaveLength(0);
    expect(t.svc.doneSignal(t.project)).toBe(true);
    await until(() => t.batches().length === 1, 3000);
  });
  test("with reviews off the signal does nothing", async () => {
    const t = setup();
    expect(t.svc.doneSignal(t.project)).toBe(false);   // nothing watched
  });
});

describe("protocol", () => {
  test("the commands and the event parse, and the add needs the yes", () => {
    const c = (o: object) => parseCommand(JSON.stringify({ v: PROTOCOL_VERSION, id: "c1", ...o }));
    expect(c({ type: "donesignal.show", project: "/p" }).ok).toBe(true);
    expect(c({ type: "donesignal.add", project: "/p", tool: "claude", confirm: true }).ok).toBe(true);
    expect(c({ type: "donesignal.add", project: "/p", tool: "claude" }).ok).toBe(false);
    expect(c({ type: "donesignal.add", project: "/p", tool: "zed", confirm: true }).ok).toBe(false);   // M80, M81: Cursor and Windsurf are known tools now
    expect(c({ type: "donesignal.remove", project: "/p", tool: "codex" }).ok).toBe(true);
    const e = parseEvent(JSON.stringify({ v: 1, id: "e1", type: "donesignal.state", project: "/p", tools: [{ tool: "claude", on: false, file: ".claude/settings.local.json", adds: "{}", creates: true }] }));
    expect(e.ok).toBe(true);
  });
});

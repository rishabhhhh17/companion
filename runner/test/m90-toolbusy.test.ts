// M90 (F32): the person's own AI tool working, said as hook.busy for Flowflow's peek out of the notch. Only the project is
// said, never the command; at most once every REPEAT_MS per project; done and Stop everything end it. Every folder is a
// temporary fixture and nothing here runs a model.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEvent, PROTOCOL_VERSION } from "../../protocol/index.ts";
import { DoneSignals, GUARD_DIR } from "../src/donesignal.ts";
import { HookGuard } from "../src/guard.ts";
import { REPEAT_MS, ToolBusy } from "../src/toolbusy.ts";

const made: string[] = [];
const guards: HookGuard[] = [];
afterEach(() => { while (guards.length) guards.pop()!.stop(); while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tmp = (label: string) => { const d = mkdtempSync(join(tmpdir(), `companion-test-m90-${label}-`)); made.push(d); return d; };
const until = async (pred: () => boolean, ms = 6000) => { for (let i = 0; i < ms / 20 && !pred(); i++) await sleep(20); expect(pred()).toBe(true); };

describe("hook.busy", () => {
  test("said once per project per REPEAT_MS, with only the project, and it keeps to the protocol", () => {
    let t = 1000;
    const ev: Record<string, unknown>[] = [];
    const b = new ToolBusy({ emit: (e) => ev.push(e), now: () => t });
    b.seen("/p/a"); b.seen("/p/a"); t += REPEAT_MS - 1; b.seen("/p/a");
    expect(ev).toEqual([{ type: "hook.busy", project: "/p/a", busy: true }]);
    t += 1; b.seen("/p/a"); b.seen("/p/b");
    expect(ev).toHaveLength(3);
    for (const e of ev) {
      expect(Object.keys(e).sort()).toEqual(["busy", "project", "type"]);
      expect(parseEvent(JSON.stringify({ v: PROTOCOL_VERSION, id: "x", ...e })).ok).toBe(true);
    }
  });
  test("the done hook says busy false once, only for a project said busy; Stop everything says it for every one", () => {
    const ev: Record<string, unknown>[] = [];
    const b = new ToolBusy({ emit: (e) => ev.push(e) });
    b.done("/p/never");
    expect(ev).toEqual([]);
    b.seen("/p/a"); b.seen("/p/b"); b.done("/p/a"); b.done("/p/a");
    expect(ev.filter((e) => e.busy === false)).toEqual([{ type: "hook.busy", project: "/p/a", busy: false }]);
    b.stop();
    expect(ev.at(-1)).toEqual({ type: "hook.busy", project: "/p/b", busy: false });
    expect(b.busy()).toEqual([]);
    // After a done, the next command is busy again at once.
    b.seen("/p/a");
    expect(ev.at(-1)).toEqual({ type: "hook.busy", project: "/p/a", busy: true });
  });
  test("the protocol refuses a busy event without its project or its yes or no", () => {
    expect(parseEvent(JSON.stringify({ v: PROTOCOL_VERSION, id: "x", type: "hook.busy", busy: true })).ok).toBe(false);
    expect(parseEvent(JSON.stringify({ v: PROTOCOL_VERSION, id: "x", type: "hook.busy", project: "/p" })).ok).toBe(false);
  });
  test("the guard says a known project is busy as it answers a request, and an unknown token says nothing", async () => {
    const data = tmp("data"), p = tmp("proj");
    const s = new DoneSignals(data);
    s.add(p, "claude", "guard");
    const dir = join(data, GUARD_DIR);
    const busy: string[] = [];
    const g = new HookGuard(dir, { projectOf: (t) => s.projectOf(t), emit: () => {}, snapshot: () => Promise.reject(new Error("never")), busy: (pr) => busy.push(pr) });
    expect(g.start()).toBe(true); guards.push(g);
    const req = JSON.stringify({ cwd: p, tool_name: "Bash", tool_input: { command: "npm test" } });
    const drop = (name: string) => { writeFileSync(join(dir, `${name}.tmp`), req); Bun.spawnSync(["mv", join(dir, `${name}.tmp`), join(dir, name)]); };
    drop(`${s.tokenFor(p, false)!}.1`);
    await until(() => existsSync(join(dir, `${s.tokenFor(p, false)!}.1.ok`)));
    await g.idle();
    expect(busy).toHaveLength(1);
    expect(busy[0].endsWith(p.split("/").at(-1)!)).toBe(true);
    drop(`${"a".repeat(24)}.2`);
    await until(() => existsSync(join(dir, `${"a".repeat(24)}.2.ok`)));
    await g.idle();
    expect(busy).toHaveLength(1);
  });
  test("a busy callback that throws never keeps the answer from going", async () => {
    const data = tmp("data"), p = tmp("proj");
    const s = new DoneSignals(data);
    s.add(p, "claude", "guard");
    const dir = join(data, GUARD_DIR);
    const g = new HookGuard(dir, { projectOf: (t) => s.projectOf(t), emit: () => {}, snapshot: () => Promise.reject(new Error("never")), busy: () => { throw new Error("boom"); } });
    expect(g.start()).toBe(true); guards.push(g);
    const name = `${s.tokenFor(p, false)!}.3`;
    writeFileSync(join(dir, `${name}.tmp`), JSON.stringify({ cwd: p, tool_name: "Bash", tool_input: { command: "ls" } })); Bun.spawnSync(["mv", join(dir, `${name}.tmp`), join(dir, name)]);
    await until(() => existsSync(join(dir, `${name}.ok`)));
  });
  test("the engine wires it: the guard's busy, the done hook's done, and Stop everything", () => {
    const main = require("node:fs").readFileSync(new URL("../src/main.ts", import.meta.url), "utf8") as string;
    expect(main).toContain("busy: (p) => toolBusy.seen(p),");
    expect(main).toContain("const doneSignals = new DoneSignals(settings.data, { onDone: (p) => { guard.activity(p); toolBusy.done(p); review.doneSignal(p); } });");
    expect(main).toContain(`interrupts.register("guard", { stop: () => { guard.stopWaits(); toolBusy.stop(); }, close: () => guard.stop() });`);
  });
});

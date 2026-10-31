// Groups of tools (F20, M12), the engine's side: a command of a group that is switched off is refused with one plain
// line, the core and what only takes back still go through, and a group just switched off stops what it was doing.
// The switches reach the engine in settings.apply, like every setting it applies (T16). Run as the real program.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GROUPS, OFF_LINE, TOOLS, groupsOff, newlyOff, refusal, toolOf } from "../src/groups.ts";
import { RunnerSettings } from "../src/settings.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-groups-${l}-`))); made.push(d); return d; };
const SWITCH: Record<string, string> = { flow: "flow.on", guide: "guide.on", voice: "voice.on", files: "files.on", prompt: "prompt.on" };
const offOf = (...g: string[]) => (k: string): unknown => (g.some((x) => SWITCH[x] === k) ? false : undefined);

describe("the catalog, read by the engine", () => {
  test("it is the same file the shell and the pages read, and every command the engine takes is in exactly one tool", () => {
    const src = readFileSync(join(import.meta.dir, "../../protocol/index.ts"), "utf8");
    const block = src.slice(src.indexOf("const COMMANDS"), src.indexOf("\n};", src.indexOf("const COMMANDS")));
    const types = [...block.matchAll(/^ {2}"([a-z]+(?:\.[A-Za-z]+)+)":/gm)].map((m) => m[1]);
    const listed = TOOLS.flatMap((t) => t.runner);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed, "agent.start"].sort()).toEqual([...types].sort());
    expect(GROUPS.filter((g) => !g.switch).map((g) => g.id)).toEqual(["core"]);
  });
  test("each group's switch is a setting the engine applies, usual on but file conversion (F28)", () => {
    const s = new RunnerSettings();
    for (const sw of Object.values(SWITCH)) expect(s.get(sw), sw).toBe(sw !== "files.on");
    const r = s.apply({ v: 1, id: "a", type: "settings.apply", values: { "flow.on": false, "voice.on": false } });
    expect(r.accepted.sort()).toEqual(["flow.on", "voice.on"]);
    expect(groupsOff((k) => s.get(k))).toEqual(["flow", "voice", "files"]);
    expect(s.apply({ v: 1, id: "b", type: "settings.apply", values: {} }).accepted).toEqual([]);
    expect(groupsOff((k) => s.get(k))).toEqual(["files"]);
  });
});

describe("a command of a group that is off", () => {
  for (const [g] of Object.entries(SWITCH)) {
    test(`${g} off: its commands are refused with the one line; every other tool, and the core, still go through`, () => {
      for (const t of TOOLS) {
        for (const r of t.runner) {
          const got = refusal(offOf(g), { type: r });
          const stays = (t.stays ?? []).includes(r);
          expect(got, `${g} off: ${r}`).toBe(t.group === g && !stays ? OFF_LINE : null);
        }
        for (const m of t.agentModes ?? []) expect(refusal(offOf(g), { type: "agent.start", mode: m }), `${g} off: agent.start ${m}`).toBe(t.group === g ? OFF_LINE : null);
      }
    });
  }
  test("agent.start follows its mode, and a mode nobody knows is not this file's to refuse", () => {
    expect(toolOf({ type: "agent.start", mode: "rescue" })?.id).toBe("rescue");
    expect(toolOf({ type: "agent.start", mode: "ship" })?.id).toBe("ship");
    expect(toolOf({ type: "agent.start" })).toBeUndefined();
    expect(refusal(offOf("flow"), { type: "agent.start", mode: "research" })).toBeNull();
    expect(refusal(offOf("flow"), { type: "agent.start", mode: "drive" })).toBe(OFF_LINE);
    expect(refusal(offOf("flow", "guide", "voice", "files", "prompt"), { type: "nothing.here" })).toBeNull();
  });
  test("with every group off Stop everything, approvals, settings, memory, Research and Ship still go through, and so does taking back", () => {
    const all = offOf("flow", "guide", "voice", "files", "prompt");
    for (const t of ["agent.interruptAll", "agent.interrupt", "approval.resolve", "runner.ping", "settings.apply", "memory.erase", "research.ask", "ship.live", "ship.rollback", "spending.set", "auth.check", "checkpoint.restore", "bisect.undo", "walk.stop"]) {
      expect(refusal(all, { type: t }), t).toBeNull();
    }
    expect(refusal(all, { type: "agent.start", mode: "research" })).toBeNull();
    expect(refusal(all, { type: "agent.start", mode: "ship" })).toBeNull();
  });
  test("only a group newly off counts as stopping", () => {
    expect(newlyOff([], ["flow"])).toEqual(["flow"]);
    expect(newlyOff(["flow"], ["flow", "voice"])).toEqual(["voice"]);
    expect(newlyOff(["flow"], [])).toEqual([]);
  });
});

function launch(script: unknown[] = []) {
  const data = tmp("data");
  const proc = Bun.spawn(["bun", join(import.meta.dir, "../src/main.ts")], {
    stdin: "pipe", stdout: "pipe", stderr: "pipe",
    env: { ...process.env, COMPANION_DATA: data, COMPANION_ENGINE: "scripted", COMPANION_SCRIPT: JSON.stringify(script) },
  });
  const lines: string[] = [];
  let buf = "";
  const done = (async () => {
    const dec = new TextDecoder();
    for await (const chunk of proc.stdout) { buf += dec.decode(chunk, { stream: true }); let i; while ((i = buf.indexOf("\n")) >= 0) { lines.push(buf.slice(0, i)); buf = buf.slice(i + 1); } }
  })();
  const send = (o: unknown) => { proc.stdin.write(JSON.stringify(o) + "\n"); proc.stdin.flush(); };
  const events = () => lines.map((l) => JSON.parse(l));
  const waitFor = async (cond: () => boolean, ms = 8000) => { const end = Date.now() + ms; while (!cond()) { if (Date.now() > end) throw new Error("timed out; saw: " + lines.join(" | ").slice(0, 800)); await new Promise((r) => setTimeout(r, 20)); } };
  const close = async () => { proc.stdin.end(); await proc.exited; await done; };
  return { send, events, lines, waitFor, close };
}
const apply = (values: Record<string, unknown>) => ({ v: 1, id: `s${Math.random()}`, type: "settings.apply", values });
const start = (project: string, mode = "drive") => ({ v: 1, id: "c1", type: "agent.start", project, agent: "a1", mode, prompt: "do it", model: "m", budgetUsd: 1 });

describe("the engine as a program", () => {
  test("Flow off: a task is refused with the one line and nothing starts; Flow on again and it runs; Stop everything always answers", async () => {
    const project = tmp("proj");
    const r = launch([{ text: "done", costUsd: 0 }]);
    await r.waitFor(() => r.lines.length >= 1);
    r.send(apply({ "flow.on": false }));
    await r.waitFor(() => r.events().some((e: any) => e.type === "settings.applied"));
    const before = r.lines.length;
    r.send(start(project));
    await r.waitFor(() => r.events().slice(before).some((e: any) => e.type === "protocol.error"));
    const refused = r.events().slice(before).find((e: any) => e.type === "protocol.error");
    expect(refused.reason).toBe(OFF_LINE);
    r.send({ v: 1, id: "p", type: "runner.ping" });
    await r.waitFor(() => r.events().slice(before).some((e: any) => e.type === "runner.pong"));
    expect(r.events().slice(before).some((e: any) => e.type === "agent.state")).toBe(false);
    r.send(apply({}));
    await r.waitFor(() => r.events().filter((e: any) => e.type === "settings.applied").length >= 2);
    r.send(start(project));
    await r.waitFor(() => r.events().some((e: any) => e.type === "receipt"));
    await r.close();
  });
  test("Flow switched off while a task runs stops it", async () => {
    const project = tmp("proj");
    const r = launch([{ text: "thinking", costUsd: 0, delayMs: 600_000 }]);
    await r.waitFor(() => r.lines.length >= 1);
    r.send(start(project));
    await r.waitFor(() => r.events().some((e: any) => e.type === "agent.state"));
    const before = r.lines.length;
    r.send(apply({ "flow.on": false }));
    await r.waitFor(() => r.events().slice(before).some((e: any) => e.type === "agent.state" && e.state !== "working" && e.state !== "thinking"));
    await r.close();
  });
  test("Guide off refuses a lesson and Prompt help off refuses the error explainer, each with the one line", async () => {
    const project = tmp("proj");
    const r = launch();
    await r.waitFor(() => r.lines.length >= 1);
    r.send(apply({ "guide.on": false, "prompt.on": false }));
    await r.waitFor(() => r.events().some((e: any) => e.type === "settings.applied"));
    const before = r.lines.length;
    r.send({ v: 1, id: "w", type: "walk.list", project });
    r.send({ v: 1, id: "q", type: "error.explain", req: "r", app: "x", text: "boom" });
    await r.waitFor(() => r.events().slice(before).filter((e: any) => e.type === "protocol.error").length >= 2);
    for (const e of r.events().slice(before).filter((e: any) => e.type === "protocol.error")) expect(e.reason).toBe(OFF_LINE);
    await r.close();
  });
});

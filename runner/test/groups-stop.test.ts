// A group switched off ends its own work and nothing else (F20): Flow ends tasks and checks but never Research or Ship,
// Guide ends the questions about the screen but not Prompt help, Voice ends Prompt help and the error explainer but not
// a Show me answer. Run with fakes only: no Claude, no network, no screen, no microphone.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { AssistService, ImageStore } from "../src/lanes.ts";
import { agentModesOf, stopGroupWork } from "../src/groups.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-gstop-${l}-`))); made.push(d); return d; };
const waitFor = async (cond: () => boolean, ms = 3000) => { const end = Date.now() + ms; while (!cond()) { if (Date.now() > end) throw new Error("timed out waiting"); await new Promise((r) => setTimeout(r, 10)); } };
const slow = (text: string): Step => ({ text, costUsd: 0.01, delayMs: 5000 });

function rig(rounds: Step[][], extra: Record<string, unknown> = {}) {
  const events: Event[] = [];
  const engine = new ScriptedEngine(rounds);
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: (e: Event) => events.push(e), now: () => new Date("2026-10-20T10:00:00Z"), ...extra } as never);
  const project = () => { const p = tmp("p"); writeFileSync(join(p, "a.txt"), "x"); return p; };
  const research = (p: string) => runner.handle({ v: 1, id: "q1", type: "research.ask", project: p, agent: "r1", question: "How?", model: "m", budgetUsd: 3 });
  const drive = (p: string) => runner.handle({ v: 1, id: "c1", type: "agent.start", project: p, agent: "d1", mode: "drive", prompt: "Add a thing", model: "m", budgetUsd: 3 });
  return { events, engine, runner, project, research, drive };
}

describe("the catalog says which modes are Flow's", () => {
  test("drive and rescue are Flow's; research and ship are the core's and are in no switched group", () => {
    expect([...agentModesOf("flow")].sort()).toEqual(["drive", "rescue"]);
    expect(agentModesOf("core").has("research")).toBe(true);
    expect(agentModesOf("core").has("ship")).toBe(true);
  });
});

describe("Flow switched off ends Flow's work only", () => {
  test("a running task ends, a running Research carries on", async () => {
    const t = rig([[slow("looking it up")], [slow("working")]]);
    const pr = t.research(t.project());
    await waitFor(() => t.engine.calls.length === 1);
    const pd = t.drive(t.project());
    await waitFor(() => t.engine.calls.length === 2);
    await t.runner.stopGroup("flow");
    expect(t.engine.calls[1].signal.aborted).toBe(true);
    expect(t.engine.calls[0].signal.aborted).toBe(false);
    await pd;
    await t.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "test over" });
    await pr;
  });
  test("a Rescue plan being made ends too (it is Flow's), by the mode it started in", async () => {
    const t = rig([[slow("looking")]]);
    const p = t.runner.handle({ v: 1, id: "r", type: "rescue.diagnose", project: t.project(), agent: "x9", model: "m", budgetUsd: 3 } as never);
    await waitFor(() => t.engine.calls.length === 1);
    await t.runner.stopGroup("flow");
    expect(t.engine.calls[0].signal.aborted).toBe(true);
    await p;
  });
  test("Voice off ends the error explainer and does not end a task", async () => {
    let seen: AbortSignal | undefined;
    const explainer = (_r: unknown, signal: AbortSignal) => { seen = signal; return new Promise<never>(() => {}); };
    const t = rig([[slow("working")]], { explainer });
    const pd = t.drive(t.project());
    await waitFor(() => t.engine.calls.length === 1);
    const pe = t.runner.handle({ v: 1, id: "e", type: "error.explain", req: "e1", app: "Terminal", text: "TypeError: x is not a function" } as never);
    await waitFor(() => !!seen);
    await t.runner.stopGroup("voice");
    expect(t.engine.calls[0].signal.aborted).toBe(false);
    expect(seen!.aborted).toBe(true);
    await pe;
    await t.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "test over" });
    await pd;
  });
  test("Flow off leaves the error explainer alone", async () => {
    let seen: AbortSignal | undefined;
    const explainer = (_r: unknown, signal: AbortSignal) => { seen = signal; return new Promise<never>(() => {}); };
    const t = rig([[]], { explainer });
    const pe = t.runner.handle({ v: 1, id: "e", type: "error.explain", req: "e1", app: "Terminal", text: "TypeError: x is not a function" } as never);
    await waitFor(() => !!seen);
    await t.runner.stopGroup("flow");
    expect(seen!.aborted).toBe(false);
    await t.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "test over" });
    await pe;
  });
});

describe("Guide and Voice cancel only their own questions", () => {
  function assistRig() {
    const signals: Record<string, AbortSignal> = {};
    const images = new ImageStore();
    const svc = new AssistService({
      fast: { run: (_r: unknown, _d: unknown, signal: AbortSignal) => { signals.prompt = signal; return new Promise<never>(() => {}); } } as never,
      vision: { locate: (_r: unknown, signal: AbortSignal) => { signals.locate = signal; return new Promise<never>(() => {}); } } as never,
      images, emit: () => {},
    });
    return { svc, signals, images };
  }
  const ask = async (a: ReturnType<typeof assistRig>) => {
    await a.svc.handle({ v: 1, id: "i", type: "assist.image", ref: "s1", mediaType: "image/jpeg", base64: "/9j/4AAQ", w: 100, h: 100 } as never);
    void a.svc.handle({ v: 1, id: "l", type: "assist.locate", req: "r1", question: "q", image: { ref: "s1", w: 100, h: 100 } } as never);
    void a.svc.handle({ v: 1, id: "p", type: "assist.prompt", req: "r2", text: "make this better", app: "Notes", target: "chat", style: "usual", project: "" } as never);
    await waitFor(() => !!a.signals.locate && !!a.signals.prompt);
  };
  test("Guide off drops the screen question and the screenshot, not Prompt help", async () => {
    const a = assistRig(); await ask(a);
    a.svc.cancel("guide");
    expect(a.signals.locate.aborted).toBe(true); expect(a.images.get("s1")).toBeUndefined();
    expect(a.signals.prompt.aborted).toBe(false);
    a.svc.cancelAll();
  });
  test("Voice off drops Prompt help, not the screen question or its screenshot", async () => {
    const a = assistRig(); await ask(a);
    a.svc.cancel("voice");
    expect(a.signals.prompt.aborted).toBe(true);
    expect(a.signals.locate.aborted).toBe(false); expect(a.images.get("s1")).toBeDefined();
    a.svc.cancelAll();
  });
});

describe("what each switched group stops, as the program asks for it", () => {
  const parts = () => {
    const calls: string[] = [];
    return { calls, parts: {
      runner: { stopGroup: (g: string) => { calls.push(`runner:${g}`); } }, walks: { stopAll: () => { calls.push("walks"); } },
      browser: { stop: () => { calls.push("browser"); } }, assist: { cancel: (g: string) => { calls.push(`assist:${g}`); } },
    } as never };
  };
  test("Flow: tasks and the browser download; never a lesson or the assist questions", () => {
    const p = parts(); stopGroupWork(["flow"], p.parts);
    expect(p.calls.sort()).toEqual(["browser", "runner:flow"]);
  });
  test("Guide: lessons and screen questions; never a task or Prompt help", () => {
    const p = parts(); stopGroupWork(["guide"], p.parts);
    expect(p.calls.sort()).toEqual(["assist:guide", "walks"]);
  });
  test("Voice: Prompt help and the error explainer; never a task, a lesson or a screen question", () => {
    const p = parts(); stopGroupWork(["voice"], p.parts);
    expect(p.calls.sort()).toEqual(["assist:voice", "runner:voice"]);
  });
  test("Files, or nothing, stops nothing here (the shell ends the conversion)", () => {
    const p = parts(); stopGroupWork(["files"], p.parts); stopGroupWork([], p.parts);
    expect(p.calls).toEqual([]);
  });
});

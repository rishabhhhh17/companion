// The plan gate (F25, T17, payments spec sections 2, 2a, 9 and 13): what Free allows, how a free fix is counted, and that
// with payments off nothing at all changes. Temporary folders and in memory databases only; nothing here reaches Dodo or
// any other service, and no real project is touched.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { AgentRunner } from "../src/agent.ts";
import { FreeFixes } from "../src/db.ts";
import { ScriptedEngine, type Engine } from "../src/engine.ts";
import { NAMES } from "../src/names.ts";
import { FIX_GATED, FREE_FIXES_PER_MONTH, NEVER_GATED, PRO_ONLY, PlanGate, USUAL_WATER, asksProLook, isPracticeCopy, monthOf, resetsOnOf, type FixStore } from "../src/plan.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import { TaskLog } from "../src/tasklog.ts";
import { COMMAND_TYPES, parseCommand, parseEvent, type Command } from "../../protocol/index.ts";
import { defOf } from "../../protocol/settings.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-plan-${l}-`))); made.push(d); return d; };
const fixture = (f: string) => readFileSync(new URL(`../../protocol/fixtures/${f}`, import.meta.url), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const OCT_31_LATE = new Date(2026, 9, 31, 23, 59, 59);   // local time: the free fixes come back on the 1st, local time
const NOV_1_EARLY = new Date(2026, 10, 1, 0, 0, 1);
const PROJECT = "/Users/me/site";
const start = (agent = "builder-1", extra: Record<string, unknown> = {}): Command => ({ v: 1, id: `s_${agent}`, type: "agent.start", project: PROJECT, agent, mode: "drive", prompt: "fix the button", model: "m", budgetUsd: 1, ...extra } as Command);
const free = { plan: "free" as const, paymentsOn: true };

/** A gate over an in memory count, with a clock the test moves. */
function gateOf(o: { limit?: number; now?: () => Date; fixes?: () => FixStore } = {}) {
  const said: any[] = [];
  const db = new Database(":memory:");
  const store = new FreeFixes(db);
  const gate = new PlanGate({ fixes: o.fixes ?? (() => store), emit: (e) => said.push(e), now: o.now ?? (() => OCT_31_LATE), ...(o.limit !== undefined ? { limit: o.limit } : {}) });
  /** One fix admitted and proven, as a task of its own. */
  const fix = (agent = "builder-1") => { const ok = gate.admit(start(agent)); if (ok) gate.proven(gate.ticketOf(agent), null); return !!ok; };
  return { gate, said, store, fix, limits: () => said.filter((e) => e.type === "plan.limit"), usage: () => said.filter((e) => e.type === "plan.usage").at(-1) };
}

describe("the shared plan lines (protocol/fixtures/plan-cases.jsonl, also run by the shell's suite)", () => {
  test("every case is read the same way here as in the shell", () => {
    let n = 0;
    for (const c of fixture("plan-cases.jsonl")) {
      const r = c.kind === "command" ? parseCommand(JSON.stringify(c.line)) : parseEvent(JSON.stringify(c.line));
      expect({ case: c.case, ok: r.ok }).toEqual({ case: c.case, ok: c.ok });
      n++;
    }
    expect(n).toBeGreaterThanOrEqual(20);
  });
  test("what the gate says is valid protocol", () => {
    const g = gateOf({ limit: 1 });
    g.gate.setState(free);
    g.fix();
    g.gate.admit(start());
    g.gate.admit({ v: 1, id: "r", type: "recap.ask", project: PROJECT, since: "2026-10-30T00:00:00Z" });
    g.gate.admit({ v: 1, id: "p", type: "ship.preview", project: PROJECT });
    expect(g.said.length).toBeGreaterThanOrEqual(5);
    for (const [i, e] of g.said.entries()) { const r = parseEvent(JSON.stringify({ v: 1, id: `g${i}`, ...e })); expect(r.ok, JSON.stringify(e)).toBe(true); }
  });
});

describe("the command walk (spec section 2a)", () => {
  const lists = { fix: FIX_GATED as readonly string[], pro: PRO_ONLY as readonly string[], never: NEVER_GATED as readonly string[] };
  test("every command type is in exactly one list, and every listed name is a command", () => {
    for (const t of COMMAND_TYPES) {
      const where = Object.entries(lists).filter(([, l]) => l.includes(t)).map(([k]) => k);
      expect({ t, where }).toEqual({ t, where: [expect.any(String)] });
    }
    for (const t of [...lists.fix, ...lists.pro, ...lists.never]) expect(COMMAND_TYPES).toContain(t);
    expect(new Set([...lists.fix, ...lists.pro, ...lists.never]).size).toBe(COMMAND_TYPES.length);
  });
  test("a command type the lists do not know fails the walk", () => {
    const listed = (t: string) => Object.values(lists).filter((l) => l.includes(t)).length === 1;
    expect(listed("future.thing")).toBe(false);
    expect(COMMAND_TYPES.every(listed)).toBe(true);
  });
  test("stopping, Undo, Bring back, approvals and every check are in the never gated list", () => {
    for (const t of ["agent.interrupt", "agent.interruptAll", "drive.pause", "drive.resume", "checkpoint.restore", "checkpoint.putBack", "bisect.undo", "ship.rollback", "approval.resolve", "browser.check", "browser.install", "doctor.check", "problem.find", "secondlook.check", "where.was.i", "plan.state"]) {
      expect(lists.never).toContain(t);
    }
  });

  /** One of each command, as a page or the shell would send it. */
  const sample = (t: string): Command => {
    const fromFixture = t === "settings.apply" ? undefined : fixture("commands.jsonl").find((c) => c.type === t);
    if (fromFixture) return fromFixture as Command;
    const base: Record<string, unknown> = { v: 1, id: `w_${t}`, type: t, project: PROJECT, agent: "builder-1" };
    if (t === "settings.apply") base.values = { "look.water": "lagoon", "look.theme": "paper" };
    if (t === "plan.state") Object.assign(base, free);
    return base as Command;
  };

  test("at the limit every gated command refuses and every never gated one is untouched", () => {
    const g = gateOf({ limit: 1 });
    g.gate.setState(free);
    expect(g.fix("other")).toBe(true);
    for (const t of COMMAND_TYPES) {
      const cmd = sample(t);
      const before = g.limits().length;
      const out = g.gate.admit(cmd);
      if (lists.never.includes(t)) { expect({ t, same: out === cmd }).toEqual({ t, same: true }); expect(g.limits().length).toBe(before); continue; }
      if (t === "settings.apply") { expect((out as any).values).toEqual({ "look.theme": "paper" }); continue; }   // only the colour is held back
      if (t === "rescue.diagnose") { expect(out).toBe(cmd); continue; }   // Check my project stays free; its plan is gated at drive.approve
      if (t === "agent.start" && (cmd as any).mode === "research") { expect(out).toBe(cmd); continue; }
      expect({ t, refused: out === null }).toEqual({ t, refused: true });
      expect(g.limits().length).toBe(before + 1);
    }
    expect(g.limits().map((e) => e.reason)).toEqual(expect.arrayContaining(["fixes", "ship", "recaps"]));
  });
  test("on Pro, and during a trial, nothing is gated even past the free count", () => {
    for (const state of [{ plan: "pro" as const, paymentsOn: true }, { plan: "trial" as const, paymentsOn: true, trialEndsAt: "2026-11-10T00:00:00Z" }]) {
      const g = gateOf({ limit: 1 });
      g.gate.setState(free);
      g.fix("other");
      g.gate.setState(state);
      for (const t of COMMAND_TYPES) { const cmd = sample(t); expect({ t, same: g.gate.admit(cmd) === cmd }).toEqual({ t, same: true }); }
      expect(g.limits()).toEqual([]);
    }
  });
});

describe("payments off: exactly as today", () => {
  test("before any plan.state, nothing is gated, counted, read or said", () => {
    const g = gateOf({ limit: 0, fixes: () => { throw new Error("the count must not be opened with payments off"); } });
    for (const t of COMMAND_TYPES) { const c = { v: 1, id: "x", type: t, project: PROJECT, agent: "a", mode: "ship", values: { "look.water": "berry" } } as unknown as Command; expect(g.gate.admit(c)).toBe(c); }
    g.gate.proven(g.gate.ticketOf("a"), 1);
    expect(g.said).toEqual([]);
    expect(g.gate.planNow()).toBeNull();
  });
  test("a plan.state with payments off gates nothing, whatever plan it names, and says nothing", () => {
    const g = gateOf({ limit: 0, fixes: () => { throw new Error("the count must not be opened with payments off"); } });
    g.gate.setState({ plan: "free", paymentsOn: false });
    expect(g.gate.admit(start())).not.toBeNull();
    expect(g.gate.admit({ v: 1, id: "p", type: "ship.live", project: PROJECT, url: "https://x.example", confirm: true })).not.toBeNull();
    g.gate.proven(g.gate.ticketOf("builder-1"), 1);
    expect(g.said).toEqual([]);
  });
  test("switching payments off again lifts the gate at once", () => {
    const g = gateOf({ limit: 1 });
    g.gate.setState(free);
    g.fix();
    expect(g.gate.admit(start())).toBeNull();
    g.gate.setState({ plan: "free", paymentsOn: false });
    expect(g.gate.admit(start())).not.toBeNull();
  });
  test("the runner program with no plan.state never opens the count", () => {
    // main.ts makes the count's table only through FreeFixes, which makes it on first use (checked again end to end below).
    const src = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
    expect(src).toContain("fixes: () => new FreeFixes(taskLog.database)");
    expect(src.indexOf('if (cmd.type === "plan.state") { plan.setState(cmd); return; }')).toBeGreaterThan(0);
  });
});

describe("what counts as one free fix", () => {
  test("only a proven fix counts, once, and the count is the month's", () => {
    const g = gateOf();
    g.gate.setState(free);
    expect(g.usage()).toEqual({ type: "plan.usage", used: 0, limit: FREE_FIXES_PER_MONTH, resetsOn: "2026-11-01", everUsed: false });
    expect(g.gate.admit(start())).not.toBeNull();
    const ticket = g.gate.ticketOf("builder-1");
    expect(g.store.count("2026-10")).toBe(0);             // admitted is not counted
    g.gate.proven(ticket, 7);
    g.gate.proven(ticket, 8);                              // a follow up or a later step of the same fix
    expect(g.store.count("2026-10")).toBe(1);
    expect(g.usage()).toMatchObject({ used: 1, everUsed: true });
  });
  test("fixes started before any is proven all count toward the limit", () => {
    const g = gateOf({ limit: 3 });
    g.gate.setState(free);
    g.fix("a"); g.fix("b");                                // 2 of 3 proven
    expect(g.gate.admit(start("c"))).not.toBeNull();       // the third is admitted, not yet proven
    expect(g.gate.admit(start("d", { project: "/Users/me/other" }))).toBeNull();   // another project, same moment: refused
    expect(g.limits().at(-1)).toMatchObject({ reason: "fixes", command: "agent.start", agent: "d" });
    g.gate.proven(g.gate.ticketOf("c"), 1);
    expect(g.store.count("2026-10")).toBe(3);
    expect(g.gate.admit(start("d", { project: "/Users/me/other" }))).toBeNull();   // proven now counts, still at the limit
  });
  test("a fix that ends unproven gives its place back, and so does starting another task on the same agent", () => {
    const g = gateOf({ limit: 1 });
    g.gate.setState(free);
    expect(g.gate.admit(start("a"))).not.toBeNull();
    expect(g.gate.admit(start("b"))).toBeNull();           // a is still in flight
    g.gate.ended(g.gate.ticketOf("a"));                    // it stopped, failed or ended unproven
    expect(g.gate.admit(start("b"))).not.toBeNull();
    expect(g.gate.admit(start("b"))).not.toBeNull();       // b's own earlier start, replaced by this one, holds no place of its own
    expect(g.gate.admit(start("c"))).toBeNull();
    g.gate.ended(g.gate.ticketOf("b"));
    expect(g.gate.admit(start("c"))).not.toBeNull();
  });
  test("a follow up of an admitted fix does not take a second place", () => {
    const g = gateOf({ limit: 2 });
    g.gate.setState(free);
    expect(g.gate.admit(start("a"))).not.toBeNull();
    const send = { v: 1, id: "f", type: "agent.send", agent: "a", project: PROJECT, text: "again" } as Command;
    expect(g.gate.admit(send)).toBe(send);
    expect(g.gate.admit(start("b"))).not.toBeNull();       // 1 in flight + 1 new = 2, not 3
    expect(g.gate.admit(start("c"))).toBeNull();
  });
  test("a follow up or Try again on an admitted fix is free and counts with it", () => {
    const g = gateOf({ limit: 1 });
    g.gate.setState(free);
    g.fix();
    const send = { v: 1, id: "f", type: "agent.send", agent: "builder-1", project: PROJECT, text: "still grey" } as Command;
    expect(g.gate.admit(send)).toBe(send);                 // at the limit, still free: it is the same fix
    g.gate.proven(g.gate.ticketOf("builder-1"), 2);
    expect(g.store.count("2026-10")).toBe(1);
    // An agent with no admitted fix is gated like a start.
    expect(g.gate.admit({ ...send, agent: "builder-2" } as Command)).toBeNull();
  });
  test("a Drive plan counts once, and approving the plan the gate admitted is free", () => {
    const g = gateOf({ limit: 1 });
    g.gate.setState(free);
    const plan = { v: 1, id: "dp", type: "drive.plan", project: PROJECT, agent: "builder-1", goal: "add a contact form", model: "m", budgetUsd: 3 } as Command;
    const approve = { v: 1, id: "da", type: "drive.approve", agent: "builder-1", steps: ["one", "two"] } as Command;
    expect(g.gate.admit(plan)).toBe(plan);
    expect(g.gate.admit(approve)).toBe(approve);
    for (const task of [1, 2]) g.gate.proven(g.gate.ticketOf("builder-1"), task);   // each step is proven
    expect(g.store.count("2026-10")).toBe(1);
    expect(g.gate.admit(plan)).toBeNull();                 // a new plan is a new fix
  });
  test("Check my project (Rescue) is free; its plan is gated where the diagnosis turns into edits", () => {
    const g = gateOf({ limit: 1 });
    g.gate.setState(free);
    g.fix();
    const diag = { v: 1, id: "rd", type: "rescue.diagnose", project: PROJECT, agent: "builder-1", model: "m", budgetUsd: 1 } as Command;
    expect(g.gate.admit(diag)).toBe(diag);
    expect(g.gate.admit({ v: 1, id: "da", type: "drive.approve", agent: "builder-1", steps: ["fix it"] } as Command)).toBeNull();
    expect(g.limits().at(-1)).toMatchObject({ reason: "fixes", command: "drive.approve", agent: "builder-1", resetsOn: "2026-11-01" });
  });
  test("practice copies never count, and a practice named on an ordinary folder is an ordinary fix", () => {
    const home = tmp("home");
    const copy = join(home, `${NAMES.practiceCopyBase} signup page`); mkdirSync(copy);
    const older = join(home, `${NAMES.earlierPracticeCopyBases[0]} signup page 2`); mkdirSync(older);
    expect(isPracticeCopy("signup-page", copy)).toBe(true);
    expect(isPracticeCopy("signup-page", older)).toBe(true);
    expect(isPracticeCopy("signup-page", join(home, "my-site"))).toBe(false);
    expect(isPracticeCopy(undefined, copy)).toBe(false);
    const g = gateOf({ limit: 1 });
    g.gate.setState(free);
    for (let i = 0; i < 3; i++) { expect(g.gate.admit(start("builder-1", { project: copy, practice: "signup-page" }))).not.toBeNull(); g.gate.proven(g.gate.ticketOf("builder-1"), i); }
    expect(g.store.count("2026-10")).toBe(0);
    expect(g.gate.admit(start("builder-1", { practice: "signup-page" }))).not.toBeNull();   // /Users/me/site is not a copy
    g.gate.proven(g.gate.ticketOf("builder-1"), 9);
    expect(g.store.count("2026-10")).toBe(1);
  });
  test("a practice lesson's file check (ship.check on a practice copy) works on Free; Ship on a real folder stays Pro", () => {
    const home = tmp("home");
    const copy = join(home, `${NAMES.practiceCopyBase} open table`); mkdirSync(copy);
    const g = gateOf({ limit: 1 });
    g.gate.setState(free);
    const check = (project: string) => ({ v: 1, id: "sc", type: "ship.check", project } as Command);
    expect(g.gate.admit(check(copy))).not.toBeNull();
    expect(g.gate.admit(check(join(home, "my-site")))).toBeNull();
    expect(g.limits().at(-1)).toMatchObject({ reason: "ship", command: "ship.check" });
    // Only the check: putting a practice copy online is still Ship.
    expect(g.gate.admit({ v: 1, id: "sl", type: "ship.live", project: copy } as unknown as Command)).toBeNull();
  });
  test("Research never counts and never ends up holding a fix's ticket", () => {
    const g = gateOf({ limit: 1 });
    g.gate.setState(free);
    expect(g.gate.admit(start("builder-1"))).not.toBeNull();
    expect(g.gate.admit(start("builder-1", { mode: "research" }))).not.toBeNull();
    g.gate.proven(g.gate.ticketOf("builder-1"), 1);
    expect(g.store.count("2026-10")).toBe(0);
  });
  test("the month starts again on the 1st, local time", () => {
    let now = new Date(2026, 9, 1, 0, 0, 0);
    const g = gateOf({ limit: 2, now: () => now });
    g.gate.setState(free);
    expect(g.fix()).toBe(true);
    now = new Date(2026, 9, 15, 12, 0, 0);
    expect(g.fix()).toBe(true);
    now = OCT_31_LATE;
    expect(g.fix()).toBe(false);
    expect(g.limits().at(-1)).toMatchObject({ reason: "fixes", resetsOn: "2026-11-01" });
    now = NOV_1_EARLY;
    expect(g.gate.admit(start())).not.toBeNull();
    expect(g.gate.usage()).toEqual({ used: 0, limit: 2, resetsOn: "2026-12-01", everUsed: true });
    expect(monthOf(new Date(2026, 11, 31, 23, 59))).toBe("2026-12");
    expect(resetsOnOf(new Date(2026, 11, 31, 23, 59))).toBe("2027-01-01");
    expect(monthOf(new Date(2027, 0, 1, 0, 0))).toBe("2027-01");
  });
  test("a trial ends by itself at its end time, with no timer", () => {
    let now = new Date("2026-11-14T09:29:59Z");
    const g = gateOf({ limit: 0, now: () => now });
    g.gate.setState({ plan: "trial", paymentsOn: true, trialEndsAt: "2026-11-14T09:30:00Z" });
    expect(g.gate.planNow()).toBe("trial");
    expect(g.gate.admit(start())).not.toBeNull();
    now = new Date("2026-11-14T09:30:00Z");
    expect(g.gate.planNow()).toBe("free");
    expect(g.gate.admit(start("builder-2"))).toBeNull();
  });
});

describe("looks: only the extra water colours are Pro", () => {
  const apply = (values: Record<string, unknown>) => ({ v: 1, id: "sa", type: "settings.apply", values } as Command);
  test("the usual colour comes from the settings registry", () => {
    expect(USUAL_WATER).toBe(String(defOf("look.water")!.default));
    expect(asksProLook({ "look.water": USUAL_WATER })).toBe(false);
    for (const c of (defOf("look.water") as any).options.filter((o: string) => o !== USUAL_WATER)) expect(asksProLook({ "look.water": c })).toBe(true);
  });
  test("on Free a non usual colour is held back and nothing else is", () => {
    const g = gateOf();
    g.gate.setState(free);
    const keep = { "look.theme": "paper", "look.size": "large", "character.lively": "lively", "display.textSize": "large", "character.motion": "less" };
    expect((g.gate.admit(apply({ ...keep, "look.water": "berry" })) as any).values).toEqual(keep);
    const usual = apply({ ...keep, "look.water": USUAL_WATER });
    expect(g.gate.admit(usual)).toBe(usual);
    const others = apply(keep);
    expect(g.gate.admit(others)).toBe(others);
    expect(g.limits()).toEqual([]);   // the shell sent it, nobody tapped: the page shows the Pro tag
  });
  test("theme, size, liveliness, text size and motion are never gated on any plan", () => {
    for (const s of [free, { plan: "pro" as const, paymentsOn: true }, { plan: "free" as const, paymentsOn: false }]) {
      const g = gateOf();
      g.gate.setState(s);
      const c = apply({ "look.theme": "paper", "look.size": "small", "character.lively": "still", "display.textSize": "large", "character.motion": "less" });
      expect(g.gate.admit(c)).toBe(c);
    }
  });
});

// ---------- with the real task runner: real snapshots, real Undo, a pretend checker ----------

const step = (status: string) => ({ rung: "browser", label: "browser", status: status as "passed", detail: "", ms: 1 });
const pass: LadderResult = { verdict: "passed", steps: [step("passed")] as never };
/** Each task changes one new file, so each has its own fix to undo and bring back. */
function writer(delayMs = 0): Engine {
  let n = 0;
  return {
    async *start(opts) {
      n++;
      if (delayMs) await new Promise<void>((res) => { const t = setTimeout(res, delayMs); opts.signal.addEventListener("abort", () => { clearTimeout(t); res(); }, { once: true }); });
      if (opts.signal.aborted) return;
      yield { tool: { name: "Bash", input: { command: `echo fix${n} > fix${n}.txt` } }, costUsd: 0.01, sessionId: "s" };
    },
  };
}
function world(o: { limit?: number; ladder?: (ctx: any) => Promise<LadderResult>; engine?: Engine; now?: () => Date } = {}) {
  const project = tmp("p");
  writeFileSync(join(project, "a.txt"), "original");
  const events: any[] = [];
  const log = new TaskLog(":memory:");
  const store = new FreeFixes(log.database);
  const gate = new PlanGate({ fixes: () => store, emit: (e) => events.push(e), now: o.now ?? (() => OCT_31_LATE), limit: o.limit ?? FREE_FIXES_PER_MONTH });
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: o.engine ?? writer(), log, emit: (e) => events.push(e), proof: async (ctx) => (o.ladder ?? (async () => pass))(ctx), fixes: gate });
  // What main.ts dispatch does: the gate first, then the runner.
  const send = async (cmd: Command) => { const a = gate.admit(cmd); if (a) await runner.handle(a); return a !== null; };
  const fixIt = (n: number) => send({ v: 1, id: `fix${n}`, type: "agent.start", project, agent: "builder-1", mode: "drive", prompt: `fix ${n}`, model: "m", budgetUsd: 1 } as Command);
  const of = (t: string) => events.filter((e) => e.type === t);
  const used = () => store.count(monthOf(OCT_31_LATE));
  return { project, events, gate, runner, send, fixIt, of, used, log };
}

describe("counting with real tasks", () => {
  test("a proven fix counts; a failed, unproven, partly checked or stopped one does not", async () => {
    for (const [verdict, counts] of [["passed", 1], ["failed", 0], ["nothing_to_check", 0], ["passed_with_gaps", 0]] as const) {
      // One round only, as the proof tests do: a failed check then gets nothing new from Claude and ends, never waits.
      const w = world({ engine: new ScriptedEngine([{ tool: { name: "Bash", input: { command: "echo hi > new.txt" } }, costUsd: 0.01 }]), ladder: async () => ({ verdict, steps: [step(verdict === "failed" ? "failed" : "passed")] as never, ...(verdict === "failed" ? { failedAt: step("failed") as never } : {}) }) });
      w.gate.setState(free);
      expect(await w.fixIt(1)).toBe(true);
      expect({ verdict, used: w.used() }).toEqual({ verdict, used: counts });
    }
    const w = world({ engine: writer(60_000) });
    w.gate.setState(free);
    const running = w.fixIt(1);
    while (!w.of("agent.state").length) await new Promise((r) => setTimeout(r, 5));
    await w.send({ v: 1, id: "stop", type: "agent.interrupt", agent: "builder-1" } as Command);
    await running;
    expect(w.used()).toBe(0);
  });
  test("a follow up on the same fix counts once", async () => {
    const w = world();
    w.gate.setState(free);
    await w.fixIt(1);
    expect(w.of("receipt").at(-1).proof).toBe("passed");
    expect(await w.send({ v: 1, id: "f", type: "agent.send", agent: "builder-1", project: w.project, text: "make it blue too" } as Command)).toBe(true);
    expect(w.of("receipt").length).toBe(2);
    expect(w.of("receipt").at(-1).proof).toBe("passed");
    expect(w.used()).toBe(1);
    expect(w.of("plan.usage").at(-1)).toMatchObject({ used: 1, limit: FREE_FIXES_PER_MONTH });
  });
  test("practice fixes in a practice copy never count", async () => {
    const w = world();
    const copy = join(tmp("home"), `${NAMES.practiceCopyBase} signup page`); mkdirSync(copy); writeFileSync(join(copy, "a.txt"), "x");
    w.gate.setState(free);
    await w.send({ v: 1, id: "pr", type: "agent.start", project: copy, agent: "builder-1", mode: "drive", prompt: "fix", model: "m", budgetUsd: 1, practice: "signup-page" } as Command);
    expect(w.of("receipt").at(-1).proof).toBe("passed");
    expect(w.used()).toBe(0);
  });
});

describe("the Free loop: fix, Undo, new fix, Bring back (spec sections 2 and 13)", () => {
  test("Undo gives nothing back, Bring back never counts again, and both still work at the limit", async () => {
    const w = world({ limit: 2 });
    w.gate.setState(free);
    const undo = async (checkpoint: string) => { const before = w.of("checkpoint.restored").length; expect(await w.send({ v: 1, id: `u${checkpoint}`, type: "checkpoint.restore", project: w.project, checkpoint } as Command)).toBe(true); const r = w.of("checkpoint.restored"); expect(r.length).toBe(before + 1); return r.at(-1); };

    expect(await w.fixIt(1)).toBe(true);
    const a = w.of("receipt").at(-1).checkpoint;
    expect(w.used()).toBe(1);
    const undoneA = await undo(a);                       // Undo the first fix: the count stays
    expect(w.used()).toBe(1);
    expect(await w.fixIt(2)).toBe(true);
    const b = w.of("receipt").at(-1).checkpoint;
    expect(w.used()).toBe(2);
    const undoneB = await undo(b);
    expect(w.used()).toBe(2);

    // At the limit: a new Fix it is not started, and nothing in the project was touched for it.
    const snapshots = w.of("checkpoint.created").length;
    expect(await w.fixIt(3)).toBe(false);
    expect(w.of("plan.limit").at(-1)).toMatchObject({ reason: "fixes", command: "agent.start", resetsOn: "2026-11-01" });
    expect(w.of("checkpoint.created").length).toBe(snapshots);

    // Bring the fix back still works at the limit, and does not count again.
    await undo(undoneB.safety);
    expect(readFileSync(join(w.project, "fix2.txt"), "utf8").trim()).toBe("fix2");
    expect(w.used()).toBe(2);
    expect(await w.send({ v: 1, id: "pb", type: "checkpoint.putBack", project: w.project, checkpoint: undoneA.safety, confirm: true } as Command)).toBe(true);
    expect(w.of("checkpoint.putBackDone").length).toBe(1);
    expect(w.used()).toBe(2);
    // Undo again at the limit: still works.
    await undo(b);
    expect(w.used()).toBe(2);
    // And still no new fix: the loop kept no more than the limit.
    expect(await w.fixIt(4)).toBe(false);
    expect(w.used()).toBeLessThanOrEqual(2);
    // Stop and Stop everything are never gated either.
    expect(await w.send({ v: 1, id: "st", type: "agent.interrupt", agent: "builder-1" } as Command)).toBe(true);
    expect(await w.send({ v: 1, id: "sa", type: "agent.interruptAll", reason: "test" } as Command)).toBe(true);
  });
});

describe("a plan change never stops a running task", () => {
  test("Pro ends mid task (trial over, key turned off, a check failed): the task finishes as it would have", async () => {
    let g: PlanGate | null = null;
    const w = world({ limit: 0, ladder: async () => { g!.setState(free); g!.setState({ plan: "trial", paymentsOn: true, trialEndsAt: "2020-01-01T00:00:00Z" }); return pass; } });
    g = w.gate;
    w.gate.setState({ plan: "pro", paymentsOn: true });
    expect(await w.fixIt(1)).toBe(true);
    expect(w.of("receipt").at(-1)).toMatchObject({ proof: "passed", ended: "done" });
    expect(w.of("agent.state").at(-1).state).toBe("done");
    expect(w.of("plan.limit")).toEqual([]);
    // The next one follows the new plan.
    expect(await w.fixIt(2)).toBe(false);
  });
  test("payments switched on mid task: it finishes, and is not counted after the fact", async () => {
    let g: PlanGate | null = null;
    const w = world({ ladder: async () => { g!.setState(free); return pass; } });
    g = w.gate;
    expect(await w.fixIt(1)).toBe(true);
    expect(w.of("receipt").at(-1)).toMatchObject({ proof: "passed", ended: "done" });
    expect(w.used()).toBe(0);
  });
  test("the gate holds no task and can stop none", () => {
    const src = readFileSync(new URL("../src/plan.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/\.abort\(|AgentRunner|setTimeout|setInterval|\.handle\(/);
  });
});

describe("the runner program end to end", () => {
  function launch(data: string) {
    const proc = Bun.spawn(["bun", join(import.meta.dir, "../src/main.ts")], { stdin: "pipe", stdout: "pipe", stderr: "pipe", env: { ...process.env, COMPANION_DATA: data, COMPANION_ENGINE: "scripted", COMPANION_SCRIPT: "[]" } });
    const lines: string[] = [];
    let buf = "";
    const done = (async () => { const dec = new TextDecoder(); for await (const c of proc.stdout) { buf += dec.decode(c, { stream: true }); let i; while ((i = buf.indexOf("\n")) >= 0) { lines.push(buf.slice(0, i)); buf = buf.slice(i + 1); } } })();
    const send = (o: unknown) => { proc.stdin.write(JSON.stringify(o) + "\n"); proc.stdin.flush(); };
    const events = () => lines.map((l) => JSON.parse(l));
    const waitFor = async (cond: () => boolean, ms = 10_000) => { const end = Date.now() + ms; while (!cond()) { if (Date.now() > end) throw new Error("timed out; saw: " + lines.join(" | ").slice(0, 800)); await new Promise((r) => setTimeout(r, 20)); } };
    const close = async () => { proc.stdin.end(); await proc.exited; await done; };
    return { send, events, lines, waitFor, close };
  }
  const recap = (project: string, id: string) => ({ v: 1, id, type: "recap.ask", project, since: "2026-01-01T00:00:00Z" });

  test("payments off by default; on, Free is gated and Undo is not; off again, everything works", async () => {
    const data = tmp("data"), project = tmp("proj");
    // This month's free fixes are already used.
    const seed = new Database(join(data, "tasks.db"));
    const seeded = new FreeFixes(seed);
    for (let i = 0; i < FREE_FIXES_PER_MONTH; i++) seeded.record(`seed${i}`, i, monthOf(new Date()), new Date().toISOString());
    seed.close();
    const r = launch(data);
    await r.waitFor(() => r.events().some((e) => e.type === "runner.hello"));

    // No plan.state yet: nothing is gated and nothing is said about a plan.
    r.send(recap(project, "r1"));
    await r.waitFor(() => r.events().some((e) => e.type === "recap.ready"));
    expect(r.events().some((e) => e.type.startsWith("plan."))).toBe(false);

    // Payments on, Free: the count is said, a Pro feature and a new fix are not started.
    r.send({ v: 1, id: "ps1", type: "plan.state", plan: "free", paymentsOn: true });
    await r.waitFor(() => r.events().some((e) => e.type === "plan.usage"));
    expect(r.events().find((e) => e.type === "plan.usage")).toMatchObject({ used: FREE_FIXES_PER_MONTH, limit: FREE_FIXES_PER_MONTH, everUsed: true });
    r.send(recap(project, "r2"));
    await r.waitFor(() => r.events().some((e) => e.type === "plan.limit" && e.reason === "recaps"));
    r.send({ v: 1, id: "s1", type: "agent.start", project, agent: "a1", mode: "drive", prompt: "fix it", model: "m", budgetUsd: 1 });
    await r.waitFor(() => r.events().some((e) => e.type === "plan.limit" && e.reason === "fixes"));
    expect(r.events().some((e) => e.type === "checkpoint.created")).toBe(false);
    // Undo is never gated: it answers for itself (there is no such undo point here).
    r.send({ v: 1, id: "u1", type: "checkpoint.restore", project, checkpoint: "cp_0099" });
    await r.waitFor(() => r.events().some((e) => e.type === "protocol.error" && /undo point/.test(e.reason)));
    for (const e of r.events()) expect(parseEvent(JSON.stringify(e)).ok, JSON.stringify(e)).toBe(true);

    // Payments off again: back to everything, and nothing more is said about a plan.
    const said = r.events().filter((e) => e.type.startsWith("plan.")).length;
    r.send({ v: 1, id: "ps2", type: "plan.state", plan: "free", paymentsOn: false });
    r.send(recap(project, "r3"));
    await r.waitFor(() => r.events().filter((e) => e.type === "recap.ready").length === 2);
    expect(r.events().filter((e) => e.type.startsWith("plan.")).length).toBe(said);
    await r.close();
  }, 30_000);

  test("with payments off the count's table is never even made", async () => {
    const data = tmp("data"), project = tmp("proj");
    const r = launch(data);
    await r.waitFor(() => r.events().some((e) => e.type === "runner.hello"));
    r.send({ v: 1, id: "ps", type: "plan.state", plan: "pro", paymentsOn: false });
    r.send(recap(project, "r1"));
    await r.waitFor(() => r.events().some((e) => e.type === "recap.ready"));
    await r.close();
    const db = new Database(join(data, "tasks.db"));
    expect(db.query("SELECT name FROM sqlite_master WHERE name = 'free_fixes'").all()).toEqual([]);
    db.close();
  }, 30_000);
});

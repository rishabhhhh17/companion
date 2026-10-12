// Runs agent tasks: snapshot first, judge every tool call, ask the user when needed,
// stop at the spending limit, and finish with a receipt. The engine (real Claude or a
// scripted stand in) only supplies turns; everything safe happens here.

import { runCommand, shq } from "./proof/exec.ts";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Command, Event } from "../../protocol/index.ts";
import { PROTOCOL_VERSION } from "../../protocol/index.ts";
import { parseDiagnosis, rescuePrompt } from "./rescue.ts";
import { isSafeUrl, noteFileName, notesMarkdown, parseResearch, researchPrompt } from "./research.ts";
import { ProjectWatcher } from "./watcher.ts";
import { differentPrompt, pausedPrompt, estimateUsd, failureSignature, MAX_STEPS, parsePlan, planPrompt, READ_ONLY_TOOLS, shortenPrompt, STUCK_OPTIONS, stepPrompt } from "./drive.ts";
import { CheckpointStore } from "./checkpoints.ts";
import { EngineStop, type Engine, type ToolResult, type ToolUse } from "./engine.ts";
import { clip, label as makeLabel, redact } from "./redact.ts";
import { diffText, needsReview, parseReview, reviewPrompt, type Review } from "./proof/review.ts";
import { runGates, type ProofRecord } from "./ship/gates.ts";
import { Ledger } from "./ledger.ts";
import { MemoryStore, type Scope } from "./memory/store.ts";
import { askSignals, projectFacts } from "./memory/learn.ts";
import { removeSection, syncAgentsFiles } from "./memory/agentsmd.ts";
import { explainRequest, parseExplain } from "./explain.ts";
import { recapLines } from "./recap.ts";
import { addShipReceipt, NOT_SIGNED_IN, readShips, type Deployer } from "./ship/deploy.ts";
import { browserCheck } from "./proof/browser.ts";
import { applyRules, loadRules } from "./rules.ts";
import { buildChildEnv, evaluate, type Verdict } from "./safety.ts";
import { runLadder, type LadderResult, type Step, type StepUpdate } from "./proof/ladder.ts";
import { captureBefore, sweepWork } from "./proof/before.ts";
import { makeShareCard, projectTitle } from "./ship/card.ts";
import { aboutLine, inspectProject } from "./proof/intake.ts";
import { cloneTarget } from "./proof/clone.ts";
import { diagramContext, diagramRequest, parseDiagram } from "./diagram.ts";
import { detectProject } from "./proof/detect.ts";
import { drawReceipt } from "./proof/picture.ts";
import type { PageShot } from "./proof/browser.ts";
import type { TaskLog } from "./tasklog.ts";

export type ToolExecutor = (call: ToolUse, ctx: { project: string }) => Promise<ToolResult>;

// What the checker is given: the project, the two snapshots to compare, a way to report each rung,
// and the stop signal. Tests pass a stand in; the default runs the real ladder.
export type ProofContext = { project: string; store: CheckpointStore; beforeId: string; afterId: string; onStep: (u: StepUpdate) => void; signal: AbortSignal; review?: () => Promise<Review | null> };
export type ProofRunner = (ctx: ProofContext) => Promise<LadderResult>;

export type RunnerOptions = {
  shadowRoot: string;
  engine: Engine;
  log: TaskLog;
  emit: (e: Event) => void;
  executor?: ToolExecutor;
  proof?: ProofRunner;
  ledger?: Ledger;
  dailyCeilingUsd?: number;
  // Proof rung 7: a second model that reads risky changes. Off unless one is given.
  reviewer?: Engine;
  reviewModel?: string;
  approvalTimeoutMs?: number;
  now?: () => Date;
  // Where the person's own profile and memory settings live. Without it, memory is off.
  memoryDir?: string;
  // Writes the "why" bullets after a task. Without it, Explain is off.
  // Putting a preview and then the live site up. Without it, shipping beyond the safety check is off.
  deployer?: Deployer;
  browser?: typeof browserCheck;
  // The visual receipt: after a passing check, the page before and after, with the change circled. Without it, off.
  pictures?: { workDir: string; saveDir: string; before?: typeof captureBefore; draw?: typeof drawReceipt; card?: typeof makeShareCard };
  explainer?: (req: { text: string; system: string }, signal: AbortSignal) => Promise<{ text: string; costUsd: number }>;
};

// Receipt pictures are kept for the timeline, newest first, so they never fill the disk.
const KEEP_PICTURES = 200;
function pruneOldest(dir: string, keep: number) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".jpg")).map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  for (const x of files.slice(keep)) rmSync(join(dir, x.f), { force: true });
}

type Session = { agent: string; abort: AbortController; pending: Map<string, (allow: boolean) => void> };
type StartCmd = Extract<Command, { type: "agent.start" }>;

// The default executor really does the work: file edits through the file system, commands
// through a shell with the account switching variables removed.
export const defaultExecutor: ToolExecutor = async (call, { project }) => {
  const i = call.input;
  try {
    if (call.name === "Write") {
      const f = resolve(project, String(i.file_path));
      mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, String(i.content ?? ""));
      return { ok: true, output: `wrote ${String(i.file_path)}` };
    }
    if (call.name === "Edit") {
      const f = resolve(project, String(i.file_path));
      const text = readFileSync(f, "utf8");
      const from = String(i.old_string ?? "");
      if (!text.includes(from)) return { ok: false, output: "the text to replace was not found" };
      writeFileSync(f, text.replace(from, String(i.new_string ?? "")));
      return { ok: true, output: `edited ${String(i.file_path)}` };
    }
    if (call.name === "Bash") {
      const r = await runCommand(String(i.command), { cwd: project, timeoutMs: 120_000, });
      const code = r.code;
      return { ok: code === 0, output: (r.stdout + r.stderr).slice(0, 20_000) };
    }
    return { ok: true, output: "" };
  } catch (e) {
    return { ok: false, output: String((e as Error).message) };
  }
};

const summary = (c: ToolUse): string => {
  if (c.name === "Bash") return `Running: ${clip(redact(String(c.input.command)), 200)}`;
  if (c.input.file_path) return `${c.name}: ${String(c.input.file_path)}`;
  return c.name;
};

type PendingPlan = { project: string; model: string; budgetUsd: number; usd: number; sessionId?: string; offTheRecord?: boolean; goal?: string };

export class AgentRunner {
  private sessions = new Map<string, Session>();
  private plans = new Map<string, PendingPlan>();
  private driving = new Set<string>();
  private installing = new Map<string, AbortController>();   // package installs and clones the person started, so Stop everything ends them
  private picturing = new Set<AbortController>();   // visual receipts being drawn, so Stop everything can end them
  private backgroundJobs = new Set<Promise<void>>();   // pictures and cards; the runner waits for them before it exits
  private projectTurn = new Map<string, Promise<unknown>>();   // a proof check and a picture never run a server at the same time
  private finding = new Map<string, { abort: AbortController; agent: string }>();   // point at the problem: one check per project at a time
  private driveStop = new Set<string>();
  private choices = new Map<string, (c: string) => void>();
  private watchers = new Map<string, ProjectWatcher>();
  private pauseReq = new Map<string, { reason: string; path?: string }>();
  private resumers = new Map<string, (c: string) => void>();
  private resumeEarly = new Set<string>();
  // The last proof result for each project, and which saved version it was for. Shipping needs a pass on the exact version.
  private rulesSaid = new Set<string>();
  private lastProof = new Map<string, { verdict: string; snapshot: string }>();   // "Carry on" pressed before the loop is waiting for it

  // Take the wheel: stop the current step now; the plan waits for the person to resume.
  private requestPause(agent: string, reason: string, path?: string) {
    if (!this.watchers.has(agent) || this.pauseReq.has(agent) || this.driveStop.has(agent)) return;
    this.pauseReq.set(agent, { reason, path });
    // Say so at once: winding the running step down can take a moment, and the person should not wait for it.
    this.emit({ type: "drive.paused", agent, reason, ...(path ? { path } : {}) } as never);
    this.state(agent, "needsYou");
    this.sessions.get(agent)?.abort.abort();
    this.watchers.get(agent)?.clearTools();
  }
  private counter = 0;
  private ledger: Ledger;
  constructor(private o: RunnerOptions) { this.ledger = o.ledger ?? new Ledger(":memory:"); if (o.pictures) sweepWork(o.pictures.workDir); }

  // Companion's own notes are not the person taking the wheel: the watchers treat these writes as the agent's own.
  private ownWrite<T>(fn: () => T): T {
    const id = `own_${randomBytes(3).toString("hex")}`;
    for (const w of this.watchers.values()) w.begin(id);
    try { return fn(); } finally { for (const w of this.watchers.values()) w.end(id); }
  }

  // ---------- memory ----------
  private memories = new Map<string, MemoryStore>();
  private memoryFor(project: string): MemoryStore | null {
    if (!this.o.memoryDir) return null;
    const key = resolve(project);
    let m = this.memories.get(key);
    if (!m) { m = new MemoryStore({ project: key, profileDir: this.o.memoryDir }); this.memories.set(key, m); }
    return m;
  }
  // Save lines, and tell the app about each new one so it can show a toast with Undo. Memory never gets in a task's way.
  private remember(project: string, items: { scope: Scope; text: string; source: string }[], share = true) {
    if (!this.o.memoryDir || items.length === 0) return;
    this.ownWrite(() => this.rememberNow(project, items, share));
  }
  private rememberNow(project: string, items: { scope: Scope; text: string; source: string }[], share: boolean) {
    try {
      const m = this.memoryFor(project);
      if (!m) return;
      let newProjectLines = 0;
      for (const i of items) {
        const known = new Set(m.list(i.scope).entries.map((e) => e.id));
        const r = m.add(i.scope, i.text, i.source, this.now());
        if (r.ok && !known.has(r.entry.id)) {
          if (i.scope === "project") newProjectLines++;
          this.emit({ type: "memory.saved", project, scope: i.scope, line: r.entry.id, text: r.entry.text, source: r.entry.source } as never);
        }
      }
      // The shared files are written by work that changes the project, not by a question that only reads it.
      if (newProjectLines && share) this.syncShared(project, false);
    } catch { /* a memory problem is not worth stopping a task for */ }
  }
  // Keeps the shared AGENTS.md in step with project memory. A person's own files are only touched after a yes.
  private agentsAsked = new Set<string>();
  private syncShared(project: string, onlyIfPresent: boolean) {
    try {
      const m = this.memoryFor(project);
      if (!m) return;
      const choice = m.agentsChoice();
      const r = syncAgentsFiles(project, m, { approved: choice === "approved", declined: choice === "declined", onlyIfPresent });
      const key = resolve(project);
      if (r.status === "needs_ask" && !this.agentsAsked.has(key)) { this.agentsAsked.add(key); this.emit({ type: "memory.agents_ask", project, files: r.files } as never); }
      if (r.status === "written") this.emit({ type: "memory.agents_written", project, files: r.files } as never);
      if (r.status === "failed" && r.reason) this.fail(r.reason);
    } catch { /* sharing is never worth stopping a task for */ }
  }
  // What an agent is told. Nothing at all for an off the record task.
  private learnAndRecall(project: string, said: string, offTheRecord: boolean | undefined, share = true): string {
    if (offTheRecord) return "";
    try {
      this.remember(project, [...projectFacts(project).map((f) => ({ scope: "project" as Scope, ...f })), ...askSignals(said)], share);
      return this.memoryFor(project)?.forAgent() ?? "";
    } catch { return ""; }
  }
  // Where was I: three plain lines from the task history, only when something happened while the person was away.
  private recap(cmd: Extract<Command, { type: "recap.ask" }>) {
    if (Number.isNaN(Date.parse(cmd.since))) { this.fail("Where was I needs a time to look back from.", undefined); return; }
    let pending = 0;
    for (const s of this.sessions.values()) pending += s.pending.size;
    const rows = this.o.log.list(cmd.project, 100);
    this.emit({ type: "recap.ready", project: cmd.project, lines: recapLines(rows, new Date(cmd.since).toISOString(), pending) } as never);
  }
  // Explain: asks the fast model why the task did what it did. A problem here is never a problem for the task.
  private async explain(cmd: StartCmd, input: { label: string; changed: { file: string; kind: string }[]; said: string }, checkpoint: string, signal: AbortSignal) {
    if (!this.o.explainer || input.changed.length === 0) return;
    try {
      const m = this.memoryFor(cmd.project);
      if (m && !m.explainEnabled()) return;
      const ac = new AbortController();
      const stop = () => ac.abort();
      signal.addEventListener("abort", stop, { once: true });
      const timer = setTimeout(stop, 45_000);
      try {
        const r = await this.o.explainer(explainRequest(input), ac.signal);
        const e = parseExplain(r.text);
        if (e && !ac.signal.aborted) this.emit({ type: "explain.ready", agent: cmd.agent, checkpoint, bullets: e.bullets, ...(e.question ? { question: e.question } : {}), usdEstimate: r.costUsd } as never);
      } finally { clearTimeout(timer); signal.removeEventListener("abort", stop); }
    } catch (e) { if (process.env.COMPANION_DEBUG_LOG === "1") console.error("explain failed:", (e as Error).message); /* no explanation is better than a broken task */ }
  }
  private memoryState(project: string) {
    const m = this.memoryFor(project);
    if (!m) return;
    const p = m.list("project"), u = m.list("profile");
    this.emit({ type: "explain.state", project, enabled: m.explainEnabled() } as never);
    this.emit({ type: "memory.state", project, paused: m.isPaused(), projectLines: p.entries, profileLines: u.entries, problems: [...p.problems, ...u.problems] } as never);
  }
  private memoryCommand(cmd: Extract<Command, { type: "memory.list" | "memory.forget" | "memory.edit" | "memory.pause" | "memory.erase" | "memory.export" | "memory.agents" }>) {
    const m = this.memoryFor(cmd.project);
    if (!m) { this.fail("Memory is not available.", undefined); return; }
    const refuse = (reason: string) => this.emit({ type: "memory.refused", project: cmd.project, reason } as never);
    switch (cmd.type) {
      case "memory.list": break;
      case "memory.forget": { const r = m.forget(cmd.scope, cmd.line); if (!r.ok) refuse(r.reason); else if (cmd.scope === "project") this.syncShared(cmd.project, true); break; }
      case "memory.edit": { const r = m.edit(cmd.scope, cmd.line, cmd.text, this.now()); if (!r.ok) refuse(r.reason); else if (cmd.scope === "project") this.syncShared(cmd.project, true); break; }
      case "memory.pause": m.setPaused(cmd.paused); break;
      case "memory.agents": {
        const dir = resolve(cmd.project);
        if (cmd.answer === "yes") { m.setAgentsChoice("approved"); this.syncShared(cmd.project, false); }
        else if (cmd.answer === "no") m.setAgentsChoice("declined");
        else { m.setAgentsChoice("declined"); const gone = ["AGENTS.md", "CLAUDE.md"].filter((f) => removeSection(join(dir, f))); if (gone.length) this.emit({ type: "memory.agents_written", project: cmd.project, files: gone } as never); }
        break;
      }
      case "memory.erase": { const r = m.eraseAll(cmd.scope); if (!r.ok) refuse(r.reason); else if (cmd.scope === "project") this.syncShared(cmd.project, true); break; }
      case "memory.export": this.emit({ type: "memory.exported", project: cmd.project, text: m.exportText() } as never); return;
    }
    this.memoryState(cmd.project);
  }

  // What this project may still spend today.
  private room(project: string): number { return (this.o.dailyCeilingUsd ?? 10) - this.ledger.spentToday(project); }
  private dailyLimit(agent: string) { this.fail("daily_limit: this project has reached its daily limit. New work starts again tomorrow, or you can raise the limit.", agent); }

  private now() { return (this.o.now ?? (() => new Date()))(); }
  private emit<T extends Omit<Event, "v" | "id">>(e: T) {
    this.o.emit({ v: PROTOCOL_VERSION, id: `e${++this.counter}`, ts: this.now().toISOString(), ...e } as unknown as Event);
  }
  /** Runs `fn` when no other proof check or picture is using this project's server and browser. */
  private inTurn<T>(project: string, fn: () => Promise<T>): Promise<T> {
    const key = resolve(project);
    const run = (this.projectTurn.get(key) ?? Promise.resolve()).then(fn, fn);
    this.projectTurn.set(key, run.catch(() => undefined));
    return run;
  }
  private track(job: Promise<void>) { this.backgroundJobs.add(job); void job.finally(() => this.backgroundJobs.delete(job)); }
  /** Pictures and cards still being made. The runner awaits this before it exits, so their servers and copies are cleaned up. */
  background(): Promise<unknown> { return Promise.allSettled([...this.backgroundJobs]); }

  private state(agent: string, state: string) { this.emit({ type: "agent.state", agent, state } as never); }
  private fail(reason: string, agent?: string) { this.emit({ type: "protocol.error", reason, ...(agent ? { agent } : {}) } as never); }

  async handle(cmd: Command): Promise<void> {
    switch (cmd.type) {
      case "agent.start": await this.run(cmd); return;
      case "recap.ask": return this.recap(cmd);
      case "ship.preview": return this.shipPreview(cmd);
      case "ship.live": return this.shipLive(cmd);
      case "ship.rollback": return this.shipRollback(cmd);
      case "explain.set": { const m = this.memoryFor(cmd.project); if (!m) { this.fail("Settings are not available.", undefined); return; } m.setExplain(cmd.enabled); this.emit({ type: "explain.state", project: cmd.project, enabled: m.explainEnabled() } as never); return; }
      case "memory.add": {
        // A line the person chose themselves (for example an answer at setup). It still goes through the same filter.
        const m = this.memoryFor(cmd.project);
        if (!m) { this.fail("Memory is not available.", undefined); return; }
        const r = this.ownWrite(() => m.add(cmd.scope, cmd.text, cmd.source, this.now()));
        if (!r.ok) this.emit({ type: "memory.refused", project: cmd.project, reason: r.reason } as never);
        else this.emit({ type: "memory.saved", project: cmd.project, scope: cmd.scope, line: r.entry.id, text: r.entry.text, source: r.entry.source } as never);
        return;
      }
      case "memory.list": case "memory.forget": case "memory.edit": case "memory.pause": case "memory.erase": case "memory.export": case "memory.agents": this.ownWrite(() => this.memoryCommand(cmd)); return;
      case "drive.plan": return this.drivePlan(cmd);
      case "rescue.diagnose": return this.rescueDiagnose(cmd);
      case "problem.find": return this.problemFind(cmd);
      case "diagram.ask": return this.diagramAsk(cmd);
      case "project.inspect": return this.projectInspect(cmd.project);
      case "project.install": return this.projectInstall(cmd.project);
      case "project.clone": return this.projectClone(cmd);
      case "research.ask": return this.researchAsk(cmd);
      case "ship.check": return this.shipCheck(cmd);
      case "drive.approve": return this.driveApprove(cmd);
      case "drive.pause": {
        if (!this.watchers.has(cmd.agent)) { this.fail("Nothing is running to pause.", cmd.agent); return; }
        this.requestPause(cmd.agent, cmd.reason); return;
      }
      case "drive.resume": {
        const r = this.resumers.get(cmd.agent);
        if (r) { this.resumers.delete(cmd.agent); r("resume"); return; }
        if (this.pauseReq.has(cmd.agent)) { this.resumeEarly.add(cmd.agent); return; }   // paused, but the step is still winding down
        this.fail("The agent is not paused.", cmd.agent); return;
      }
      case "loop.choose": {
        const r = this.choices.get(cmd.agent);
        if (!r) { this.fail("Nothing is waiting for an answer.", cmd.agent); return; }
        this.choices.delete(cmd.agent); r(cmd.choice); return;
      }
      case "agent.interrupt": { for (const f of this.finding.values()) if (f.agent === cmd.agent) f.abort.abort(); this.driveStop.add(cmd.agent); this.choices.get(cmd.agent)?.("interrupt"); this.resumers.get(cmd.agent)?.("interrupt"); this.sessions.get(cmd.agent)?.abort.abort(); this.cancelPending(cmd.agent); return; }
      case "agent.interruptAll": { for (const p of this.picturing) p.abort(); for (const a of this.installing.values()) a.abort(); for (const f of this.finding.values()) f.abort.abort(); for (const a of this.driving) { this.driveStop.add(a); this.choices.get(a)?.("interrupt"); this.resumers.get(a)?.("interrupt"); } for (const s of this.sessions.values()) { s.abort.abort(); this.cancelPending(s.agent); } return; }
      case "approval.resolve": {
        for (const s of this.sessions.values()) {
          const r = s.pending.get(cmd.approval);
          if (r) { s.pending.delete(cmd.approval); r(cmd.decision === "allow"); return; }
        }
        this.fail(`unknown approval ${cmd.approval}`);
        return;
      }
      case "checkpoint.restore": {
        try { await this.store(cmd.project).restore(cmd.checkpoint); } catch (e) { this.fail((e as Error).message); }
        return;
      }
      case "tasks.list": {
        const tasks = this.o.log.list(cmd.project, 50).map((t) => ({ id: t.id, label: t.label, status: t.status, usd: t.usd, startedAt: t.startedAt, endedAt: t.endedAt, checkpoint: t.checkpoint, changed: t.changed, proof: t.proof }));
        this.emit({ type: "tasks.list", project: cmd.project, tasks } as never);
        return;
      }
      case "agent.send": return; // follow ups arrive with the real engine
    }
  }

  private cancelPending(agent: string) {
    const s = this.sessions.get(agent);
    if (!s) return;
    for (const [id, r] of s.pending) { s.pending.delete(id); r(false); }
  }

  private store(project: string): CheckpointStore {
    const id = createHash("sha256").update(resolve(project)).digest("hex").slice(0, 16);
    return CheckpointStore.shared(join(this.o.shadowRoot, `${id}.git`), project);
  }

  private projectBusy = new Map<string, string>();   // project folder -> the agent working on it
  private openTasks = new Map<string, number>();     // agent -> its unfinished row in the task log
  private touched = new Set<string>();               // agents whose task has started changing the project

  // One agent, and one writer per project, at a time. Whatever goes wrong inside, nothing is left stuck.
  private async run(cmd: StartCmd, opts: { resumeSession?: string } = {}): Promise<{ status: string; usd: number; sessionId?: string; stuck?: { label: string; detail: string } }> {
    const key = resolve(cmd.project);
    if (this.sessions.has(cmd.agent)) { this.fail("That agent is already working. Wait for it to finish, or press Stop.", cmd.agent); return { status: "busy", usd: 0 }; }
    const holder = this.projectBusy.get(key);
    if (holder && holder !== cmd.agent) { this.fail("Something else is already working on this project. Wait for it to finish, or press Stop.", cmd.agent); return { status: "busy", usd: 0 }; }
    this.projectBusy.set(key, cmd.agent);
    try {
      return await this.runInner(cmd, opts);
    } catch (e) {
      const row = this.openTasks.get(cmd.agent);
      if (row !== undefined) { try { this.o.log.finish(row, "error", 0, this.now().toISOString()); } catch { /* the log is not worth a second failure */ } this.openTasks.delete(cmd.agent); }
      const why = clip(redact(String((e as Error).message ?? e).split("\n")[0]), 160);
      this.fail(this.touched.has(cmd.agent) ? `The task stopped unexpectedly (${why}). Look at your project, and use Undo if something is not right.` : `The task could not start (${why}). Nothing in your project was changed.`, cmd.agent);
      this.state(cmd.agent, "error");
      return { status: "error", usd: 0 };
    } finally {
      this.sessions.delete(cmd.agent);
      this.projectBusy.delete(key);
      this.touched.delete(cmd.agent);
      this.watchers.get(cmd.agent)?.clearTools();     // a tool that was stopped partway may never have reported back
    }
  }

  private async runInner(cmd: StartCmd, opts: { resumeSession?: string } = {}): Promise<{ status: string; usd: number; sessionId?: string; stuck?: { label: string; detail: string } }> {
    const room = this.room(cmd.project);
    if (room <= 0) { this.dailyLimit(cmd.agent); this.state(cmd.agent, "error"); return { status: "daily_limit", usd: 0 }; }
    const budget = Math.min(cmd.budgetUsd, room);
    const store = this.store(cmd.project);
    const lbl = cmd.offTheRecord ? "Off the record task" : makeLabel(cmd.prompt);
    const recalled = this.learnAndRecall(cmd.project, cmd.prompt, cmd.offTheRecord);
    const abort = new AbortController();
    const session: Session = { agent: cmd.agent, abort, pending: new Map() };
    this.sessions.set(cmd.agent, session);

    const before = await store.snapshot(`Before: ${lbl.slice(0, 60)}`);
    this.emit({ type: "checkpoint.created", project: cmd.project, agent: cmd.agent, checkpoint: before.id, label: `Before: ${lbl}`, files: before.files, skipped: before.skipped } as never);
    const taskId = this.o.log.start({ project: cmd.project, agent: cmd.agent, mode: cmd.mode, label: lbl, startedAt: this.now().toISOString() });
    this.openTasks.set(cmd.agent, taskId);
    this.touched.add(cmd.agent);
    this.state(cmd.agent, "thinking");

    let usd = 0, booked = 0, commands = 0, status = "done";
    const book = () => { this.ledger.add(cmd.project, usd - booked); booked = usd; };
    const notUndoable: string[] = before.skipped.map((k) => `${k.path}: ${k.reason}`);
    const exec = this.o.executor ?? defaultExecutor;
    let sessionId: string | undefined = opts.resumeSession;
    let said = "";

    // One conversation with the engine. Returns false when the task must stop (stopped, over budget, error).
    const round = async (prompt: string, resumeSession?: string): Promise<boolean> => {
      const gen = this.o.engine.start({
        prompt, project: cmd.project, model: cmd.model, signal: abort.signal, budgetUsd: Math.max(0, budget - usd), resumeSession, memory: recalled,
        authorize: (tool, id) => this.authorizeTool(cmd, session, tool, before.id, notUndoable, () => { commands++; }, id),
        toolDone: (id) => { if (id) this.watchers.get(cmd.agent)?.end(id); },
      });
      try {
        let next = await gen.next();
        while (!next.done) {
          if (abort.signal.aborted) { status = "interrupted"; return false; }
          const turn = next.value;
          if (turn.sessionId) sessionId = turn.sessionId;
          usd += turn.costUsd; book();
          this.emit({ type: "cost.update", agent: cmd.agent, usdEstimate: usd, basis: "sdk_estimate", tokens: { in: 0, cacheRead: 0, out: 0 } } as never);
          if (usd > budget) { status = "error_max_budget_usd"; this.fail("error_max_budget_usd: the spending limit was reached", cmd.agent); return false; }

          let result: ToolResult | undefined;
          if (turn.tool) {
            const a = await this.authorizeTool(cmd, session, turn.tool, before.id, notUndoable, () => { commands++; });
            try { result = a.allow ? await exec(turn.tool, { project: cmd.project }) : { ok: false, output: a.reason }; }
            finally { if (a.wid) this.watchers.get(cmd.agent)?.end(a.wid); }
            if (abort.signal.aborted) { status = "interrupted"; return false; }
          } else if (turn.text) {
            said = (said + " " + turn.text).slice(-1500);
            this.state(cmd.agent, "working");
          }
          next = await gen.next(result);
        }
        if (abort.signal.aborted) { status = "interrupted"; return false; }
        return true;
      } catch (e) {
        // Real Claude throws when it is stopped. If a stop was asked for, that is a stop, not a crash.
        if (abort.signal.aborted && !(e instanceof EngineStop)) { status = "interrupted"; return false; }
        const msg = (e as Error).message;
        if (e instanceof EngineStop) { usd += e.costUsd; book(); }
        status = /^error_max_[a-z_]+/.exec(msg)?.[0] ?? "error";
        this.fail(status === "error" ? `engine error: ${msg}` : msg, cmd.agent);
        return false;
      } finally {
        try { await gen.return(undefined); } catch { /* already finished */ }
      }
    };

    // Receipt: compare the state before with the state now. Proof: "done" has to be earned, so a task
    // that changed files is checked, and a failed check goes back to Claude (twice at most).
    const MAX_TRIES = 3;
    let proof: "passed" | "failed" | "skipped" = "skipped";
    const sigs: string[] = [];
    let lastFailure: { label: string; detail: string } | undefined;
    let changed: Awaited<ReturnType<CheckpointStore["diff"]>> = [];
    let shot: PageShot | undefined;   // the page as it is after a passing check, for the visual receipt
    let ok = await round(cmd.prompt, opts.resumeSession);
    for (let tries = 1; ; tries++) {
      const after = await store.snapshot(`After: ${lbl.slice(0, 60)}`);
      changed = await store.diff(before.id, after.id);
      if (!ok || status !== "done" || changed.length === 0 || abort.signal.aborted) break;

      this.state(cmd.agent, "checking");
      const onStep = (u: StepUpdate) => this.emit({ type: "proof.step", agent: cmd.agent, rung: u.rung, label: u.label, status: u.status, detail: u.detail, ms: u.ms } as never);
      let res: LadderResult;
      this.watchers.get(cmd.agent)?.begin("ladder");
      const paths = new Set(changed.map((c) => c.file));
      const afterFiles = this.o.reviewer ? await store.readFiles(after.id, (p) => paths.has(p)) : {};
      const review = this.o.reviewer && needsReview(changed, afterFiles) ? async () => {
        const [bf, af] = [await store.readFiles(before.id, (p) => paths.has(p)), afterFiles];
        const text = await this.askReviewer(cmd.prompt, diffText(bf, af, 40_000), Math.max(0, Math.min(1, budget - usd)), abort.signal, (c) => { usd += c; book(); });
        return parseReview(text);
      } : undefined;
      try {
        res = await this.inTurn(cmd.project, () => (this.o.proof ?? runLadder)({ project: cmd.project, store, beforeId: before.id, afterId: after.id, onStep, signal: abort.signal, review }));
      } catch (e) {
        res = { verdict: "failed", steps: [{ rung: "checks", label: "Checking the work", status: "failed", detail: `The checker itself stopped: ${(e as Error).message}`, ms: 0 }] };
      } finally { this.watchers.get(cmd.agent)?.end("ladder"); }
      this.emit({ type: "proof.result", agent: cmd.agent, verdict: res.verdict, steps: res.steps, tries } as never);
      this.lastProof.set(cmd.project, { verdict: res.verdict, snapshot: after.id });
      if (res.verdict === "cancelled" || abort.signal.aborted) { status = "interrupted"; break; }
      if (res.verdict !== "failed") { if (res.verdict !== "nothing_to_check") proof = "passed"; shot = res.shot; break; }

      proof = "failed"; status = "not_done";
      { const fl = res.failedAt ?? res.steps.at(-1); if (fl) { sigs.push(failureSignature(fl)); lastFailure = { label: fl.label, detail: fl.detail }; } }
      if (tries >= MAX_TRIES || usd >= budget) { if (usd >= budget) status = "error_max_budget_usd"; break; }
      // Send the evidence back into the same conversation and try again.
      const f = res.failedAt ?? res.steps.at(-1);
      this.state(cmd.agent, "working");
      status = "done";
      ok = await round(`The checks on your work failed. Please fix this and keep the change small.\n\nFailed check: ${f?.label ?? "unknown"}\nWhat happened: ${f?.detail ?? "no details"}`, sessionId);
      if (ok && status === "done") {
        const probe = await store.snapshot(`After: ${lbl.slice(0, 60)}`);
        if ((await store.diff(after.id, probe.id)).length === 0) { status = "not_done"; break; } // the fix changed nothing
      }
      if (!ok || status !== "done") break;
      proof = "skipped";
    }
    // Save the task first, so a page that asks for the timeline when the receipt arrives sees it.
    book();
    this.o.log.finish(taskId, status, usd, this.now().toISOString(), { checkpoint: before.id, changed: changed.length, proof });
    this.openTasks.delete(cmd.agent);
    // Off the record work gets no saved picture (nothing about it is kept).
    const picture = status === "done" && proof === "passed" && !!shot && !!this.o.pictures && !cmd.offTheRecord;
    this.emit({ type: "receipt", agent: cmd.agent, checkpoint: before.id, changed, commands, notUndoable, proof, usdEstimate: usd, ...(picture ? { picture: true } : {}), ...(this.driving.has(cmd.agent) ? { inPlan: true } : {}) } as never);
    this.state(cmd.agent, status === "done" ? "done" : status === "interrupted" ? "idle" : "error");
    this.sessions.delete(cmd.agent);
    if (picture) this.track(this.visualReceipt(cmd, store, before.id, shot!));
    if (status === "done" && cmd.mode === "drive" && !cmd.offTheRecord && !this.driving.has(cmd.agent)) void this.explain(cmd, { label: lbl, changed, said }, before.id, abort.signal);
    const stuck = proof === "failed" && sigs.length >= 3 && new Set(sigs.slice(-3)).size === 1 ? lastFailure : undefined;
    return { status, usd, sessionId, ...(stuck ? { stuck } : {}) };
  }

  // The "it's live" card, made in the background once the site is live. Stop everything ends it.
  private async shareCard(project: string, url: string): Promise<void> {
    const ac = new AbortController();
    this.picturing.add(ac);
    try {
      let pkg: string | undefined;
      try { pkg = JSON.parse(readFileSync(join(project, "package.json"), "utf8")).name; } catch { pkg = undefined; }
      const title = projectTitle(typeof pkg === "string" ? pkg : undefined, project.split("/").filter(Boolean).pop() ?? "");
      const date = this.now().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      const card = await (this.o.pictures?.card ?? makeShareCard)({ url, title, date, signal: ac.signal });
      if (!card || ac.signal.aborted) return;
      this.emit({ type: "ship.card", project, url, title, image: card.jpeg, withShot: card.withShot } as never);
    } catch { /* no card is not worth an error */ }
    finally { this.picturing.delete(ac); }
  }

  // The visual receipt: run the earlier version in a private copy, compare the two pages, circle what changed.
  // It runs after the task has ended, so it never holds the person up; Stop everything ends it.
  private async visualReceipt(cmd: StartCmd, store: CheckpointStore, beforeId: string, after: PageShot): Promise<void> {
    const pics = this.o.pictures!;
    const ac = new AbortController();
    this.picturing.add(ac);
    // Every receipt that said a picture is coming gets an answer, so the card never waits forever.
    const none = () => this.emit({ type: "receipt.visual", agent: cmd.agent, project: cmd.project, checkpoint: beforeId, made: false, caption: "", circles: 0 } as never);
    try {
      const out = await this.inTurn(cmd.project, async () => {
        if (ac.signal.aborted) return null;
        const b = await (pics.before ?? captureBefore)({ store, beforeId, project: cmd.project, workDir: pics.workDir, signal: ac.signal });
        if (ac.signal.aborted || ("none" in b && b.none === "cancelled")) return null;
        // Only a page that really had nothing, or really crashed, is drawn as "everything is new". Otherwise no circles are guessed.
        const unknown = "none" in b && b.none === "not_pictured";
        const pic = unknown ? { jpeg: after.jpeg, regions: [], how: "none" as const } : await (pics.draw ?? drawReceipt)("shot" in b ? b.shot : null, after, ac.signal);
        return { b, pic, unknown };
      });
      if (!out || ac.signal.aborted) { none(); return; }
      const { b, pic, unknown } = out;
      const caption = unknown ? "This works now. The earlier version could not be pictured, so nothing is circled."
        : "none" in b && b.none === "crashed" ? "Before, the page crashed on start. Now it works."
        : pic.how === "all_new" ? "This works now. Everything on this page is new."
        : pic.regions.length ? "This works now. What changed is circled." : "This works now. The page looks the same as before.";
      let saved = "";
      try { mkdirSync(pics.saveDir, { recursive: true, mode: 0o700 }); saved = join(pics.saveDir, `${beforeId}.jpg`); writeFileSync(saved, Buffer.from(pic.jpeg, "base64"), { mode: 0o600 }); pruneOldest(pics.saveDir, KEEP_PICTURES); } catch { saved = ""; }
      this.emit({ type: "receipt.visual", agent: cmd.agent, project: cmd.project, checkpoint: beforeId, made: true, image: pic.jpeg, caption, circles: pic.regions.length, ...(saved ? { file: saved } : {}) } as never);
    } catch { none(); }   // a missing picture never spoils a finished task
    finally { this.picturing.delete(ac); }
  }

  // --- Drive: plan first (read only), then one approved step at a time ---

  // The second reviewer sees only the text it is given. Every tool is refused.
  private async askReviewer(goal: string, diff: string, budgetUsd: number, signal: AbortSignal, spent: (usd: number) => void): Promise<string> {
    let text = "";
    const gen = this.o.reviewer!.start({
      prompt: reviewPrompt(goal, diff), project: "", model: this.o.reviewModel ?? "claude-opus-5-5", signal, budgetUsd, planOnly: true,
      authorize: async (tool) => { this.emit({ type: "agent.tool", agent: "reviewer", tool: tool.name, summary: summary(tool), toolUseId: `toolu_${randomBytes(4).toString("hex")}`, undoable: true, outcome: "blocked" } as never); return { allow: false, reason: "Blocked by Companion: the reviewer only reads the text it is given." }; },
    });
    try {
      let next = await gen.next();
      while (!next.done) {
        const turn = next.value;
        spent(turn.costUsd);
        let result: ToolResult | undefined;
        if (turn.tool) { this.emit({ type: "agent.tool", agent: "reviewer", tool: turn.tool.name, summary: summary(turn.tool), toolUseId: `toolu_${randomBytes(4).toString("hex")}`, undoable: true, outcome: "blocked" } as never); result = { ok: false, output: "Blocked by Companion: the reviewer only reads the text it is given." }; }
        else if (turn.text) text += turn.text + "\n";
        next = await gen.next(result);
      }
    } finally { try { await gen.return(undefined); } catch { /* finished */ } }
    return text;
  }

  // A session that may only look. Anything that is not a plain look is refused here, in code.
  // `body` gets a way to ask Claude and finishes by setting the right state itself.
  private async readOnly(spec: { agent: string; project: string; model: string; budgetUsd: number; offTheRecord?: boolean; said?: string; allow?: Set<string>; refuse?: string; check?: (tool: ToolUse) => string | null },
    body: (ask: (prompt: string, resume?: string) => Promise<string>, st: { usd: number; sessionId?: string; abort: AbortController }) => Promise<void>): Promise<void> {
    const room = this.room(spec.project);
    if (room <= 0) { this.dailyLimit(spec.agent); return; }
    const budget = Math.min(spec.budgetUsd, room);
    const abort = new AbortController();
    const recalled = this.learnAndRecall(spec.project, spec.said ?? "", spec.offTheRecord, false);
    this.sessions.set(spec.agent, { agent: spec.agent, abort, pending: new Map() });
    this.driving.add(spec.agent);
    this.driveStop.delete(spec.agent);
    this.plans.delete(spec.agent);
    this.state(spec.agent, "thinking");
    const st = { usd: 0, sessionId: undefined as string | undefined, abort };
    let booked = 0;
    const book = () => { this.ledger.add(spec.project, st.usd - booked); booked = st.usd; };
    const exec = this.o.executor ?? defaultExecutor;
    const allowed = spec.allow ?? READ_ONLY_TOOLS;
    const authorize = async (tool: ToolUse) => {
      const refusal = allowed.has(tool.name) && spec.check ? spec.check(tool) : null;
      const ok = allowed.has(tool.name) && !refusal;
      this.emit({ type: "agent.tool", agent: spec.agent, tool: tool.name, summary: summary(tool), toolUseId: `toolu_${randomBytes(4).toString("hex")}`, undoable: true, outcome: ok ? "ran" : "blocked" } as never);
      return ok ? { allow: true, reason: "" } : { allow: false, reason: refusal ?? spec.refuse ?? "Blocked by Companion: this can only look at the project, not change it." };
    };
    const ask = async (prompt: string, resume?: string): Promise<string> => {
      let text = "";
      const gen = this.o.engine.start({ prompt, project: spec.project, model: spec.model, signal: abort.signal, budgetUsd: Math.max(0, budget - st.usd), resumeSession: resume, planOnly: true, authorize, memory: recalled });
      try {
        let next = await gen.next();
        while (!next.done) {
          if (abort.signal.aborted) break;
          const turn = next.value;
          if (turn.sessionId) st.sessionId = turn.sessionId;
          st.usd += turn.costUsd; book();
          if (st.usd > budget) throw new EngineStop("error_max_budget_usd: the spending limit was reached");
          let result: ToolResult | undefined;
          if (turn.tool) {
            const a = await authorize(turn.tool);
            result = a.allow ? await exec(turn.tool, { project: spec.project }) : { ok: false, output: a.reason };
          } else if (turn.text) text += turn.text + "\n";
          next = await gen.next(result);
        }
      } finally { try { await gen.return(undefined); } catch { /* finished */ } }
      return text;
    };
    try {
      await body(ask, st);
    } catch (e) {
      // A stop is not a crash (real Claude throws when it is stopped).
      if (e instanceof EngineStop) { st.usd += e.costUsd; book(); }   // a run that stopped on its limit still cost something
      if (abort.signal.aborted && !(e instanceof EngineStop)) { this.state(spec.agent, "idle"); return; }
      const msg = (e as Error).message;
      this.fail(/^error_max_[a-z_]+/.test(msg) ? msg : `engine error: ${msg}`, spec.agent);
      this.state(spec.agent, "error");
    } finally {
      book();
      this.sessions.delete(spec.agent);
      this.driving.delete(spec.agent);
    }
  }

  private async drivePlan(cmd: Extract<Command, { type: "drive.plan" }>): Promise<void> {
    await this.readOnly({ agent: cmd.agent, project: cmd.project, model: cmd.model, budgetUsd: cmd.budgetUsd, offTheRecord: cmd.offTheRecord, said: cmd.goal, refuse: "Blocked by Companion: planning can only look at the project, not change it." }, async (ask, st) => {
      let steps = parsePlan(await ask(planPrompt(cmd.goal)));
      if (steps.length > MAX_STEPS && !st.abort.signal.aborted) {
        const again = parsePlan(await ask(shortenPrompt(steps.length), st.sessionId));
        if (again.length) steps = again;
      }
      if (st.abort.signal.aborted) { this.state(cmd.agent, "idle"); return; }
      if (steps.length === 0) { this.fail("Claude did not give a usable plan. Try describing the goal in a little more detail.", cmd.agent); this.state(cmd.agent, "error"); return; }
      const truncated = steps.length > MAX_STEPS;
      const kept = steps.slice(0, MAX_STEPS);
      this.plans.set(cmd.agent, { project: cmd.project, model: cmd.model, budgetUsd: cmd.budgetUsd, usd: st.usd, sessionId: st.sessionId, offTheRecord: cmd.offTheRecord, goal: cmd.goal });
      this.emit({ type: "plan.ready", agent: cmd.agent, steps: kept.map((title, i) => ({ id: i + 1, title })), truncated, estimateUsd: estimateUsd(kept.length) } as never);
      this.state(cmd.agent, "needsYou");
    });
  }

  // Research: look things up (web allowed, safe addresses only) and file cited notes. Writes no code.
  private async researchAsk(cmd: Extract<Command, { type: "research.ask" }>): Promise<void> {
    const question = cmd.question.replace(/\s+/g, " ").trim();
    if (!question) { this.fail("Research needs a question to look into.", cmd.agent); return; }
    const web = new Set([...READ_ONLY_TOOLS, "WebSearch", "WebFetch", "ToolSearch"]);
    const check = (t: ToolUse) => (t.name === "WebFetch" && !isSafeUrl(String(t.input.url ?? ""))) ? "Blocked by Companion: research may only open public web pages, never this computer or a private network." : null;
    await this.readOnly({ agent: cmd.agent, project: cmd.project, model: cmd.model, budgetUsd: cmd.budgetUsd, allow: web, check, refuse: "Blocked by Companion: research can look things up, but never change the project." }, async (ask, st) => {
      const r = parseResearch(await ask(researchPrompt(question)));
      if (st.abort.signal.aborted) { this.state(cmd.agent, "idle"); return; }
      if (!r) { this.fail("Research found no cited notes (notes with sources), so nothing was filed. Try asking a more specific question.", cmd.agent); this.state(cmd.agent, "error"); return; }
      const dir = join(cmd.project, ".companion", "research");
      mkdirSync(dir, { recursive: true });
      const when = this.now();
      const name = noteFileName(r.title, when, (f) => existsSync(join(dir, f)));
      writeFileSync(join(dir, name), notesMarkdown(question, r, when), { flag: "wx" });
      this.emit({ type: "research.done", agent: cmd.agent, title: r.title, answer: r.answer, notes: r.notes, file: `.companion/research/${name}` } as never);
      this.state(cmd.agent, "done");
    });
  }

  // Ship: may this go on the internet? Runs every gate and says which one stops it. Nothing is deployed here.
  // The files that changed between two snapshots, not counting Companion's own notes or the link files the Vercel tool leaves.
  private async changedSince(store: CheckpointStore, from: string, to: string) {
    return (await store.diff(from, to)).filter((c) => !c.file.startsWith(".vercel/") && !c.file.startsWith(".companion/"));
  }

  // Every gate, on the project exactly as it is now. With runChecks, the checks are run first if the last pass is out of date.
  private async gateReport(project: string, runChecks: boolean, confirm?: string[]) {
    const store = this.store(project);
    const now = await store.snapshot("Ship check");
    let rec = this.lastProof.get(project);
    const stale = async () => !rec || (await this.changedSince(store, rec.snapshot, now.id)).length > 0;
    if (runChecks && (await stale())) {
      // Check the project exactly as it is now, with no model involved.
      const ac = new AbortController();
      this.sessions.set("ship", { agent: "ship", abort: ac, pending: new Map() });
      const onStep = (u: StepUpdate) => this.emit({ type: "proof.step", agent: "ship", rung: u.rung, label: u.label, status: u.status, detail: u.detail, ms: u.ms } as never);
      try {
        const res = await (this.o.proof ?? runLadder)({ project, store, beforeId: now.id, afterId: now.id, onStep, signal: ac.signal });
        this.emit({ type: "proof.result", agent: "ship", verdict: res.verdict, steps: res.steps, tries: 1 } as never);
        if (res.verdict !== "cancelled") { rec = { verdict: res.verdict, snapshot: now.id }; this.lastProof.set(project, rec); }
      } catch { /* the proof gate will say it was not checked */ } finally { this.sessions.delete("ship"); }
    }
    const proof: ProofRecord | undefined = rec ? { verdict: rec.verdict, unchangedSince: !(await stale()) } : undefined;
    const report = await runGates({ project, proof, confirmed: confirm });
    return { report, snapshot: now.id, proof: rec?.verdict ?? "skipped" };
  }

  private async shipCheck(cmd: Extract<Command, { type: "ship.check" }>): Promise<void> {
    const { report } = await this.gateReport(cmd.project, !!cmd.runChecks, cmd.confirm);
    this.emit({ type: "ship.gates", project: cmd.project, ...report } as never);
  }

  // ---------- Ship: a preview first, then live only on a tap that names that preview ----------

  private previews = new Map<string, { url: string; snapshot: string; gates: { id: string; status: string }[]; proof: string }>();
  private shipping = new Set<string>();
  private shipSay(project: string, stage: string, detail: string, extra: Record<string, unknown> = {}) {
    this.emit({ type: "ship.status", project, stage, detail: clip(redact(detail), 400), ...extra } as never);
  }
  private shipTools(project: string): Deployer | null {
    if (!this.o.deployer) { this.shipSay(project, "failed", "Putting a site on the internet is not set up on this Mac yet."); return null; }
    if (this.shipping.has(resolve(project))) { this.shipSay(project, "refused", "Another ship step is already running. Wait for it to finish."); return null; }
    return this.o.deployer;
  }

  private async shipPreview(cmd: Extract<Command, { type: "ship.preview" }>): Promise<void> {
    const d = this.shipTools(cmd.project);
    if (!d) return;
    const key = resolve(cmd.project), ac = new AbortController();
    this.shipping.add(key);
    this.sessions.set("ship", { agent: "ship", abort: ac, pending: new Map() });
    try {
      this.previews.delete(key);
      this.shipSay(cmd.project, "checking_gates", "Checking the project first.");
      const { report, snapshot, proof } = await this.gateReport(cmd.project, true);
      this.emit({ type: "ship.gates", project: cmd.project, ...report } as never);
      if (ac.signal.aborted) return;
      if (!report.canShip) { this.shipSay(cmd.project, "refused", "Not ready to go on the internet. The checks above say why."); return; }
      if (!d.signedIn()) { this.shipSay(cmd.project, "not_signed_in", NOT_SIGNED_IN); return; }
      this.shipSay(cmd.project, "deploying", "Putting up a private preview. This can take a minute or two.");
      const r = await d.preview(cmd.project, ac.signal);
      if (ac.signal.aborted) { this.shipSay(cmd.project, "failed", "Stopped. Nothing went live."); return; }
      if (!r.ok) { this.shipSay(cmd.project, r.reason === NOT_SIGNED_IN ? "not_signed_in" : "failed", r.reason); return; }
      if (!/^https:\/\/[a-z0-9.-]+\.vercel\.app\/?$/i.test(r.url) || !isSafeUrl(r.url)) { this.shipSay(cmd.project, "failed", "The preview link looked wrong, so I did not open it."); return; }
      this.shipSay(cmd.project, "checking_preview", "Opening the preview in a hidden browser to make sure it works.", { previewUrl: r.url });
      const b = await (this.o.browser ?? browserCheck)(r.url, {});
      if (ac.signal.aborted) return;
      if (b.skipped) { this.shipSay(cmd.project, "failed", `The preview could not be checked: ${b.skipped} It cannot go live until it has been checked.`, { previewUrl: r.url, canGoLive: false }); return; }
      if (!b.ok) {
        const blocked = b.problems.some((p) => /\((401|403)\)/.test(p));
        this.shipSay(cmd.project, "failed", blocked ? "The preview is behind Vercel's own login, so I could not open it. Turn off protection for previews in your Vercel project settings, then try again." : `The preview has a problem: ${b.problems.slice(0, 2).join(". ")}`, { previewUrl: r.url, canGoLive: false });
        return;
      }
      const gates = report.gates.map((g) => ({ id: g.id, status: g.status }));
      this.previews.set(key, { url: r.url, snapshot, gates, proof });
      try { addShipReceipt(cmd.project, { at: this.now().toISOString(), action: "preview", snapshot, url: r.url, gates, proof }); } catch { /* the record is not worth stopping for */ }
      this.shipSay(cmd.project, "ready", "The preview works. Making it live puts it on the internet for everyone.", { previewUrl: r.url, canGoLive: true });
    } catch (e) {
      this.shipSay(cmd.project, "failed", `Something went wrong while putting up the preview (${clip(String((e as Error).message ?? e), 120)}). Nothing went live.`);
    } finally { this.shipping.delete(key); this.sessions.delete("ship"); }
  }

  private async shipLive(cmd: Extract<Command, { type: "ship.live" }>): Promise<void> {
    const d = this.shipTools(cmd.project);
    if (!d) return;
    const key = resolve(cmd.project), ac = new AbortController();
    this.shipping.add(key);
    this.sessions.set("ship", { agent: "ship", abort: ac, pending: new Map() });
    try {
      if ((cmd as { confirm?: unknown }).confirm !== true) { this.shipSay(cmd.project, "refused", "Going live needs your yes."); return; }
      const p = this.previews.get(key);
      if (!p || p.url !== cmd.url) { this.shipSay(cmd.project, "refused", "That is not the preview that was checked. Make a new preview first."); return; }
      const store = this.store(cmd.project);
      const now = await store.snapshot("Before going live");
      if ((await this.changedSince(store, p.snapshot, now.id)).length > 0) { this.previews.delete(key); this.shipSay(cmd.project, "refused", "The project changed after this preview was checked. Make a new preview first."); return; }
      const { report } = await this.gateReport(cmd.project, false);
      if (!report.canShip) { this.shipSay(cmd.project, "refused", "The safety checks no longer pass. Make a new preview first."); return; }
      if (!d.signedIn()) { this.shipSay(cmd.project, "not_signed_in", NOT_SIGNED_IN); return; }
      this.shipSay(cmd.project, "deploying", "Making it live.");
      const r = await d.promote(p.url, cmd.project, ac.signal);
      if (!r.ok) { this.shipSay(cmd.project, "failed", `${r.reason} Nothing went live.`); return; }
      this.previews.delete(key);
      try { addShipReceipt(cmd.project, { at: this.now().toISOString(), action: "live", snapshot: p.snapshot, url: p.url, productionUrl: r.productionUrl, gates: p.gates, proof: p.proof }); } catch { /* the record is not worth stopping for */ }
      this.shipSay(cmd.project, "live", `It is live${r.productionUrl ? ` at ${r.productionUrl}` : ""}. Undo cannot take it off the internet; the Roll back button can.`, { previewUrl: p.url, ...(r.productionUrl ? { productionUrl: r.productionUrl } : {}) });
      if (this.o.pictures) this.track(this.shareCard(cmd.project, r.productionUrl ?? p.url));
    } catch (e) {
      this.shipSay(cmd.project, "failed", `Something went wrong (${clip(String((e as Error).message ?? e), 120)}).`);
    } finally { this.shipping.delete(key); this.sessions.delete("ship"); }
  }

  private async shipRollback(cmd: Extract<Command, { type: "ship.rollback" }>): Promise<void> {
    const d = this.shipTools(cmd.project);
    if (!d) return;
    const key = resolve(cmd.project), ac = new AbortController();
    this.shipping.add(key);
    this.sessions.set("ship", { agent: "ship", abort: ac, pending: new Map() });
    try {
      if ((cmd as { confirm?: unknown }).confirm !== true) { this.shipSay(cmd.project, "refused", "A rollback needs your yes."); return; }
      const ships = readShips(cmd.project), lastLive = [...ships].reverse().find((s) => s.action === "live"), lastBack = [...ships].reverse().find((s) => s.action === "rollback");
      if (!lastLive || (lastBack && lastBack.at > lastLive.at)) { this.shipSay(cmd.project, "refused", "Nothing has gone live from Companion that could be rolled back."); return; }
      if (!d.signedIn()) { this.shipSay(cmd.project, "not_signed_in", NOT_SIGNED_IN); return; }
      const r = await d.rollback(cmd.project, ac.signal);
      if (!r.ok) { this.shipSay(cmd.project, "failed", `${r.reason} The live site was not changed.`); return; }
      try { addShipReceipt(cmd.project, { at: this.now().toISOString(), action: "rollback", snapshot: lastLive.snapshot, gates: [], proof: lastLive.proof }); } catch { /* the record is not worth stopping for */ }
      this.shipSay(cmd.project, "rolled_back", "The live site is back to the version before.");
    } catch (e) {
      this.shipSay(cmd.project, "failed", `Something went wrong (${clip(String((e as Error).message ?? e), 120)}). The live site was not changed.`);
    } finally { this.shipping.delete(key); this.sessions.delete("ship"); }
  }

  // Point at the problem: check the project exactly as it is (no Claude, nothing changed) and say where it fails,
  // so the character can fly to that line, error or button.
  private async problemFind(cmd: Extract<Command, { type: "problem.find" }>): Promise<void> {
    // Every press ends with problem.found, so the card never stays on "Checking".
    const found = (verdict: string, fl?: Step) => this.emit({ type: "problem.found", project: cmd.project, agent: cmd.agent, verdict, ...(fl ? { label: fl.label, detail: fl.detail } : {}), ...(fl?.problem ? { problem: fl.problem } : {}) } as never);
    if (this.finding.has(cmd.project) || this.sessions.has(cmd.agent) || this.driving.has(cmd.agent)) { this.fail("Companion is already working on this project. Wait for it to finish, or press Stop.", cmd.agent); found("cancelled"); return; }
    const abort = new AbortController();
    this.finding.set(cmd.project, { abort, agent: cmd.agent });
    try {
      const store = this.store(cmd.project);
      const snap = await store.snapshot("Point at the problem: the project as it was found");
      this.state(cmd.agent, "checking");
      const onStep = (u: StepUpdate) => this.emit({ type: "proof.step", agent: cmd.agent, rung: u.rung, label: u.label, status: u.status, detail: u.detail, ms: u.ms } as never);
      let res: LadderResult;
      try { res = await (this.o.proof ?? runLadder)({ project: cmd.project, store, beforeId: snap.id, afterId: snap.id, onStep, signal: abort.signal, noInstall: true }); }
      catch (e) { res = { verdict: "failed", steps: [{ rung: "checks", label: "Checking the project", status: "failed", detail: `The checker itself stopped: ${(e as Error).message}`, ms: 0 }] }; }
      if (abort.signal.aborted) res = { ...res, verdict: "cancelled" };
      const fl = res.verdict === "failed" ? (res.failedAt ?? res.steps.find((x) => x.status === "failed")) : undefined;
      found(res.verdict, fl);
      this.state(cmd.agent, fl ? "needsYou" : "idle");
    } catch (e) {
      this.fail(`Companion could not check the project (${clip(String((e as Error).message ?? e), 120)}).`, cmd.agent);
      found("cancelled");
      this.state(cmd.agent, "idle");
    } finally { this.finding.delete(cmd.project); }
  }

  // Draw it for me: ask the fast model (no tools, one turn) for a small diagram of why something broke, built only from
  // the project and the failing place. Nothing is captured from the screen. Stop everything ends it.
  private async diagramAsk(cmd: Extract<Command, { type: "diagram.ask" }>): Promise<void> {
    const done = (made: boolean, extra: Record<string, unknown> = {}) => this.emit({ type: "diagram.ready", project: cmd.project, made, ...extra } as never);
    if (!this.o.explainer) { done(false, { reason: "Drawing is not available in this mode." }); return; }
    if (!existsSync(cmd.project)) { done(false, { reason: "That project folder is not there any more." }); return; }
    const ac = new AbortController();
    this.picturing.add(ac);
    const timer = setTimeout(() => ac.abort(), 45_000);
    try {
      const r = await this.o.explainer(diagramRequest(diagramContext(cmd.project, { question: cmd.question, problem: cmd.problem })), ac.signal);
      if (ac.signal.aborted) { done(false, { reason: "Stopped." }); return; }
      const d = parseDiagram(r.text);
      if (!d) { done(false, { reason: "I could not draw a clear picture of that. Try asking in different words, or press the key when the problem is on screen." }); return; }
      done(true, { diagram: d, usdEstimate: r.costUsd });
    } catch { done(false, { reason: ac.signal.aborted ? "Stopped." : "I could not draw that just now. Try again." }); }
    finally { clearTimeout(timer); this.picturing.delete(ac); }
  }

  // About this project: where it came from, what it is built with, what it still needs. Reads files only.
  private async projectInspect(project: string): Promise<void> {
    if (!existsSync(project)) { this.fail("That project folder is not there any more."); return; }
    const r = inspectProject(project);
    this.emit({ type: "project.report", project, origin: r.origin, about: aboutLine(r), stack: r.stack, needsInstall: r.needsInstall, installCommand: r.installCommand, start: r.start, missing: r.env.missing.slice(0, 12), missingCount: r.env.missing.length, example: r.env.example, notes: r.notes } as never);
  }

  // Install the project's packages, only when the person pressed the button. The project's own install scripts run, as
  // they would in a terminal, with the short allow-list environment (no keys); Stop everything ends it.
  private async projectInstall(project: string): Promise<void> {
    const say = (stage: string, detail: string) => this.emit({ type: "project.install", project, stage, detail } as never);
    const key = resolve(project);
    // Never while anything else works in this project: a check building while node_modules is rewritten would fail for nothing.
    const busy = this.installing.has(key) || this.finding.size > 0 || this.shipping.size > 0 || this.sessions.size > 0 || this.driving.size > 0;
    if (busy) { say("failed", "Companion is already working on this project. Wait for it to finish, or press Stop."); return; }
    const det = detectProject(project);
    if (!det.packageManager) { say("failed", "This project has no package list (package.json), so there is nothing to install."); return; }
    const ac = new AbortController();
    this.installing.set(key, ac);
    try {
      say("installing", `Installing what the project needs with ${det.packageManager}. This can take a few minutes the first time.`);
      // Not in CI mode: pnpm then refuses a lock file that an export left out of date, and a person installing wants it to work.
      const r = await this.inTurn(project, () => runCommand(`${det.packageManager} install${det.packageManager === "pnpm" ? " --no-frozen-lockfile" : ""}`, { cwd: project, timeoutMs: 10 * 60_000, signal: ac.signal }));
      if (r.aborted) { say("cancelled", "Stopped. Some packages may be half installed; press Install again to finish."); return; }
      if (r.code !== 0 || r.timedOut) { say("failed", `The install did not finish. ${(r.stderr || r.stdout).trim().split("\n").slice(-6).join(" ").slice(-400)}`); return; }
      say("done", "Installed.");
      await this.projectInspect(project);
    } finally { this.installing.delete(key); }
  }

  // Open a project from a link: a new folder inside the folder the person chose. Never into an existing folder.
  private async projectClone(cmd: Extract<Command, { type: "project.clone" }>): Promise<void> {
    const t = cloneTarget(cmd.url);
    const done = (ok: boolean, detail: string, path?: string) => this.emit({ type: "project.cloned", url: t?.url ?? cmd.url, ok, detail, ...(path ? { path } : {}) } as never);
    if (!t) { done(false, "That is not a link to a GitHub, GitLab or Bitbucket project. It should look like https://github.com/name/project."); return; }
    if (!existsSync(cmd.parent)) { done(false, "That folder is not there."); return; }
    const dest = join(cmd.parent, t.name);
    if (existsSync(dest)) { done(false, `There is already a folder called ${t.name} there. Open that one, or choose another place.`); return; }
    const ac = new AbortController();
    this.installing.set(dest, ac);
    try {
      // Single quoted: a folder name with $, backticks or quotes in it is only ever a name.
      const r = await runCommand(`git clone --quiet ${shq(t.url)} ${shq(dest)}`, { cwd: cmd.parent, timeoutMs: 5 * 60_000, signal: ac.signal, env: { GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "/usr/bin/false" } });
      if (r.aborted) { rmSync(dest, { recursive: true, force: true }); done(false, "Stopped."); return; }
      if (r.code !== 0 || r.timedOut) {
        rmSync(dest, { recursive: true, force: true });
        const why = /could not read Username|Authentication failed|not found|Repository not found/i.test(r.stderr) ? "It may be private, or the link may be wrong. For a private project, copy it with GitHub Desktop, then choose its folder." : r.stderr.trim().slice(-200);
        done(false, `The project could not be copied. ${why}`); return;
      }
      done(true, `Copied ${t.name}.`, dest);
    } finally { this.installing.delete(dest); }
  }

  // Rescue: check the project exactly as it is, then ask Claude (read only) what is wrong and how to finish it.
  private async rescueDiagnose(cmd: Extract<Command, { type: "rescue.diagnose" }>): Promise<void> {
    await this.readOnly({ agent: cmd.agent, project: cmd.project, model: cmd.model, budgetUsd: cmd.budgetUsd }, async (ask, st) => {
      const store = this.store(cmd.project);
      const snap = await store.snapshot("Rescue: the project as it was found");
      this.state(cmd.agent, "checking");
      const onStep = (u: StepUpdate) => this.emit({ type: "proof.step", agent: cmd.agent, rung: u.rung, label: u.label, status: u.status, detail: u.detail, ms: u.ms } as never);
      let res: LadderResult;
      try { res = await (this.o.proof ?? runLadder)({ project: cmd.project, store, beforeId: snap.id, afterId: snap.id, onStep, signal: st.abort.signal }); }
      catch (e) { res = { verdict: "failed", steps: [{ rung: "checks", label: "Checking the project", status: "failed", detail: `The checker itself stopped: ${(e as Error).message}`, ms: 0 }] }; }
      this.emit({ type: "proof.result", agent: cmd.agent, verdict: res.verdict, steps: res.steps, tries: 1 } as never);
      if (st.abort.signal.aborted || res.verdict === "cancelled") { this.state(cmd.agent, "idle"); return; }
      const evidence = res.steps.map((x) => ({ label: x.label, status: x.status, detail: x.detail }));
      this.state(cmd.agent, "thinking");
      const d = parseDiagnosis(await ask(rescuePrompt(evidence)));
      if (st.abort.signal.aborted) { this.state(cmd.agent, "idle"); return; }
      if (!d) { this.fail("Claude did not give a usable diagnosis. Try again, or describe what is wrong.", cmd.agent); this.state(cmd.agent, "error"); return; }
      this.plans.set(cmd.agent, { project: cmd.project, model: cmd.model, budgetUsd: cmd.budgetUsd, usd: st.usd, sessionId: st.sessionId });
      const steps = d.steps.map((title, i) => ({ id: i + 1, title }));
      this.emit({ type: "rescue.report", agent: cmd.agent, summary: d.summary, works: d.works, broken: d.broken, steps, evidence, estimateUsd: estimateUsd(steps.length) } as never);
      this.emit({ type: "plan.ready", agent: cmd.agent, steps, truncated: false, estimateUsd: estimateUsd(steps.length) } as never);
      this.state(cmd.agent, "needsYou");
    });
  }

  private async driveApprove(cmd: Extract<Command, { type: "drive.approve" }>): Promise<void> {
    const plan = this.plans.get(cmd.agent);
    if (!plan) { this.fail("There is no plan waiting for approval.", cmd.agent); return; }
    const steps = cmd.steps.map((s) => String(s).replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, MAX_STEPS);
    if (steps.length === 0) { this.fail("A plan needs at least one step.", cmd.agent); return; }
    this.plans.delete(cmd.agent);
    if (!plan.offTheRecord && plan.goal) this.remember(plan.project, [{ scope: "project", text: `Goal: ${plan.goal.replace(/\s+/g, " ").trim().slice(0, 200)}`, source: "your approved plan" }]);
    this.driving.add(cmd.agent);
    this.driveStop.delete(cmd.agent);
    const total = steps.length;
    let remaining = plan.budgetUsd - plan.usd, spent = plan.usd, completed = 0, status = "done", session = plan.sessionId;
    // Take the wheel: watch for changes the agent did not make, only while the plan is running.
    const watcher = new ProjectWatcher(plan.project, (path) => this.requestPause(cmd.agent, "files_changed", path));
    this.watchers.set(cmd.agent, watcher);
    watcher.start();
    // Wait here until the person resumes (true) or stops (false).
    const pauseHere = async (): Promise<boolean> => {
      if (!this.pauseReq.has(cmd.agent)) return true;
      this.state(cmd.agent, "needsYou");
      let choice: string;
      if (this.driveStop.has(cmd.agent)) choice = "interrupt";
      else if (this.resumeEarly.delete(cmd.agent)) choice = "resume";
      else choice = await new Promise<string>((res) => this.resumers.set(cmd.agent, res));
      this.pauseReq.delete(cmd.agent);
      return choice === "resume" && !this.driveStop.has(cmd.agent);
    };
    try {
      for (let i = 0; i < total; i++) {
        const index = i + 1, title = steps[i];
        if (this.driveStop.has(cmd.agent)) { status = "interrupted"; break; }
        if (!(await pauseHere())) { status = "interrupted"; break; }
        if (this.room(plan.project) <= 0) { status = "daily_limit"; this.dailyLimit(cmd.agent); this.emit({ type: "drive.step", agent: cmd.agent, index, total, title, status: "over_budget" } as never); break; }
        if (remaining <= 0) { status = "error_max_budget_usd"; this.emit({ type: "drive.step", agent: cmd.agent, index, total, title, status: "over_budget" } as never); break; }
        this.emit({ type: "drive.step", agent: cmd.agent, index, total, title, status: "started" } as never);
        const stepCmd = (prompt: string): StartCmd => ({ v: PROTOCOL_VERSION, id: `${cmd.id}-s${index}`, type: "agent.start", project: plan.project, agent: cmd.agent, mode: "drive", prompt, model: plan.model, budgetUsd: remaining, ...(plan.offTheRecord ? { offTheRecord: true } : {}) });
        let prompt = stepPrompt(index, total, title);
        let r: Awaited<ReturnType<AgentRunner["run"]>>;
        for (;;) {
          r = await this.run(stepCmd(prompt), { resumeSession: session });
          session = r.sessionId ?? session; remaining -= r.usd; spent += r.usd;
          // Paused in the middle of the step: wait, then carry on with the same step.
          if (r.status === "interrupted" && this.pauseReq.has(cmd.agent) && !this.driveStop.has(cmd.agent)) {
            if (await pauseHere()) { prompt = pausedPrompt(title); continue; }
            r = { ...r, status: "interrupted" };
          }
          break;
        }
        // The same failure three times: stop and ask, once per step.
        if (r.status === "not_done" && r.stuck && !this.driveStop.has(cmd.agent)) {
          this.emit({ type: "loop.stuck", agent: cmd.agent, index, title, failure: r.stuck, options: STUCK_OPTIONS } as never);
          this.state(cmd.agent, "needsYou");
          const choice = await new Promise<string>((res) => this.choices.set(cmd.agent, res));
          if (choice === "different" && remaining > 0) {
            r = await this.run(stepCmd(differentPrompt(title, r.stuck)), { resumeSession: session });
            session = r.sessionId ?? session; remaining -= r.usd; spent += r.usd;
          } else if (choice === "interrupt") r = { ...r, status: "interrupted" };
        }
        if (r.status === "done") { completed++; this.emit({ type: "drive.step", agent: cmd.agent, index, total, title, status: "done" } as never); continue; }
        status = r.status;
        this.emit({ type: "drive.step", agent: cmd.agent, index, total, title, status: r.status === "interrupted" ? "stopped" : r.status === "error_max_budget_usd" ? "over_budget" : "not_done" } as never);
        break;
      }
    } finally {
      watcher.stop(); this.watchers.delete(cmd.agent); this.pauseReq.delete(cmd.agent); this.resumers.delete(cmd.agent); this.resumeEarly.delete(cmd.agent);
      this.driving.delete(cmd.agent);
    }
    this.emit({ type: "drive.done", agent: cmd.agent, status, completed, total, usdEstimate: Math.round(spent * 1e6) / 1e6 } as never);
  }

  // Judge one tool call. Returns whether it may run. Used by the runner for scripted engines
  // and by the real engine's PreToolUse hook; either way the safety rules are the same.
  private async authorizeTool(cmd: StartCmd, s: Session, tool: ToolUse, checkpoint: string, notUndoable: string[], countCommand: () => void, sdkId?: string): Promise<{ allow: boolean; reason: string; wid?: string }> {
    const toolUseId = `toolu_${randomBytes(4).toString("hex")}`;
    const base = evaluate({ tool: tool.name, input: tool.input }, { project: cmd.project });
    // House rules can only make a call stricter, never looser.
    const loaded = loadRules(cmd.project);
    const said = `${cmd.project}\n${loaded.problems.join("\n")}`;
    if (loaded.problems.length && !this.rulesSaid.has(said)) {
      this.rulesSaid.add(said);
      this.emit({ type: "protocol.error", reason: `Your house rules file has a problem. ${loaded.problems.slice(0, 3).join(" ")}` } as never);
    }
    let ruled = applyRules(loaded.rules, { tool: tool.name, input: tool.input }, cmd.project);
    // A rules file that cannot be read must not mean "no rules": anything that is not plain reading asks first.
    if (loaded.broken && !ruled && base.decision === "allow" && !["Read", "Grep", "Glob", "LS"].includes(tool.name)) {
      ruled = { decision: "ask", risk: "irreversible", reason: "Your house rules file could not be read, so I am asking first.", undoable: base.undoable };
    }
    const rank = { allow: 0, ask: 1, deny: 2 } as const;
    const verdict: Verdict = ruled && rank[ruled.decision] > rank[base.decision] ? ruled : base;
    const sum = summary(tool);
    const tell = (outcome: "ran" | "blocked" | "needs_approval" | "denied") =>
      this.emit({ type: "agent.tool", agent: cmd.agent, tool: tool.name, summary: sum, toolUseId, undoable: verdict.undoable, outcome } as never);

    if (verdict.decision === "deny") {
      tell("blocked");
      return { allow: false, reason: `Blocked by Companion: ${verdict.reason}` };
    }
    if (verdict.decision === "ask") {
      tell("needs_approval");
      const approval = `ap_${randomBytes(4).toString("hex")}`;
      const timeout = this.o.approvalTimeoutMs ?? 30 * 60_000;
      this.emit({
        type: "approval.request", approval, agent: cmd.agent, checkpoint, toolUseId, risk: verdict.risk ?? "irreversible",
        title: verdict.reason, expiresAt: new Date(this.now().getTime() + timeout).toISOString(),
      } as never);
      this.state(cmd.agent, "needsYou");
      let how: "allowed" | "denied" | "expired" | "cancelled" = "denied";
      const allowed = await new Promise<boolean>((res) => {
        const t = setTimeout(() => { s.pending.delete(approval); how = "expired"; res(false); }, timeout);
        s.pending.set(approval, (ok) => { clearTimeout(t); how = ok ? "allowed" : s.abort.signal.aborted ? "cancelled" : "denied"; res(ok); });
      });
      // Tell every page, so none keeps a stale card or badge.
      this.emit({ type: "approval.resolved", approval, agent: cmd.agent, outcome: how } as never);
      if (!allowed) { tell("denied"); return { allow: false, reason: "The user did not allow this command." }; }
      tell("ran");
    }
    if (tool.name === "Bash") countCommand();
    if (!verdict.undoable) notUndoable.push(clip(redact(String(tool.input.command ?? sum)), 300));
    this.state(cmd.agent, "working");
    if (verdict.decision === "allow") tell("ran");
    // From here until the tool finishes, file changes are the agent's own.
    const wid = sdkId ?? toolUseId;
    this.watchers.get(cmd.agent)?.begin(wid);
    return { allow: true, reason: "", wid };
  }
}

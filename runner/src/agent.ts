// Runs agent tasks: snapshot first, judge every tool call, ask the user when needed,
// stop at the spending limit, and finish with a receipt. The engine (real Claude or a
// scripted stand in) only supplies turns; everything safe happens here.

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Command, Event } from "../../protocol/index.ts";
import { PROTOCOL_VERSION } from "../../protocol/index.ts";
import { ProjectWatcher } from "./watcher.ts";
import { differentPrompt, pausedPrompt, estimateUsd, failureSignature, MAX_STEPS, parsePlan, planPrompt, READ_ONLY_TOOLS, shortenPrompt, STUCK_OPTIONS, stepPrompt } from "./drive.ts";
import { CheckpointStore } from "./checkpoints.ts";
import { EngineStop, type Engine, type ToolResult, type ToolUse } from "./engine.ts";
import { label as makeLabel } from "./redact.ts";
import { Ledger } from "./ledger.ts";
import { applyRules, loadRules } from "./rules.ts";
import { buildChildEnv, evaluate, type Verdict } from "./safety.ts";
import { runLadder, type LadderResult, type StepUpdate } from "./proof/ladder.ts";
import type { TaskLog } from "./tasklog.ts";

export type ToolExecutor = (call: ToolUse, ctx: { project: string }) => Promise<ToolResult>;

// What the checker is given: the project, the two snapshots to compare, a way to report each rung,
// and the stop signal. Tests pass a stand in; the default runs the real ladder.
export type ProofContext = { project: string; store: CheckpointStore; beforeId: string; afterId: string; onStep: (u: StepUpdate) => void; signal: AbortSignal };
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
  approvalTimeoutMs?: number;
  now?: () => Date;
};

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
      const p = Bun.spawn(["sh", "-c", String(i.command)], { cwd: project, env: buildChildEnv(process.env, { route: "plan" }), stdout: "pipe", stderr: "pipe", timeout: 120_000 });
      const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
      const code = await p.exited;
      return { ok: code === 0, output: (out + err).slice(0, 20_000) };
    }
    return { ok: true, output: "" };
  } catch (e) {
    return { ok: false, output: String((e as Error).message) };
  }
};

const summary = (c: ToolUse): string => {
  if (c.name === "Bash") return `Running: ${String(c.input.command).slice(0, 200)}`;
  if (c.input.file_path) return `${c.name}: ${String(c.input.file_path)}`;
  return c.name;
};

type PendingPlan = { project: string; model: string; budgetUsd: number; usd: number; sessionId?: string };

export class AgentRunner {
  private sessions = new Map<string, Session>();
  private plans = new Map<string, PendingPlan>();
  private driving = new Set<string>();
  private driveStop = new Set<string>();
  private choices = new Map<string, (c: string) => void>();
  private watchers = new Map<string, ProjectWatcher>();
  private pauseReq = new Map<string, { reason: string; path?: string }>();
  private resumers = new Map<string, (c: string) => void>();

  // Take the wheel: stop the current step now; the plan waits for the person to resume.
  private requestPause(agent: string, reason: string, path?: string) {
    if (!this.watchers.has(agent) || this.pauseReq.has(agent) || this.driveStop.has(agent)) return;
    this.pauseReq.set(agent, { reason, path });
    this.sessions.get(agent)?.abort.abort();
  }
  private counter = 0;
  private ledger: Ledger;
  constructor(private o: RunnerOptions) { this.ledger = o.ledger ?? new Ledger(":memory:"); }

  // What this project may still spend today.
  private room(project: string): number { return (this.o.dailyCeilingUsd ?? 10) - this.ledger.spentToday(project); }
  private dailyLimit(agent: string) { this.fail("daily_limit: this project has reached its daily limit. New work starts again tomorrow, or you can raise the limit.", agent); }

  private now() { return (this.o.now ?? (() => new Date()))(); }
  private emit<T extends Omit<Event, "v" | "id">>(e: T) {
    this.o.emit({ v: PROTOCOL_VERSION, id: `e${++this.counter}`, ts: this.now().toISOString(), ...e } as unknown as Event);
  }
  private state(agent: string, state: string) { this.emit({ type: "agent.state", agent, state } as never); }
  private fail(reason: string, agent?: string) { this.emit({ type: "protocol.error", reason, ...(agent ? { agent } : {}) } as never); }

  async handle(cmd: Command): Promise<void> {
    switch (cmd.type) {
      case "agent.start": await this.run(cmd); return;
      case "drive.plan": return this.drivePlan(cmd);
      case "drive.approve": return this.driveApprove(cmd);
      case "drive.pause": {
        if (!this.watchers.has(cmd.agent)) { this.fail("Nothing is running to pause.", cmd.agent); return; }
        this.requestPause(cmd.agent, cmd.reason); return;
      }
      case "drive.resume": {
        const r = this.resumers.get(cmd.agent);
        if (!r) { this.fail("The agent is not paused.", cmd.agent); return; }
        this.resumers.delete(cmd.agent); r("resume"); return;
      }
      case "loop.choose": {
        const r = this.choices.get(cmd.agent);
        if (!r) { this.fail("Nothing is waiting for an answer.", cmd.agent); return; }
        this.choices.delete(cmd.agent); r(cmd.choice); return;
      }
      case "agent.interrupt": { this.driveStop.add(cmd.agent); this.choices.get(cmd.agent)?.("interrupt"); this.resumers.get(cmd.agent)?.("interrupt"); this.sessions.get(cmd.agent)?.abort.abort(); this.cancelPending(cmd.agent); return; }
      case "agent.interruptAll": { for (const a of this.driving) { this.driveStop.add(a); this.choices.get(a)?.("interrupt"); this.resumers.get(a)?.("interrupt"); } for (const s of this.sessions.values()) { s.abort.abort(); this.cancelPending(s.agent); } return; }
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
    return new CheckpointStore(join(this.o.shadowRoot, `${id}.git`), project);
  }

  private async run(cmd: StartCmd, opts: { resumeSession?: string } = {}): Promise<{ status: string; usd: number; sessionId?: string; stuck?: { label: string; detail: string } }> {
    const room = this.room(cmd.project);
    if (room <= 0) { this.dailyLimit(cmd.agent); this.state(cmd.agent, "error"); return { status: "daily_limit", usd: 0 }; }
    const budget = Math.min(cmd.budgetUsd, room);
    const store = this.store(cmd.project);
    const lbl = makeLabel(cmd.prompt);
    const abort = new AbortController();
    const session: Session = { agent: cmd.agent, abort, pending: new Map() };
    this.sessions.set(cmd.agent, session);

    const before = await store.snapshot(`Before: ${lbl.slice(0, 60)}`);
    this.emit({ type: "checkpoint.created", project: cmd.project, agent: cmd.agent, checkpoint: before.id, label: `Before: ${lbl}`, files: before.files, skipped: before.skipped } as never);
    const taskId = this.o.log.start({ project: cmd.project, agent: cmd.agent, mode: cmd.mode, label: lbl, startedAt: this.now().toISOString() });
    this.state(cmd.agent, "thinking");

    let usd = 0, commands = 0, status = "done";
    const notUndoable: string[] = [];
    const exec = this.o.executor ?? defaultExecutor;
    let sessionId: string | undefined = opts.resumeSession;

    // One conversation with the engine. Returns false when the task must stop (stopped, over budget, error).
    const round = async (prompt: string, resumeSession?: string): Promise<boolean> => {
      const gen = this.o.engine.start({
        prompt, project: cmd.project, model: cmd.model, signal: abort.signal, budgetUsd: Math.max(0, budget - usd), resumeSession,
        authorize: (tool, id) => this.authorizeTool(cmd, session, tool, before.id, notUndoable, () => { commands++; }, id),
        toolDone: (id) => { if (id) this.watchers.get(cmd.agent)?.end(id); },
      });
      try {
        let next = await gen.next();
        while (!next.done) {
          if (abort.signal.aborted) { status = "interrupted"; return false; }
          const turn = next.value;
          if (turn.sessionId) sessionId = turn.sessionId;
          usd += turn.costUsd;
          this.emit({ type: "cost.update", agent: cmd.agent, usdEstimate: usd, basis: "sdk_estimate", tokens: { in: 0, cacheRead: 0, out: 0 } } as never);
          if (usd > budget) { status = "error_max_budget_usd"; this.fail("error_max_budget_usd: the spending limit was reached", cmd.agent); return false; }

          let result: ToolResult | undefined;
          if (turn.tool) {
            const a = await this.authorizeTool(cmd, session, turn.tool, before.id, notUndoable, () => { commands++; });
            try { result = a.allow ? await exec(turn.tool, { project: cmd.project }) : { ok: false, output: a.reason }; }
            finally { if (a.wid) this.watchers.get(cmd.agent)?.end(a.wid); }
            if (abort.signal.aborted) { status = "interrupted"; return false; }
          } else if (turn.text) {
            this.state(cmd.agent, "working");
          }
          next = await gen.next(result);
        }
        if (abort.signal.aborted) { status = "interrupted"; return false; }
        return true;
      } catch (e) {
        const msg = (e as Error).message;
        if (e instanceof EngineStop) usd += e.costUsd;
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
    let ok = await round(cmd.prompt, opts.resumeSession);
    for (let tries = 1; ; tries++) {
      const after = await store.snapshot(`After: ${lbl.slice(0, 60)}`);
      changed = await store.diff(before.id, after.id);
      if (!ok || status !== "done" || changed.length === 0 || abort.signal.aborted) break;

      this.state(cmd.agent, "checking");
      const onStep = (u: StepUpdate) => this.emit({ type: "proof.step", agent: cmd.agent, rung: u.rung, label: u.label, status: u.status, detail: u.detail, ms: u.ms } as never);
      let res: LadderResult;
      this.watchers.get(cmd.agent)?.begin("ladder");
      try {
        res = await (this.o.proof ?? runLadder)({ project: cmd.project, store, beforeId: before.id, afterId: after.id, onStep, signal: abort.signal });
      } catch (e) {
        res = { verdict: "failed", steps: [{ rung: "checks", label: "Checking the work", status: "failed", detail: `The checker itself stopped: ${(e as Error).message}`, ms: 0 }] };
      } finally { this.watchers.get(cmd.agent)?.end("ladder"); }
      this.emit({ type: "proof.result", agent: cmd.agent, verdict: res.verdict, steps: res.steps, tries } as never);
      if (res.verdict === "cancelled" || abort.signal.aborted) { status = "interrupted"; break; }
      if (res.verdict !== "failed") { if (res.verdict !== "nothing_to_check") proof = "passed"; break; }

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
    this.ledger.add(cmd.project, usd);
    this.o.log.finish(taskId, status, usd, this.now().toISOString(), { checkpoint: before.id, changed: changed.length, proof });
    this.emit({ type: "receipt", agent: cmd.agent, checkpoint: before.id, changed, commands, notUndoable, proof, usdEstimate: usd } as never);
    this.state(cmd.agent, status === "done" ? "done" : status === "interrupted" ? "idle" : "error");
    this.sessions.delete(cmd.agent);
    const stuck = proof === "failed" && sigs.length >= 3 && new Set(sigs.slice(-3)).size === 1 ? lastFailure : undefined;
    return { status, usd, sessionId, ...(stuck ? { stuck } : {}) };
  }

  // --- Drive: plan first (read only), then one approved step at a time ---

  private async drivePlan(cmd: Extract<Command, { type: "drive.plan" }>): Promise<void> {
    const room = this.room(cmd.project);
    if (room <= 0) { this.dailyLimit(cmd.agent); return; }
    const planBudget = Math.min(cmd.budgetUsd, room);
    const abort = new AbortController();
    const session: Session = { agent: cmd.agent, abort, pending: new Map() };
    this.sessions.set(cmd.agent, session);
    this.driving.add(cmd.agent);
    this.driveStop.delete(cmd.agent);
    this.plans.delete(cmd.agent);
    this.state(cmd.agent, "thinking");
    let usd = 0, sessionId: string | undefined;
    const exec = this.o.executor ?? defaultExecutor;
    // One reading round. Anything that is not a plain look is refused here, in code.
    const ask = async (prompt: string, resume?: string): Promise<string> => {
      let text = "";
      const authorize = async (tool: ToolUse) => {
        const ok = READ_ONLY_TOOLS.has(tool.name);
        this.emit({ type: "agent.tool", agent: cmd.agent, tool: tool.name, summary: summary(tool), toolUseId: `toolu_${randomBytes(4).toString("hex")}`, undoable: true, outcome: ok ? "ran" : "blocked" } as never);
        return ok ? { allow: true, reason: "" } : { allow: false, reason: "Blocked by Companion: planning can only look at the project, not change it." };
      };
      const gen = this.o.engine.start({ prompt, project: cmd.project, model: cmd.model, signal: abort.signal, budgetUsd: Math.max(0, planBudget - usd), resumeSession: resume, planOnly: true, authorize });
      try {
        let next = await gen.next();
        while (!next.done) {
          if (abort.signal.aborted) break;
          const turn = next.value;
          if (turn.sessionId) sessionId = turn.sessionId;
          usd += turn.costUsd;
          if (usd > planBudget) throw new EngineStop("error_max_budget_usd: the spending limit was reached");
          let result: ToolResult | undefined;
          if (turn.tool) {
            const a = await authorize(turn.tool);
            result = a.allow ? await exec(turn.tool, { project: cmd.project }) : { ok: false, output: a.reason };
          } else if (turn.text) text += turn.text + "\n";
          next = await gen.next(result);
        }
      } finally { try { await gen.return(undefined); } catch { /* finished */ } }
      return text;
    };
    try {
      let steps = parsePlan(await ask(planPrompt(cmd.goal)));
      if (steps.length > MAX_STEPS && !abort.signal.aborted) {
        const again = parsePlan(await ask(shortenPrompt(steps.length), sessionId));
        if (again.length) steps = again;
      }
      if (abort.signal.aborted) { this.state(cmd.agent, "idle"); return; }
      if (steps.length === 0) { this.fail("Claude did not give a usable plan. Try describing the goal in a little more detail.", cmd.agent); this.state(cmd.agent, "error"); return; }
      const truncated = steps.length > MAX_STEPS;
      const kept = steps.slice(0, MAX_STEPS);
      this.plans.set(cmd.agent, { project: cmd.project, model: cmd.model, budgetUsd: cmd.budgetUsd, usd, sessionId });
      this.emit({ type: "plan.ready", agent: cmd.agent, steps: kept.map((title, i) => ({ id: i + 1, title })), truncated, estimateUsd: estimateUsd(kept.length) } as never);
      this.state(cmd.agent, "needsYou");
    } catch (e) {
      const msg = (e as Error).message;
      this.fail(/^error_max_[a-z_]+/.test(msg) ? msg : `engine error: ${msg}`, cmd.agent);
      this.state(cmd.agent, "error");
    } finally {
      this.ledger.add(cmd.project, usd);
      this.sessions.delete(cmd.agent);
      this.driving.delete(cmd.agent);
    }
  }

  private async driveApprove(cmd: Extract<Command, { type: "drive.approve" }>): Promise<void> {
    const plan = this.plans.get(cmd.agent);
    if (!plan) { this.fail("There is no plan waiting for approval.", cmd.agent); return; }
    const steps = cmd.steps.map((s) => String(s).replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, MAX_STEPS);
    if (steps.length === 0) { this.fail("A plan needs at least one step.", cmd.agent); return; }
    this.plans.delete(cmd.agent);
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
      const p = this.pauseReq.get(cmd.agent);
      if (!p) return true;
      this.emit({ type: "drive.paused", agent: cmd.agent, reason: p.reason, ...(p.path ? { path: p.path } : {}) } as never);
      this.state(cmd.agent, "needsYou");
      const choice = await new Promise<string>((res) => this.resumers.set(cmd.agent, res));
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
        const stepCmd = (prompt: string): StartCmd => ({ v: PROTOCOL_VERSION, id: `${cmd.id}-s${index}`, type: "agent.start", project: plan.project, agent: cmd.agent, mode: "drive", prompt, model: plan.model, budgetUsd: remaining });
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
      watcher.stop(); this.watchers.delete(cmd.agent); this.pauseReq.delete(cmd.agent); this.resumers.delete(cmd.agent);
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
    const ruled = applyRules(loadRules(cmd.project).rules, { tool: tool.name, input: tool.input }, cmd.project);
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
    if (!verdict.undoable) notUndoable.push(String(tool.input.command ?? sum));
    this.state(cmd.agent, "working");
    if (verdict.decision === "allow") tell("ran");
    // From here until the tool finishes, file changes are the agent's own.
    const wid = sdkId ?? toolUseId;
    this.watchers.get(cmd.agent)?.begin(wid);
    return { allow: true, reason: "", wid };
  }
}

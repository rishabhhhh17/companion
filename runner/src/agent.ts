// Runs agent tasks: snapshot first, judge every tool call, ask the user when needed,
// stop at the spending limit, and finish with a receipt. The engine (real Claude or a
// scripted stand in) only supplies turns; everything safe happens here.

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Command, Event } from "../../protocol/index.ts";
import { PROTOCOL_VERSION } from "../../protocol/index.ts";
import { CheckpointStore } from "./checkpoints.ts";
import { EngineStop, type Engine, type ToolResult, type ToolUse } from "./engine.ts";
import { label as makeLabel } from "./redact.ts";
import { buildChildEnv, evaluate } from "./safety.ts";
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

export class AgentRunner {
  private sessions = new Map<string, Session>();
  private counter = 0;
  constructor(private o: RunnerOptions) {}

  private now() { return (this.o.now ?? (() => new Date()))(); }
  private emit<T extends Omit<Event, "v" | "id">>(e: T) {
    this.o.emit({ v: PROTOCOL_VERSION, id: `e${++this.counter}`, ts: this.now().toISOString(), ...e } as unknown as Event);
  }
  private state(agent: string, state: string) { this.emit({ type: "agent.state", agent, state } as never); }
  private fail(reason: string, agent?: string) { this.emit({ type: "protocol.error", reason, ...(agent ? { agent } : {}) } as never); }

  async handle(cmd: Command): Promise<void> {
    switch (cmd.type) {
      case "agent.start": return this.run(cmd);
      case "agent.interrupt": { this.sessions.get(cmd.agent)?.abort.abort(); this.cancelPending(cmd.agent); return; }
      case "agent.interruptAll": { for (const s of this.sessions.values()) { s.abort.abort(); this.cancelPending(s.agent); } return; }
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

  private async run(cmd: StartCmd): Promise<void> {
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
    let sessionId: string | undefined;

    // One conversation with the engine. Returns false when the task must stop (stopped, over budget, error).
    const round = async (prompt: string, resumeSession?: string): Promise<boolean> => {
      const gen = this.o.engine.start({
        prompt, project: cmd.project, model: cmd.model, signal: abort.signal, budgetUsd: Math.max(0, cmd.budgetUsd - usd), resumeSession,
        authorize: (tool) => this.authorizeTool(cmd, session, tool, before.id, notUndoable, () => { commands++; }),
      });
      try {
        let next = await gen.next();
        while (!next.done) {
          if (abort.signal.aborted) { status = "interrupted"; return false; }
          const turn = next.value;
          if (turn.sessionId) sessionId = turn.sessionId;
          usd += turn.costUsd;
          this.emit({ type: "cost.update", agent: cmd.agent, usdEstimate: usd, basis: "sdk_estimate", tokens: { in: 0, cacheRead: 0, out: 0 } } as never);
          if (usd > cmd.budgetUsd) { status = "error_max_budget_usd"; this.fail("error_max_budget_usd: the spending limit was reached", cmd.agent); return false; }

          let result: ToolResult | undefined;
          if (turn.tool) {
            const a = await this.authorizeTool(cmd, session, turn.tool, before.id, notUndoable, () => { commands++; });
            result = a.allow ? await exec(turn.tool, { project: cmd.project }) : { ok: false, output: a.reason };
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
    let changed: Awaited<ReturnType<CheckpointStore["diff"]>> = [];
    let ok = await round(cmd.prompt);
    for (let tries = 1; ; tries++) {
      const after = await store.snapshot(`After: ${lbl.slice(0, 60)}`);
      changed = await store.diff(before.id, after.id);
      if (!ok || status !== "done" || changed.length === 0 || abort.signal.aborted) break;

      this.state(cmd.agent, "checking");
      const onStep = (u: StepUpdate) => this.emit({ type: "proof.step", agent: cmd.agent, rung: u.rung, label: u.label, status: u.status, detail: u.detail, ms: u.ms } as never);
      let res: LadderResult;
      try {
        res = await (this.o.proof ?? runLadder)({ project: cmd.project, store, beforeId: before.id, afterId: after.id, onStep, signal: abort.signal });
      } catch (e) {
        res = { verdict: "failed", steps: [{ rung: "checks", label: "Checking the work", status: "failed", detail: `The checker itself stopped: ${(e as Error).message}`, ms: 0 }] };
      }
      this.emit({ type: "proof.result", agent: cmd.agent, verdict: res.verdict, steps: res.steps, tries } as never);
      if (res.verdict === "cancelled" || abort.signal.aborted) { status = "interrupted"; break; }
      if (res.verdict !== "failed") { if (res.verdict !== "nothing_to_check") proof = "passed"; break; }

      proof = "failed"; status = "not_done";
      if (tries >= MAX_TRIES || usd >= cmd.budgetUsd) { if (usd >= cmd.budgetUsd) status = "error_max_budget_usd"; break; }
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
    this.emit({ type: "receipt", agent: cmd.agent, checkpoint: before.id, changed, commands, notUndoable, proof, usdEstimate: usd } as never);
    this.o.log.finish(taskId, status, usd, this.now().toISOString());
    this.state(cmd.agent, status === "done" ? "done" : status === "interrupted" ? "idle" : "error");
    this.sessions.delete(cmd.agent);
  }

  // Judge one tool call. Returns whether it may run. Used by the runner for scripted engines
  // and by the real engine's PreToolUse hook; either way the safety rules are the same.
  private async authorizeTool(cmd: StartCmd, s: Session, tool: ToolUse, checkpoint: string, notUndoable: string[], countCommand: () => void): Promise<{ allow: boolean; reason: string }> {
    const toolUseId = `toolu_${randomBytes(4).toString("hex")}`;
    const verdict = evaluate({ tool: tool.name, input: tool.input }, { project: cmd.project });
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
    return { allow: true, reason: "" };
  }
}

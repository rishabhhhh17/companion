// One case's run through Companion's own runner (AgentRunner, in this process): the same snapshots, safety rules, proof
// ladder, loop card and receipts the app gets. Only the engine differs: a stand in in a dry run, real Claude in a spend run.
import { AgentRunner, type ProofRunner } from "../../runner/src/agent.ts";
import { ScriptedEngine, type Engine, type Step } from "../../runner/src/engine.ts";
import { Ledger } from "../../runner/src/ledger.ts";
import { MAX_DAILY_LIMIT_USD } from "../../runner/src/spending.ts";
import { TaskLog } from "../../runner/src/tasklog.ts";
import { shq } from "../../runner/src/proof/exec.ts";
import type { Command, Event } from "../../protocol/index.ts";
import type { TextAsk } from "./harness.ts";
import { removeDir, tempDir, type FixStep } from "./project.ts";

export const AGENT = "eval-1";
type Ev = Event & Record<string, any>;

export type SessionOptions = {
  project: string;
  engine: Engine;
  /** The second model review (proof rung 7). Off unless given. */
  reviewer?: Engine;
  reviewModel?: string;
  /** Explain after each finished task. Off unless given. */
  explainer?: TextAsk;
  /** The proof ladder; the real one unless a set says otherwise (Explain does not need it). */
  proof?: ProofRunner;
  /** What the eval answers when Companion asks for approval. A real person might say yes; the eval says yes only to a settings card (the default) unless told. "settings" says yes to a card
   *  about adding a harmless setting to a private settings file (the person would tap that) and no to every other. */
  approvals?: "deny" | "allow" | "settings";
  /** What the eval presses on the loop card: "Try a different approach" (what the card is for) or "Stop here". */
  onStuck?: "different" | "stop";
  /** The case's signal (runSet): aborted at a refusal or a spending stop, which stops everything at once, as Stop does. */
  signal?: AbortSignal;
};

export class EvalSession {
  readonly events: Ev[] = [];
  readonly approvalsAsked: string[] = [];
  readonly runner: AgentRunner;
  private shadow = tempDir("shadow");
  private n = 0;
  constructor(private o: SessionOptions) {
    this.runner = new AgentRunner({
      shadowRoot: this.shadow, engine: o.engine, log: new TaskLog(":memory:"), ledger: new Ledger(":memory:"),
      // The eval's own caps are the spending stop; the project's daily limit is set out of the way.
      dailyCeilingUsd: MAX_DAILY_LIMIT_USD, emit: (e) => this.seen(e as Ev),
      ...(o.reviewer ? { reviewer: o.reviewer, reviewModel: o.reviewModel } : {}),
      ...(o.explainer ? { explainer: o.explainer } : {}),
      ...(o.proof ? { proof: o.proof } : {}),
    });
    o.signal?.addEventListener("abort", () => void this.send({ type: "agent.interruptAll", reason: "the eval's harness stopped this case" }), { once: true });
  }
  private seen(e: Ev) {
    this.events.push(e);
    // Answered on the next tick, the way the app's card answers: never inside the event itself.
    if (e.type === "approval.request") {
      this.approvalsAsked.push(String(e.title));
      setTimeout(() => void this.send({ type: "approval.resolve", approval: e.approval, decision: this.o.approvals === "allow" || ((this.o.approvals ?? "settings") === "settings" && e.risk === "settings") ? "allow" : "deny", scope: "once" }), 0);
    }
    if (e.type === "loop.stuck") setTimeout(() => void this.send({ type: "loop.choose", agent: AGENT, choice: this.o.onStuck ?? "different" }), 0);
  }
  send(cmd: Record<string, unknown>): Promise<void> {
    return this.runner.handle({ v: 1, id: `eval${++this.n}`, ...cmd } as unknown as Command);
  }
  /** Sends a command and waits for it to finish, stopping everything if it takes longer than the case may. */
  async run(cmd: Record<string, unknown>, timeoutMs: number): Promise<boolean> {
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; void this.send({ type: "agent.interruptAll", reason: "the eval's time limit" }); }, timeoutMs);
    try { await this.send(cmd); } finally { clearTimeout(timer); }
    if (timedOut) this.timeouts.push(`${String(cmd.type)} ran out of time (${Math.round(timeoutMs / 1000)} seconds) and was stopped.`);
    return !timedOut;
  }
  /** Plain notes for every command that ran out of time; a case's results carry them. */
  readonly timeouts: string[] = [];
  of(type: string): Ev[] { return this.events.filter((e) => e.type === type); }
  last(type: string): Ev | undefined { return this.of(type).at(-1); }
  /** Waits until a condition holds (checked every 20 ms); false if the time ran out first. */
  async until(cond: () => boolean, timeoutMs: number): Promise<boolean> {
    const end = Date.now() + timeoutMs;
    while (!cond()) { if (Date.now() > end) return false; await Bun.sleep(20); }
    return true;
  }
  async close() {
    await this.send({ type: "agent.interruptAll", reason: "the case is over" });
    await this.runner.background();
    removeDir(this.shadow);
  }
}

/** A reference change as the turns a scripted agent plays: each step through Companion's own Write, Edit or a shell rm. */
export function stepsToTurns(steps: FixStep[], say?: string, costUsd = 0): Step[] {
  const turns: Step[] = steps.map((s) => "edit" in s
    ? { tool: { name: "Edit", input: { file_path: s.edit, old_string: s.old, new_string: s.new } }, costUsd }
    : "write" in s ? { tool: { name: "Write", input: { file_path: s.write, content: s.content } }, costUsd }
    : { tool: { name: "Bash", input: { command: `rm ${shq(s.delete)}` } }, costUsd });
  if (say) turns.push({ text: say, costUsd });
  return turns;
}
export const scripted = (rounds: Step[][]) => new ScriptedEngine(rounds);

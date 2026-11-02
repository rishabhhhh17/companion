// The plan gate (F25, T17, payments spec sections 2, 2a, 3 and 9): what Free allows, checked only when a counted fix or a
// Pro feature starts. The shell decides the plan from the license key and the trial and tells the engine (plan.state); the
// engine never sees the key. Until a plan.state with paymentsOn true arrives, and whenever payments are off, nothing is
// gated, nothing is counted, nothing is written and nothing is said: Companion behaves exactly as before payments.
//
// The rules that never bend:
//  - A running task is never stopped, slowed or downgraded because the plan changed. The gate is asked only as a command
//    arrives (main.ts dispatch); it holds no reference to any task and nothing here can end one.
//  - Safety, Undo, Bring the fix back, Stop, approvals, the checks and receipts are never gated (NEVER_GATED).
//  - A fix counts once, when it is proven (agent.ts tells proven() on a done task whose checks passed, M45's "proven").
//    The limit is checked as a fix starts, so a fix admitted but not yet proven holds a place until it is proven or its task
//    ends (ended()): two fixes started together on 2 of 3 used cannot both be admitted.
//    Failed, stopped and unproven tasks do not count; a follow up, a Try again and the steps of one plan count once with
//    the fix they carry on; practice copies never count. Undo does not give a fix back and Bring back never counts again:
//    the count changes only when a fix is proven, so fix, Undo, new fix, Bring back can never keep more than the limit.
//  - Local counts are honest user checks (spec section 5): kept on this Mac, in tasks.db, wiped by Delete everything.
import { randomBytes } from "node:crypto";
import { basename, resolve } from "node:path";
import type { Command, PlanLimitReason, PlanName, PlanState } from "../../protocol/index.ts";
import { defOf } from "../../protocol/settings.ts";
import { NAMES } from "./names.ts";

/** Free's proven fixes per calendar month (the founder's call, spec section 16: 3). */
export const FREE_FIXES_PER_MONTH = 3;

// ---------- the command lists (spec section 2a) ----------
// Every type of protocol/index.ts's Command union is in exactly one of these three. The compile time checks under them fail
// for a type in none, or a name that is not a type; runner/test/plan.test.ts fails for a type in two, or one the protocol's
// checks know and these do not.

/** Gated as a counted fix (the Free limit). How each is gated is in PlanGate.admit. */
export const FIX_GATED = ["agent.start", "drive.plan", "drive.approve", "watch.fix", "rescue.diagnose", "agent.send", "review.fix"] as const;
/** Gated as Pro only. settings.apply only for a water colour that is not the usual one; every other setting is never gated. */
export const PRO_ONLY = ["ship.check", "ship.preview", "ship.live", "recap.ask", "settings.apply"] as const;
/** Never gated, on any plan, at any count. */
export const NEVER_GATED = [
  // the plan itself
  "plan.state",
  // stopping
  "agent.interrupt", "agent.interruptAll", "drive.pause", "drive.resume",
  // Undo and restore
  "checkpoint.restore", "checkpoint.putBack", "bisect.undo", "ship.rollback",
  // approvals
  "approval.resolve",
  // checks and proof
  "browser.check", "browser.install", "doctor.check", "problem.find", "secondlook.check", "teach.try", "teach.check",
  // help
  "error.explain", "assist.prompt", "assist.locate", "assist.cancel", "assist.image",
  "walk.list", "walk.start", "walk.acted", "walk.answer", "walk.skip", "walk.stop", "research.ask", "diagram.ask",
  // everything else
  "memory.add", "memory.list", "memory.forget", "memory.edit", "memory.pause", "memory.erase", "memory.export", "memory.agents",
  "tasks.list", "where.was.i", "spending.show", "spending.set", "metrics.set", "metrics.note", "metrics.show", "metrics.erase",
  "watch.add", "watch.list", "watch.remove", "watch.pause", "watch.check", "bisect.start", "project.inspect", "project.install",
  "project.clone", "auth.check", "google.accounts", "engine.warm", "runner.ping", "loop.choose", "explain.set",
  // M52: reviewing a change and closing its card (a review spends only against the daily limit, like Explain).
  "review.now", "review.dismiss",
] as const;

type Listed = (typeof FIX_GATED)[number] | (typeof PRO_ONLY)[number] | (typeof NEVER_GATED)[number];
type Unlisted = Exclude<Command["type"], Listed>;
type NotACommand = Exclude<Listed, Command["type"]>;
// A Command type in none of the lists, or a listed name that is no Command type, makes these fail to compile.
const everyCommandIsListed: [Unlisted] extends [never] ? true : Unlisted = true;
const everyNameIsACommand: [NotACommand] extends [never] ? true : NotACommand = true;
void everyCommandIsListed; void everyNameIsACommand;

// ---------- months, in this Mac's local time ----------

const two = (n: number) => String(n).padStart(2, "0");
/** This Mac's local month, YYYY-MM: the free fixes come back on the 1st, local time. */
export const monthOf = (d: Date): string => `${d.getFullYear()}-${two(d.getMonth() + 1)}`;
/** The 1st of next month, local time, YYYY-MM-DD: when this month's free fixes come back. */
export const resetsOnOf = (d: Date): string => { const n = new Date(d.getFullYear(), d.getMonth() + 1, 1); return `${n.getFullYear()}-${two(n.getMonth() + 1)}-01`; };

// ---------- what is gated ----------

/** The usual water colour (protocol/settings.json): free on every plan. Every other colour is Pro. */
export const USUAL_WATER = String(defOf("look.water")?.default ?? "");
/** Whether a settings.apply asks for a water colour only Pro has. Theme, size, liveliness, text size and motion never are. */
export const asksProLook = (values: Record<string, unknown> | undefined): boolean =>
  !!values && Object.hasOwn(values, "look.water") && values["look.water"] !== USUAL_WATER;

/** A practice copy: a task that names its practice, in a folder named the way Companion names its copies (protocol/names.json
 *  practiceCopyBase, or a base it had before a rename). A practice named on any other folder is an ordinary fix. */
export function isPracticeCopy(practice: unknown, project: string): boolean {
  if (typeof practice !== "string" || !practice) return false;
  return isPracticeFolder(project);
}
/** A folder named the way Companion names its practice copies. A lesson's own file check sends ship.check on it with no
 *  practice name (card.tsx), so that check alone goes by the folder. */
export function isPracticeFolder(project: string): boolean {
  const name = basename(resolve(project));
  return [NAMES.practiceCopyBase, ...NAMES.earlierPracticeCopyBases].some((b) => name === b || name.startsWith(`${b} `));
}

// ---------- the gate ----------

/** Where the counted fixes are kept (db.ts FreeFixes). Opened only on first use, so with payments off nothing is touched. */
export type FixStore = { count(month: string): number; record(ticket: string, task: number | null, month: string, at: string): boolean; any(): boolean };
/** What agent.ts needs: which admitted fix a task belongs to (read as the task starts), and the word that it was proven. */
export type FixCounter = { ticketOf(agent: string): string | undefined; proven(ticket: string | undefined, task: number | null): void; ended?(ticket: string | undefined): void };

/** One admitted fix. counted: under the Free rules, so it counts once when proven; practice: never counts. plan: admitted
 *  as a Drive plan (drive.plan), so approving that plan is free. */
type Ticket = { id: string; kind: "counted" | "practice"; plan: boolean };

type Say = (e: Record<string, unknown>) => void;
export type GateOptions = { fixes: () => FixStore; emit: Say; now?: () => Date; limit?: number };

export class PlanGate implements FixCounter {
  private plan: PlanName = "free";
  private trialEndsAt: number | null = null;
  private paymentsOn = false;   // fail open: nothing is gated until the shell says payments are on
  private byAgent = new Map<string, Ticket>();
  private issued = new Map<string, Ticket>();
  /** Counted tickets admitted and neither proven nor ended yet: each holds a place against the limit. */
  private inFlight = new Set<string>();
  private store: FixStore | null = null;
  private now: () => Date;
  readonly limit: number;
  constructor(private o: GateOptions) { this.now = o.now ?? (() => new Date()); this.limit = o.limit ?? FREE_FIXES_PER_MONTH; }

  /** The shell's plan.state. Nothing running is touched: the next command that starts something follows it. */
  setState(cmd: Pick<PlanState, "plan" | "paymentsOn" | "trialEndsAt">): void {
    this.plan = cmd.plan;
    this.paymentsOn = cmd.paymentsOn === true;
    const t = cmd.plan === "trial" && typeof cmd.trialEndsAt === "string" ? Date.parse(cmd.trialEndsAt) : NaN;
    this.trialEndsAt = Number.isFinite(t) ? t : null;
    if (this.paymentsOn) this.sayUsage();
  }

  /** The plan new work follows now, or null while payments are off (nothing is gated). A trial ends by itself at its
   *  trialEndsAt, with no timer: the next command after it follows the Free rules. */
  planNow(): PlanName | null {
    if (!this.paymentsOn) return null;
    if (this.plan === "trial" && this.trialEndsAt !== null && this.now().getTime() >= this.trialEndsAt) return "free";
    return this.plan;
  }
  private metered(): boolean { return this.planNow() === "free"; }

  /** This month's count, as plan.usage says it. */
  usage(): { used: number; limit: number; resetsOn: string; everUsed: boolean } {
    const now = this.now(), s = this.fixes();
    return { used: s.count(monthOf(now)), limit: this.limit, resetsOn: resetsOnOf(now), everUsed: s.any() };
  }

  /** The command to run, or null when the plan does not cover it (plan.limit was said). Only a settings.apply can come back
   *  changed: without the water colour Free does not have. */
  admit(cmd: Command): Command | null {
    if ((NEVER_GATED as readonly string[]).includes(cmd.type)) return cmd;
    const metered = this.metered();
    switch (cmd.type) {
      // Pro only.
      // A practice lesson checks its copy's files through ship.check: that check stays free. Going online never does.
      case "ship.check": return metered && !isPracticeFolder(cmd.project) ? this.refuse(cmd, "ship") : cmd;
      case "ship.preview": case "ship.live": return metered ? this.refuse(cmd, "ship") : cmd;
      case "recap.ask": return metered ? this.refuse(cmd, "recaps") : cmd;
      case "settings.apply": {
        // Sent by the shell, not tapped: the colour is left at the usual one (the page shows the Pro tag) and nothing is said.
        if (!metered || !asksProLook(cmd.values)) return cmd;
        const { ["look.water"]: _w, ...values } = cmd.values;
        return { ...cmd, values };
      }
      // Counted fixes.
      case "agent.start": {
        if (cmd.mode === "research") { this.drop(cmd.agent); return cmd; }   // Research writes no code: never a fix
        if (cmd.mode === "ship") { if (metered) return this.refuse(cmd, "ship"); this.drop(cmd.agent); return cmd; }
        if (!metered) { this.drop(cmd.agent); return cmd; }
        if (isPracticeCopy(cmd.practice, cmd.project)) { this.give(cmd.agent, "practice", false); return cmd; }
        return this.startFix(cmd, false);
      }
      case "drive.plan": {
        if (!metered) { this.drop(cmd.agent); return cmd; }
        return this.startFix(cmd, true);
      }
      case "drive.approve": {
        // A plan the gate admitted on drive.plan carries on free. Anything else (a Rescue plan: finding the problem was
        // free, and this is where the diagnosis turns into edits) is gated like a start.
        if (!metered || this.byAgent.get(cmd.agent)?.plan) return cmd;
        return this.startFix(cmd, false);
      }
      case "rescue.diagnose": {
        // Check my project stays free. Its plan is not admitted yet: drive.approve is.
        this.drop(cmd.agent);
        return cmd;
      }
      case "agent.send": {
        // A follow up or Try again on a fix the gate admitted counts once with it. Any other task is gated like a start.
        if (!metered || this.byAgent.has(cmd.agent)) return cmd;
        return this.startFix(cmd, false);
      }
      case "review.fix": {
        // Fix it from a review (M52): the task it starts is an agent.start, admitted (and counted) then, in main.ts. At the
        // limit the card says so before anything is started.
        return metered && this.atLimit() ? this.refuse(cmd, "fixes") : cmd;
      }
      case "watch.fix": {
        // Only the evidence is read here; the task it leads to is an agent.start, admitted (and counted) then. At the limit
        // the card says so before any evidence is gathered.
        return metered && this.atLimit() ? this.refuse(cmd, "fixes") : cmd;
      }
    }
    return cmd;
  }

  /** Which admitted fix this agent's task belongs to. agent.ts reads it as a task starts, so a later command cannot change it. */
  ticketOf(agent: string): string | undefined { return this.byAgent.get(agent)?.id; }

  /** A task of this ticket ended done with its checks passed. A counted fix is counted once; nothing else is. Never throws:
   *  counting is never worth a task's result. */
  proven(ticket: string | undefined, task: number | null): void {
    const t = ticket ? this.issued.get(ticket) : undefined;
    if (!t || t.kind !== "counted") return;
    this.inFlight.delete(t.id);   // from here the count holds it
    try {
      const now = this.now();
      if (this.fixes().record(t.id, task, monthOf(now), now.toISOString()) && this.paymentsOn) this.sayUsage();
    } catch { /* a count that cannot be written fails open */ }
  }

  /** A task of this ticket ended (done or not, proven or not). A fix that was never proven gives its place back; one that was
   *  proven already did. Nothing is counted here. */
  ended(ticket: string | undefined): void { if (ticket) this.inFlight.delete(ticket); }

  private fixes(): FixStore { return (this.store ??= this.o.fixes()); }
  /** Whether the month's proven fixes plus the ones started and not yet proven reach the limit. `agent` is the one asking:
   *  the fix it holds is replaced by the new one, so it holds no place of its own. */
  private atLimit(agent?: string): boolean {
    try {
      const own = agent ? this.byAgent.get(agent) : undefined;
      const held = this.inFlight.size - (own && this.inFlight.has(own.id) ? 1 : 0);
      return this.fixes().count(monthOf(this.now())) + held >= this.limit;
    } catch { return false; }   // a count that cannot be read fails open
  }
  /** The agent holds no admitted fix any more (a start that is not counted); a place it held is given back. */
  private drop(agent: string): void {
    const t = this.byAgent.get(agent);
    if (t) this.inFlight.delete(t.id);
    this.byAgent.delete(agent);
  }
  private give(agent: string, kind: Ticket["kind"], plan: boolean): Ticket {
    const t: Ticket = { id: `fx_${randomBytes(6).toString("hex")}`, kind, plan };
    const old = this.byAgent.get(agent);
    if (old) this.inFlight.delete(old.id);   // replaced: its task, if it never ran, holds no place
    this.byAgent.set(agent, t);
    this.issued.set(t.id, t);
    if (kind === "counted") this.inFlight.add(t.id);
    // Only the tickets agents hold, and the latest few a running task may still name, are kept.
    if (this.issued.size > 256) { const held = new Set([...this.byAgent.values()].map((x) => x.id)); for (const id of this.issued.keys()) { if (this.issued.size <= 128) break; if (!held.has(id)) this.issued.delete(id); } }
    return t;
  }
  private startFix(cmd: Command & { agent: string }, plan: boolean): Command | null {
    if (this.atLimit(cmd.agent)) return this.refuse(cmd, "fixes");
    this.give(cmd.agent, "counted", plan);
    return cmd;
  }
  private refuse(cmd: Command, reason: PlanLimitReason): null {
    const c = cmd as { type: string; agent?: unknown; project?: unknown };
    this.o.emit({
      type: "plan.limit", reason, command: c.type,
      ...(reason === "fixes" ? { resetsOn: resetsOnOf(this.now()) } : {}),
      ...(typeof c.agent === "string" && c.agent ? { agent: c.agent } : {}),
      ...(typeof c.project === "string" && c.project ? { project: c.project } : {}),
    });
    if (reason === "fixes") this.sayUsage();
    return null;
  }
  private sayUsage() {
    try { this.o.emit({ type: "plan.usage", ...this.usage() }); } catch { /* a count that cannot be read says nothing */ }
  }
}

// M79: payments built and switched off. On the engine's side: Undo and Stop always work at any limit (and the weekly
// summary is never gated), and with payments off nothing is gated at all. The shell's side (the remote switch, the report
// key) is tested in remoteswitch.rs and reportkey.rs; the pages' side in app/src/m79.test.ts.
import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { FreeFixes } from "../src/db.ts";
import { NEVER_GATED, PlanGate } from "../src/plan.ts";
import type { Command } from "../../protocol/index.ts";

const P = "/Users/me/site";
const cmd = (type: string, extra: Record<string, unknown> = {}) => ({ v: 1, id: `c_${type}`, type, project: P, ...extra }) as unknown as Command;

describe("Undo and Stop at any limit", () => {
  test("at the free limit, every way to stop and to undo still goes through, and so does the weekly summary", () => {
    const said: unknown[] = [];
    const gate = new PlanGate({ fixes: () => new FreeFixes(new Database(":memory:")), emit: (e) => said.push(e), limit: 0 });
    gate.setState({ plan: "free", paymentsOn: true });
    // A new fix is held back at the limit...
    expect(gate.admit(cmd("agent.start", { agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 1 }))).toBeNull();
    // ...but nothing that stops or undoes ever is.
    for (const t of ["agent.interrupt", "agent.interruptAll", "drive.pause", "checkpoint.restore", "checkpoint.putBack", "bisect.undo", "ship.rollback", "approval.resolve", "week.show"]) {
      expect((NEVER_GATED as readonly string[]).includes(t), t).toBe(true);
      const c = cmd(t, { agent: "a", checkpoint: "cp_1", reason: "x" });
      expect(gate.admit(c), t).toBe(c);
    }
  });
  test("with payments off (today), nothing is gated, at any count", () => {
    const gate = new PlanGate({ fixes: () => { throw new Error("the count must not be opened with payments off"); }, emit: () => {}, limit: 0 });
    gate.setState({ plan: "free", paymentsOn: false });
    const c = cmd("agent.start", { agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 1 });
    expect(gate.admit(c)).toBe(c);
    expect(gate.planNow()).toBeNull();
  });
});

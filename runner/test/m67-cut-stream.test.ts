// M67 bug bash fix (shortlist item 6, release gates): a stream that is cut off, or ends on Claude Code's own failed request
// note, ends as a failure, never as done. A fake query only: no Claude runs and nothing is spent.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SdkEngine } from "../src/sdkEngine.ts";
import { AgentRunner } from "../src/agent.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `m67-cut-${l}-`))); made.push(d); return d; };
const fakeQuery = (messages: any[]) => (_p: any) => (async function* () { for (const m of messages) yield m; })();
const assistant = (text: string, extra: Record<string, unknown> = {}) => ({ type: "assistant", message: { content: [{ type: "text", text }] }, ...extra });
const result = { type: "result", subtype: "success", total_cost_usd: 0.01, result: "Done.", usage: {} };

async function run(messages: any[]) {
  const project = tmp("p"); writeFileSync(join(project, "a.txt"), "x");
  const events: any[] = [];
  const engine = new SdkEngine({ claudeBinary: "/x/claude", env: {}, queryFn: fakeQuery(messages) as any });
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), approvalTimeoutMs: 20 });
  await runner.handle({ v: 1, id: "c", type: "agent.start", project, agent: "a", mode: "drive", prompt: "make the title blue", model: "m", budgetUsd: 3 } as any);
  return { receipt: events.find((e) => e.type === "receipt") as any, failed: events.filter((e) => e.type === "agent.failed" || e.type === "protocol.error") as any[], events };
}

describe("a cut stream", () => {
  test("half an answer and then the end, with no result: failed, not done", async () => {
    const { receipt } = await run([assistant("I will change the title. First I")]);
    expect(receipt?.ended).not.toBe("done");
  });
  test("an answer that ends on the failed request note: failed and named as out of reach", async () => {
    const { receipt, events } = await run([assistant("Partial words"), assistant("API Error: Connection error.", { error: "unknown" })]);
    expect(receipt?.ended).not.toBe("done");
    expect(JSON.stringify(events)).toMatch(/no_connection|reach/i);
  });
  test("a whole answer with its result still ends as done", async () => {
    const { receipt } = await run([assistant("The title is already blue."), result]);
    expect(receipt?.ended).toBe("done");
  });
});

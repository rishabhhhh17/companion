// Bug bash (Ask flow): an answer whose stream is cut halfway must never end as done. Fake `query` only: no Claude runs.
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
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `bugbash-${l}-`))); made.push(d); return d; };
const fakeQuery = (messages: any[]) => (_params: any) => (async function* () { for (const m of messages) yield m; })();
const assistant = (text: string, extra: Record<string, unknown> = {}) => ({ type: "assistant", message: { content: [{ type: "text", text }] }, ...extra });

async function runWith(messages: any[]) {
  const project = tmp("proj"); writeFileSync(join(project, "a.txt"), "x");
  const events: Event[] = [];
  const engine = new SdkEngine({ claudeBinary: "/x/claude", env: {}, queryFn: fakeQuery(messages) as any });
  const runner = new AgentRunner({ shadowRoot: tmp("shadow"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), approvalTimeoutMs: 20 });
  await runner.handle({ v: 1, id: "c", type: "agent.start", project, agent: "a", mode: "drive", prompt: "make the title blue", model: "m", budgetUsd: 3 } as any);
  return events;
}

describe("a cut stream", () => {
  test("the SDK stream ends after half an answer, with no result message: not done", async () => {
    const ev = await runWith([assistant("I will change the title. First I")]);
    const receipt = ev.find((e) => e.type === "receipt") as any;
    const last = ev.filter((e) => e.type === "agent.state").at(-1) as any;
    console.log("receipt.ended =", receipt?.ended, " last agent.state =", last?.state);
    expect(receipt?.ended).not.toBe("done");
  });
  test("the last message is Claude Code's own failed request note, and then the stream ends: not done", async () => {
    const ev = await runWith([assistant("Partial words"), assistant("API Error: Connection error.", { error: "unknown" })]);
    const receipt = ev.find((e) => e.type === "receipt") as any;
    console.log("receipt.ended =", receipt?.ended);
    expect(receipt?.ended).not.toBe("done");
  });
});

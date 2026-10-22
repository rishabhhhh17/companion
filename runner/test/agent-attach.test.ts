// Files into the ask box, in the engine: what a request carries is checked again, text files follow the request, and
// pictures are looked at first (the way Show me looks at a screen picture) so only the words said about them reach the task.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { Ledger } from "../src/ledger.ts";
import { TaskLog } from "../src/tasklog.ts";
import { toBase64 } from "../src/attach.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-att-${l}-`))); made.push(d); return d; };
const write = (f: string, c: string, costUsd = 0.01): Step => ({ tool: { name: "Write", input: { file_path: f, content: c } }, costUsd });
const good = (): LadderResult => ({ verdict: "passed", steps: [{ rung: "tests", label: "Running the tests", status: "passed", detail: "", ms: 1 } as never] });
const bad = (): LadderResult => { const s = { rung: "tests", label: "Running the tests", status: "failed", detail: "1 failed", ms: 1 } as never; return { verdict: "failed", steps: [s], failedAt: s }; };
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const PNG = toBase64(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]));
const KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123";

type Describer = NonNullable<ConstructorParameters<typeof AgentRunner>[0]["describer"]>;
function setup(rounds: Step[][], o: { describer?: Describer; proofs?: LadderResult[] } = {}) {
  const project = tmp("p");
  writeFileSync(join(project, "a.txt"), "original");
  const events: Event[] = [];
  const engine = new ScriptedEngine(rounds);
  const log = new TaskLog(":memory:");
  const ledger = new Ledger(":memory:");
  let n = 0;
  const proofs = o.proofs ?? [good()];
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log, ledger, emit: (e) => events.push(e), proof: async () => proofs[Math.min(n++, proofs.length - 1)], ...(o.describer ? { describer: o.describer } : {}) });
  const start = (extra: Record<string, unknown> = {}) => runner.handle({ v: 1, id: "c1", type: "agent.start", project, agent: "builder-1", mode: "drive", prompt: "Make the signup button match", model: "m", budgetUsd: 3, ...extra } as never);
  return { project, events, engine, log, ledger, runner, start };
}

describe("text files with a request", () => {
  test("they follow the request, named, with secrets hidden again; the task's name and memory use only the request", async () => {
    const r = setup([[write("a.txt", "v1")]]);
    await r.start({ files: [{ name: "notes.md", text: `Use the brand blue.\nkey ${KEY}` }] });
    const prompt = r.engine.calls[0].prompt;
    expect(prompt.startsWith("Make the signup button match\n\n")).toBe(true);
    expect(prompt).toContain("--- File: notes.md ---\nUse the brand blue.");
    expect(prompt).not.toContain(KEY);
    expect(r.log.list()[0].label).toBe("Make the signup button match");
    expect(of(r.events, "receipt").length).toBe(1);
  });
  test("a document's text (a PDF, Word or Excel file read on this Mac) follows the request under the document's name", async () => {
    const r = setup([[write("a.txt", "v1")]]);
    await r.start({ files: [{ name: "Invoice March.pdf", text: `Invoice total 42 dollars.\nkey ${KEY}` }, { name: "budget.xlsx", text: "Sheet: Sales\nItem,Price\nBread,4.5" }] });
    const prompt = r.engine.calls[0].prompt;
    expect(prompt).toContain("--- File: Invoice March.pdf ---\nInvoice total 42 dollars.");
    expect(prompt).toContain("--- File: budget.xlsx ---\nSheet: Sales\nItem,Price\nBread,4.5\n--- End of budget.xlsx ---");
    expect(prompt).not.toContain(KEY);
    expect(r.log.list()[0].label).toBe("Make the signup button match");
  });
  test("off the record, a later round says the request again with its files (no conversation was saved)", async () => {
    const r = setup([[write("a.txt", "v1")], [write("a.txt", "v2")]], { proofs: [bad(), good()] });
    await r.start({ offTheRecord: true, files: [{ name: "notes.md", text: "Use the brand blue." }] });
    expect(r.engine.calls.length).toBe(2);
    expect(r.engine.calls[1].prompt).toContain("--- File: notes.md ---");
  });
  test("a settings or key file, or anything else off, refuses the whole request: nothing is snapshotted or started", async () => {
    for (const files of [[{ name: ".env", text: "A=1" }], [{ name: "a/b.md", text: "x" }], [{ name: "doc.pages", text: "x" }]]) {
      const r = setup([[write("a.txt", "v1")]]);
      await r.start({ files });
      expect(r.engine.calls.length).toBe(0);
      expect(of(r.events, "checkpoint.created").length).toBe(0);
      expect(of(r.events, "protocol.error")[0]?.reason).toMatch(/nothing was started/i);
    }
  });
});

describe("pictures with a request", () => {
  test("they are looked at first, and only the words said about them go to the task; the cost is the task's", async () => {
    const asked: { images: { mediaType: string; base64: string }[]; question: string }[] = [];
    const r = setup([[write("a.txt", "v1")]], { describer: async (req) => { asked.push(req); return { text: "A blue button that says Join. Error: 404 Not Found.", costUsd: 0.02 }; } });
    await r.start({ images: [{ name: "button.png", mediaType: "image/png", base64: PNG }] });
    expect(asked.length).toBe(1);
    expect(asked[0].images).toEqual([{ mediaType: "image/png", base64: PNG }]);
    expect(asked[0].question).toContain("Make the signup button match");
    const call = r.engine.calls[0] as Record<string, unknown>;
    expect(String(call.prompt)).toContain("A blue button that says Join. Error: 404 Not Found.");
    expect(String(call.prompt)).not.toContain(PNG);
    expect(JSON.stringify(call)).not.toContain(PNG);
    expect(of(r.events, "receipt")[0].usdEstimate).toBeGreaterThanOrEqual(0.02);
    expect(r.ledger.spentToday(r.project)).toBeGreaterThanOrEqual(0.02);
  });
  test("what is said about a picture has its secrets hidden too", async () => {
    const r = setup([[write("a.txt", "v1")]], { describer: async () => ({ text: `The screen shows the key ${KEY}.`, costUsd: 0 }) });
    await r.start({ images: [{ name: "shot.png", mediaType: "image/png", base64: PNG }] });
    expect(r.engine.calls[0].prompt).not.toContain(KEY);
  });
  test("no way to look at pictures (Claude not connected): refused in plain words, nothing started", async () => {
    const r = setup([[write("a.txt", "v1")]]);
    await r.start({ images: [{ name: "shot.png", mediaType: "image/png", base64: PNG }] });
    expect(r.engine.calls.length).toBe(0);
    expect(of(r.events, "checkpoint.created").length).toBe(0);
    expect(of(r.events, "protocol.error")[0]?.reason).toMatch(/picture/i);
  });
  test("a picture that could not be looked at: nothing is started, and it says so", async () => {
    const r = setup([[write("a.txt", "v1")]], { describer: async () => { throw new Error("vision lane down"); } });
    await r.start({ images: [{ name: "shot.png", mediaType: "image/png", base64: PNG }] });
    expect(r.engine.calls.length).toBe(0);
    expect(of(r.events, "checkpoint.created").length).toBe(0);
    expect(of(r.events, "protocol.error")[0]?.reason).toMatch(/could not look at the picture.*nothing was started/i);
    expect(of(r.events, "agent.state").at(-1)?.state).toBe("error");
  });
  test("Stop while it looks: nothing is started, and the agent is free again", async () => {
    let seen!: AbortSignal;
    const r = setup([[write("a.txt", "v1")], [write("a.txt", "v2")]], { describer: (_req, signal) => { seen = signal; return new Promise((_, rej) => signal.addEventListener("abort", () => rej(new Error("stopped")), { once: true })); } });
    const p = r.start({ images: [{ name: "shot.png", mediaType: "image/png", base64: PNG }] });
    await Bun.sleep(20);
    await r.runner.handle({ v: 1, id: "s", type: "agent.interrupt", agent: "builder-1" } as never);
    await p;
    expect(seen.aborted).toBe(true);
    expect(r.engine.calls.length).toBe(0);
    expect(of(r.events, "checkpoint.created").length).toBe(0);
    expect(of(r.events, "agent.state").at(-1)?.state).toBe("idle");
    await r.start();   // the agent is free again
    expect(r.engine.calls.length).toBe(1);
  });
});

// Bug bash (Ask flow), end to end without a model: the runner's real events, fed through Home's own model and hero words.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SdkEngine } from "../src/sdkEngine.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { AgentRunner } from "../src/agent.ts";
import { TaskLog } from "../src/tasklog.ts";
// Loaded by path (M67), so the runner's type check does not take in the page's files (model.ts reaches icons.tsx).
type Model = any;
const MODEL = "../../app/src/model.ts", HERO = "../../app/src/homeHero.ts";
const { initial, reduce } = await import(MODEL) as { initial: () => Model; reduce: (m: Model, e: unknown) => Model };
const { heroWords } = await import(HERO) as { heroWords: (...a: any[]) => any };

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `bugbash-${l}-`))); made.push(d); return d; };
const A = "builder-1";

async function drive(engine: any, during?: (r: AgentRunner) => void) {
  const project = tmp("proj"); writeFileSync(join(project, "index.html"), "<h1>hi</h1>");
  const events: any[] = [];
  const runner = new AgentRunner({ shadowRoot: tmp("shadow"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), approvalTimeoutMs: 20 });
  const p = runner.handle({ v: 1, id: "c", type: "agent.start", project, agent: A, mode: "drive", prompt: "make the title blue", model: "m", budgetUsd: 3 } as any);
  during?.(runner);
  await p;
  let m: Model = { ...initial(), folder: project } as Model;
  m = reduce(m, { type: "ui.taskSent", words: "make the title blue" } as never);
  for (const e of events) m = reduce(m, { v: 1, id: "x", ...e } as never);
  return { events, m, project, hero: heroWords(m, project) };
}

describe("Home after a cut stream", () => {
  test("half an answer and then the stream ends, with no result: Home must not say done", async () => {
    const q = () => (async function* () { yield { type: "assistant", message: { content: [{ type: "text", text: "I will change the title. First I" }] } }; })();
    const { events, hero, m } = await drive(new SdkEngine({ claudeBinary: "/x/claude", env: {}, queryFn: q as any }));
    console.log("receipt.ended:", events.find((e) => e.type === "receipt")?.ended, "| hero:", hero.headline, "/", hero.line, "| tone:", hero.tone, "| character:", m.character);
    expect(events.find((e) => e.type === "receipt")?.ended).not.toBe("done");
  });
});

describe("Stop mid turn (scripted stand in)", () => {
  test("the receipt says stopped and Home does not say done", async () => {
    const eng = new ScriptedEngine([{ text: "Working on it", costUsd: 0 }, { text: "more", costUsd: 0, delayMs: 2000 }]);
    const { events, hero, m } = await drive(eng, (r) => { setTimeout(() => void r.handle({ v: 1, id: "s", type: "agent.interrupt", agent: A } as any), 300); });
    console.log("receipt.ended:", events.find((e) => e.type === "receipt")?.ended, "| hero:", hero.headline, "/", hero.line, "| tone:", hero.tone, "| character:", m.character);
    expect(events.find((e) => e.type === "receipt")?.ended).toBe("stopped");
    expect(hero.tone).not.toBe("done");
  });
});

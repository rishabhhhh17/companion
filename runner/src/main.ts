// The runner program. The app starts it, writes commands to stdin and reads events from
// stdout, one JSON line each. stderr is for logs only and never carries secrets.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { PROTOCOL_VERSION, parseCommand, serialize, type Command, type Event } from "../../protocol/index.ts";
import { AgentRunner } from "./agent.ts";
import { createEngine, createLanes, currentAuth, readSettings } from "./engines.ts";
import { AssistService, ImageStore } from "./lanes.ts";
import { Ledger } from "./ledger.ts";
import { MemoryStore } from "./memory/store.ts";
import { label } from "./redact.ts";
import { TaskLog } from "./tasklog.ts";

const SDK_VERSION = "0.3.293";
const settings = readSettings(process.env);
mkdirSync(join(settings.data, "shadow"), { recursive: true });

let n = 0;
const emit = (e: Event) => { process.stdout.write(serialize(e) + "\n"); };
const say = (e: Record<string, unknown>) => emit({ v: PROTOCOL_VERSION, id: `r${++n}`, ts: new Date().toISOString(), ...e } as unknown as Event);

// If a local file is damaged or cannot be written, Companion still starts and says so in plain words.
const notes: string[] = [];
const problem = (m: string) => { notes.push(m); };
const runner = new AgentRunner({ shadowRoot: join(settings.data, "shadow"), engine: createEngine(settings), log: new TaskLog(join(settings.data, "tasks.db"), problem), reviewer: process.env.COMPANION_REVIEW === "1" && settings.engine === "sdk" ? createEngine(settings) : undefined, ledger: new Ledger(join(settings.data, "ledger.db"), undefined, problem), dailyCeilingUsd: Number(process.env.COMPANION_DAILY_CEILING_USD) > 0 ? Number(process.env.COMPANION_DAILY_CEILING_USD) : 10, memoryDir: settings.data, emit });
const assist = settings.engine === "sdk" || settings.assistStub ? new AssistService({ ...createLanes(settings), images: new ImageStore(), emit, memory: (project) => new MemoryStore({ project: project ?? "", profileDir: settings.data }).forAgent(300) }) : null;
const inflight = new Set<Promise<unknown>>();

// The app closing its end of the pipe is how we are told to stop; writing to a closed pipe must not look like a crash.
process.stdout.on("error", () => process.exit(0));
say({ type: "runner.hello", runnerVersion: "0.0.1", sdk: SDK_VERSION });
for (const m of notes) say({ type: "protocol.error", reason: m });
if (settings.engine === "sdk") {
  const a = await currentAuth(settings);
  say({ type: "auth.status", method: a.method, ...(a.method === "api_key" ? { source: "keychain" } : {}) });
}

function dispatch(cmd: Command) {
  // The app asks "are you alive?" and the Stop key depends on the answer, so this is answered before anything else.
  if (cmd.type === "runner.ping") { say({ type: "runner.pong" }); return; }
  const work = cmd.type.startsWith("assist.")
    ? (assist ? assist.handle(cmd) : Promise.resolve(say({ type: "protocol.error", reason: "Prompt help and Show me how are not available in this mode" })))
    : runner.handle(cmd);
  if (cmd.type === "agent.interruptAll" && assist) void assist.handle({ v: 1, id: cmd.id, type: "assist.cancel", req: "*" } as Command);
  const p = work.catch((e: Error) => say({ type: "protocol.error", reason: `could not handle ${cmd.type}: ${e.message}` })).finally(() => inflight.delete(p));
  inflight.add(p);
}

async function main() {
  let buf = "";
  const dec = new TextDecoder();
  for await (const chunk of Bun.stdin.stream()) {
    buf += dec.decode(chunk, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const r = parseCommand(line);
      if (!r.ok) say({ type: "protocol.error", reason: r.error, line: label(line, 200) });
      else dispatch(r.msg);
    }
  }
  // The app closed the pipe: stop everything, let receipts finish, then exit.
  void runner.handle({ v: 1, id: "shutdown", type: "agent.interruptAll", reason: "app closed" });
  await Promise.allSettled([...inflight]);
}

await main();
process.exit(0);

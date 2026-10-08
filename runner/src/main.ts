// The runner program. The app starts it, writes commands to stdin and reads events from
// stdout, one JSON line each. stderr is for logs only and never carries secrets.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { PROTOCOL_VERSION, parseCommand, serialize, type Command, type Event } from "../../protocol/index.ts";
import { AgentRunner } from "./agent.ts";
import { createEngine, createLanes, currentAuth, readSettings } from "./engines.ts";
import { AssistService, ImageStore } from "./lanes.ts";
import { Ledger } from "./ledger.ts";
import { label } from "./redact.ts";
import { TaskLog } from "./tasklog.ts";

const SDK_VERSION = "0.3.293";
const settings = readSettings(process.env);
mkdirSync(join(settings.data, "shadow"), { recursive: true });

let n = 0;
const emit = (e: Event) => { process.stdout.write(serialize(e) + "\n"); };
const say = (e: Record<string, unknown>) => emit({ v: PROTOCOL_VERSION, id: `r${++n}`, ts: new Date().toISOString(), ...e } as unknown as Event);

const runner = new AgentRunner({ shadowRoot: join(settings.data, "shadow"), engine: createEngine(settings), log: new TaskLog(join(settings.data, "tasks.db")), ledger: new Ledger(join(settings.data, "ledger.db")), dailyCeilingUsd: Number(process.env.COMPANION_DAILY_CEILING_USD) > 0 ? Number(process.env.COMPANION_DAILY_CEILING_USD) : 10, emit });
const assist = settings.engine === "sdk" ? new AssistService({ ...createLanes(settings), images: new ImageStore(), emit }) : null;
const inflight = new Set<Promise<unknown>>();

say({ type: "runner.hello", runnerVersion: "0.0.1", sdk: SDK_VERSION });
if (settings.engine === "sdk") {
  const a = await currentAuth(settings);
  say({ type: "auth.status", method: a.method, ...(a.method === "api_key" ? { source: "keychain" } : {}) });
}

function dispatch(cmd: Command) {
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

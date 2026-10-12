// The runner program. The app starts it, writes commands to stdin and reads events from
// stdout, one JSON line each. stderr is for logs only and never carries secrets.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PROTOCOL_VERSION, parseCommand, serialize, type Command, type Event } from "../../protocol/index.ts";
import { AgentRunner } from "./agent.ts";
import { createEngine, createLanes, currentAuth, readSettings } from "./engines.ts";
import { AssistService, ImageStore } from "./lanes.ts";
import { Ledger } from "./ledger.ts";
import { MemoryStore } from "./memory/store.ts";
import { doctor } from "./doctor.ts";
import { release as releaseShotDrive } from "./ramdisk.ts";
import { VercelCli } from "./ship/deploy.ts";
import { label } from "./redact.ts";
import { TaskLog } from "./tasklog.ts";
import { FileWalkStore, projectChecker } from "./walk.ts";
import { WalkService } from "./walkservice.ts";
import { Metrics } from "./metrics.ts";

const SDK_VERSION = "0.3.293";
const settings = readSettings(process.env);
mkdirSync(join(settings.data, "shadow"), { recursive: true });

let n = 0;
const metrics = new Metrics(join(settings.data, "metrics.json"));
const emit = (e: Event) => { metrics.observe(e); process.stdout.write(serialize(e) + "\n"); };
const say = (e: Record<string, unknown>) => emit({ v: PROTOCOL_VERSION, id: `r${++n}`, ts: new Date().toISOString(), ...e } as unknown as Event);

// If a local file is damaged or cannot be written, Companion still starts and says so in plain words.
const notes: string[] = [];
const problem = (m: string) => { notes.push(m); };
const lanes = settings.engine === "sdk" || settings.assistStub ? createLanes(settings) : null;
const runner = new AgentRunner({ shadowRoot: join(settings.data, "shadow"), engine: createEngine(settings), log: new TaskLog(join(settings.data, "tasks.db"), problem), reviewer: process.env.COMPANION_REVIEW === "1" && settings.engine === "sdk" ? createEngine(settings) : undefined, ledger: new Ledger(join(settings.data, "ledger.db"), undefined, problem), dailyCeilingUsd: Number(process.env.COMPANION_DAILY_CEILING_USD) > 0 ? Number(process.env.COMPANION_DAILY_CEILING_USD) : 10, memoryDir: settings.data, deployer: new VercelCli(), pictures: { workDir: join(settings.data, "work"), saveDir: join(settings.data, "receipts") }, explainer: lanes && !settings.assistStub ? (req, signal) => lanes.fast.run({ ...req, raw: true }, () => {}, signal) : undefined, emit });
const assist = lanes ? new AssistService({ ...lanes, images: new ImageStore(), emit, memory: (project) => new MemoryStore({ project: project ?? "", profileDir: settings.data }).forAgent(300) }) : null;
const walks = new WalkService({ emit, lessonDirs: [join(settings.data, "lessons"), fileURLToPath(new URL("../../lessons", import.meta.url))], store: new FileWalkStore(join(settings.data, "walks")), checker: projectChecker, now: () => new Date().toISOString() });
const inflight = new Set<Promise<unknown>>();

// The app closing its end of the pipe is how we are told to stop; writing to a closed pipe must not look like a crash.
process.stdout.on("error", () => process.exit(0));
say({ type: "runner.hello", runnerVersion: "0.0.1", sdk: SDK_VERSION });
for (const m of notes) say({ type: "protocol.error", reason: m });
async function announceAuth() {
  if (settings.engine !== "sdk") return;
  const a = await currentAuth(settings);
  say({ type: "auth.status", method: a.method, ...(a.method === "api_key" ? { source: "keychain" } : {}) });
}
await announceAuth();

function dispatch(cmd: Command) {
  // The app asks "are you alive?" and the Stop key depends on the answer, so this is answered before anything else.
  if (cmd.type === "runner.ping") { say({ type: "runner.pong" }); return; }
  // After a key is saved the app asks again who we are signed in as.
  if (cmd.type === "auth.check") { void announceAuth(); return; }
  if (cmd.type === "doctor.check") { void doctor().then((items) => say({ type: "doctor.report", items })).catch((e: Error) => say({ type: "protocol.error", reason: `could not check this Mac: ${e.message}` })); return; }
  if (cmd.type.startsWith("metrics.")) {
    if (cmd.type === "metrics.set") metrics.setEnabled(cmd.enabled);
    else if (cmd.type === "metrics.note") { metrics.note(cmd.name); return; }
    else if (cmd.type === "metrics.erase") metrics.erase();
    say({ type: "metrics.summary", ...metrics.summary() });
    return;
  }
  metrics.observeCommand(cmd);
  if (cmd.type === "agent.interruptAll") walks.stopAll();
  const work = cmd.type.startsWith("walk.") ? walks.handle(cmd as never) : cmd.type.startsWith("assist.")
    ? (assist ? assist.handle(cmd) : Promise.resolve(say({ type: "protocol.error", reason: "Prompt help and Show me how are not available in this mode" })))
    : runner.handle(cmd);
  if (cmd.type === "agent.interruptAll" && assist) assist.cancelAll();
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
  void releaseShotDrive();
  await Promise.allSettled([...inflight]);
  await runner.background();   // pictures being made stop their servers and delete their private copies first
}

await main();
process.exit(0);

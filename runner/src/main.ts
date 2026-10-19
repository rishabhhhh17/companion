// The runner program. The app starts it, writes commands to stdin and reads events from
// stdout, one JSON line each. stderr is for logs only and never carries secrets.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PROTOCOL_VERSION, parseCommand, serialize, type Command, type Event } from "../../protocol/index.ts";
import { AgentRunner } from "./agent.ts";
import { createEngine, createLanes, currentAuth, quickModelOf, readSettings } from "./engines.ts";
import { AssistService, ImageStore } from "./lanes.ts";
import { Ledger } from "./ledger.ts";
import { promptHelpMemory } from "./memory/recall.ts";
import { doctor } from "./doctor.ts";
import { release as releaseShotDrive } from "./ramdisk.ts";
import { VercelCli } from "./ship/deploy.ts";
import { label } from "./redact.ts";
import { heldKey } from "./keychain.ts";
import { TaskLog } from "./tasklog.ts";
import { FileWalkStore, projectChecker } from "./walk.ts";
import { WalkService } from "./walkservice.ts";
import { lessonsFromProject } from "./lessongen.ts";
import { Metrics } from "./metrics.ts";
import { BrowserSetup, pretendInstaller } from "./proof/browsersetup.ts";
import { SPENDING_FILE, SpendingStore, startingLimit } from "./spending.ts";
import { Warmer } from "./warm.ts";
import { resolveClaudeBinary } from "./sdkEngine.ts";
import { RunnerSettings } from "./settings.ts";
import { slowFactor } from "./proof/options.ts";

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
// The settings the shell applied (settings.apply, T16): in memory only, read by each task as it starts, and by the fast lane
// for each request ("Claude for quick answers").
const runnerSettings = new RunnerSettings();
const lanes = settings.engine === "sdk" || settings.assistStub ? createLanes(settings, {}, { quickModel: () => quickModelOf(runnerSettings) }) : null;
// The daily spending limit the person chose in Settings, kept in the data folder (a developer's setting wins, for tests).
const spending = new SpendingStore(join(settings.data, SPENDING_FILE));
// "My internet is slow" (net.slow): the waits for things that go over the internet are doubled, read each time.
const slow = () => slowFactor((k) => runnerSettings.get(k));
// The person's own Vercel tool: Ship deploys through it, and Point at the problem and Rescue read a failed deploy's build log through it (read only).
const vercel = new VercelCli(undefined, undefined, undefined, slow);
const runner = new AgentRunner({ settings: runnerSettings, shadowRoot: join(settings.data, "shadow"), engine: createEngine(settings), log: new TaskLog(join(settings.data, "tasks.db"), problem), reviewer: process.env.COMPANION_REVIEW === "1" && settings.engine === "sdk" ? createEngine(settings) : undefined, ledger: new Ledger(join(settings.data, "ledger.db"), undefined, problem), dailyCeilingUsd: startingLimit(process.env.COMPANION_DAILY_CEILING_USD, spending.read()), saveDailyLimit: (usd) => spending.save(usd), memoryDir: settings.data, deployer: vercel, deployLogs: vercel, pictures: { workDir: join(settings.data, "work"), saveDir: join(settings.data, "receipts") }, bisect: { workDir: join(settings.data, "work") }, explainer: lanes && !settings.assistStub ? (req, signal) => lanes.fast.run({ ...req, raw: true }, () => {}, signal) : undefined, describer: lanes && !settings.assistStub ? lanes.describe : undefined, emit });
// Prompt help is told what Companion remembers as each request is made (memory.tellClaude, memory.recallLength), and reads
// ph.useProjectInfo and ph.handBack on each request.
const assist = lanes ? new AssistService({ ...lanes, images: new ImageStore(), emit, memory: promptHelpMemory(runnerSettings, settings.data), settings: runnerSettings }) : null;
const walks = new WalkService({ emit, lessonDirs: [join(settings.data, "lessons"), fileURLToPath(new URL("../../lessons", import.meta.url))], store: new FileWalkStore(join(settings.data, "walks")), checker: projectChecker, now: () => new Date().toISOString(), fromProject: lessonsFromProject });
const inflight = new Set<Promise<unknown>>();
// The browser check's one time download: only on the person's press, ended by Stop everything, by the app closing, and by
// this engine being ended by force (the installer ends with it).
// The zero cost warm up (warm.ts): only the real engine has a Claude binary to read through.
const warmer = new Warmer({ binary: () => (settings.engine === "sdk" ? resolveClaudeBinary(settings.claudeBin) : null) });
const browser = new BrowserSetup({ emit: say, timeoutMs: () => 15 * 60_000 * slow(), ...(settings.browserStubMs ? pretendInstaller(settings.browserStubMs) : {}), ...(settings.browserStubInstaller ? { installer: settings.browserStubInstaller } : {}) });

// The app closing its end of the pipe is how we are told to stop; writing to a closed pipe must not look like a crash.
process.stdout.on("error", () => process.exit(0));
say({ type: "runner.hello", runnerVersion: "0.0.1", sdk: SDK_VERSION });
for (const m of notes) say({ type: "protocol.error", reason: m });
async function announceAuth() {
  if (settings.engine !== "sdk") return;
  const a = await currentAuth(settings);
  say({ type: "auth.status", method: a.method, ...(a.method === "api_key" ? { source: "keychain" } : {}) });
}
try { await announceAuth(); } catch { say({ type: "auth.status", method: "unknown" }); }   // a failed look-up must not stop the engine starting

// One thing going wrong in the background must never take the whole engine (and with it Stop, approvals and every task) down.
const survive = (what: string) => (e: unknown) => { try { say({ type: "protocol.error", reason: `something went wrong in the background (${label(String((e as Error)?.message ?? e), 120)}); the engine kept running`, line: what }); } catch { /* nowhere to say it */ } };
process.on("unhandledRejection", survive("unhandledRejection"));
process.on("uncaughtException", survive("uncaughtException"));

function dispatch(cmd: Command) {
  // The app asks "are you alive?" and the Stop key depends on the answer, so this is answered before anything else.
  if (cmd.type === "runner.ping") { say({ type: "runner.pong" }); return; }
  // After a key is saved the app asks again who we are signed in as.
  if (cmd.type === "auth.check") { void announceAuth(); return; }
  // The settings line from the shell: each value checked again, names (never values) in the answer.
  if (cmd.type === "settings.apply") { say({ type: "settings.applied", ...runnerSettings.apply(cmd) }); return; }
  // Home opened or the ask box got the keyboard: read the Claude binary through once (nothing is run or sent). How long it
  // took goes to the log, never anything else.
  if (cmd.type === "engine.warm") { void warmer.warm().then((r) => { if (r.read) process.stderr.write(`warm: read the Claude binary (${Math.round(r.bytes / 1048576)} MB) in ${r.ms} ms\n`); }); return; }
  if (cmd.type === "browser.check") { browser.status(); return; }
  if (cmd.type === "browser.install") { const p = browser.install().finally(() => inflight.delete(p)); inflight.add(p); return; }
  if (cmd.type === "doctor.check") { void doctor().then((items) => say({ type: "doctor.report", items })).catch((e: Error) => say({ type: "protocol.error", reason: `could not check this Mac: ${e.message}` })); return; }
  if (cmd.type.startsWith("metrics.")) {
    if (cmd.type === "metrics.set") metrics.setEnabled(cmd.enabled);
    else if (cmd.type === "metrics.note") { metrics.note(cmd.name); return; }
    else if (cmd.type === "metrics.erase") metrics.erase();
    say({ type: "metrics.summary", ...metrics.summary() });
    return;
  }
  metrics.observeCommand(cmd);
  if (cmd.type === "agent.interruptAll") { walks.stopAll(); void browser.stop(); warmer.stop(); }
  const work = cmd.type.startsWith("walk.") ? walks.handle(cmd as never) : cmd.type.startsWith("assist.")
    ? (assist ? assist.handle(cmd) : Promise.resolve(say({ type: "protocol.error", reason: "Prompt help and Show me how are not available in this mode" })))
    : runner.handle(cmd);
  if (cmd.type === "agent.interruptAll" && assist) assist.cancelAll();
  const p = work.catch((e: Error) => say({ type: "protocol.error", reason: `could not handle ${cmd.type}: ${e.message}` })).finally(() => inflight.delete(p));
  inflight.add(p);
}

function takeKey(line: string): boolean {
  try {
    const j = JSON.parse(line) as { type?: string; key?: unknown };
    if (j.type !== "auth.key") return false;
    heldKey.set(typeof j.key === "string" ? j.key : null);
  } catch { say({ type: "protocol.error", reason: "the key from the app could not be read" }); return false; }
  void announceAuth();
  return true;
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
      // The key handoff from the app is not part of the page protocol: it is taken here, before anything is parsed, logged
      // or echoed, and a damaged one is dropped without its text ever being repeated.
      if (line.startsWith('{"v":1,"type":"auth.key"')) { takeKey(line); continue; }
      let r: ReturnType<typeof parseCommand>;
      try { r = parseCommand(line); } catch { say({ type: "protocol.error", reason: "a line could not be read", line: label(line, 200) }); continue; }   // never let one bad line stop the engine
      if (!r.ok) say({ type: "protocol.error", reason: r.error, line: label(line, 200) });
      else dispatch(r.msg);
    }
  }
  // The app closed the pipe: stop everything, let receipts finish, then exit.
  void runner.handle({ v: 1, id: "shutdown", type: "agent.interruptAll", reason: "app closed" });
  void browser.stop();   // a real download runs in its own process group, so it is ended and waited for, never left behind
  void releaseShotDrive();
  await Promise.allSettled([...inflight]);
  await runner.background();   // pictures being made stop their servers and delete their private copies first
}

await main();
process.exit(0);

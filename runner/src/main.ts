// The runner program. The app starts it, writes commands to stdin and reads events from
// stdout, one JSON line each. stderr is for logs only and never carries secrets.
import { setGoogleAccounts } from "./google/state.ts";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PROTOCOL_VERSION, serialize, type Command, type Event } from "../../protocol/index.ts";
import { AgentRunner } from "./agent.ts";
import { createEngine, createLanes, currentAuth, quickModelOf, readSettings } from "./engines.ts";
import { AssistService, ImageStore } from "./lanes.ts";
import { Ledger } from "./ledger.ts";
import { promptHelpMemory } from "./memory/recall.ts";
import { MemoryStore } from "./memory/store.ts";
import { SilenceLedger } from "./review/silence.ts";
import { doctor } from "./doctor.ts";
import { release as releaseShotDrive } from "./ramdisk.ts";
import { VercelCli } from "./ship/deploy.ts";
import { heldKey } from "./keychain.ts";
import { testKey } from "./keytest.ts";
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
import { newlyOff, offNow, refusal, stopGroupWork } from "./groups.ts";
import { slowFactor } from "./proof/options.ts";
import { WATCH_FILE, WatchEngine } from "./watch.ts";
import { GhCli } from "./connections.ts";
import { makeChecks, makeEvidence } from "./watchwire.ts";
import { PRODUCT, PRODUCT_S } from "./names.ts";
import { failure } from "./plainfail.ts";
import { pumpLine } from "./pump.ts";
import { claudeReachable } from "./reach.ts";
import { FreeFixes } from "./db.ts";
import { PlanGate } from "./plan.ts";
import { MODELS } from "./models.ts";
import { OWN_WORK, ReviewService } from "./review/service.ts";

const SDK_VERSION = "0.3.293";
const settings = readSettings(process.env);

let n = 0;
const metrics = new Metrics(join(settings.data, "metrics.json"));
const emit = (e: Event) => { metrics.observe(e); process.stdout.write(serialize(e) + "\n"); };
const say = (e: Record<string, unknown>) => emit({ v: PROTOCOL_VERSION, id: `r${++n}`, ts: new Date().toISOString(), ...e } as unknown as Event);

// If a local file is damaged or cannot be written, Companion still starts and says so in plain words.
const notes: string[] = [];
const problem = (m: string) => { notes.push(m); };
// A full disk or a folder that cannot be written must not stop the engine from starting (the supervisor gives up after a few tries).
try { mkdirSync(join(settings.data, "shadow"), { recursive: true }); } catch { problem(`${PRODUCT_S} folder for undo points could not be made on this Mac, so Undo may not work until there is room.`); }
// The settings the shell applied (settings.apply, T16): in memory only, read by each task as it starts, and by the fast lane
// for each request ("Claude for quick answers").
const runnerSettings = new RunnerSettings();
// Must fix 16: with the real Claude, a quick look that it is in reach comes before each request (reach.ts), so offline is
// said at once instead of after Claude Code's tries.
const claudeOnline = (host = "api.anthropic.com") => claudeReachable(host);
const lanes = settings.engine === "sdk" || settings.assistStub ? createLanes(settings, { reachable: settings.engine === "sdk" ? claudeOnline : undefined }, { quickModel: () => quickModelOf(runnerSettings) }) : null;
// The daily spending limit the person chose in Settings, kept in the data folder (a developer's setting wins, for tests).
const spending = new SpendingStore(join(settings.data, SPENDING_FILE));
// "My internet is slow" (net.slow): the waits for things that go over the internet are doubled, read each time.
const slow = () => slowFactor((k) => runnerSettings.get(k));
// The person's own Vercel tool: Ship deploys through it, and Point at the problem and Rescue read a failed deploy's build log through it (read only).
const vercel = new VercelCli(undefined, undefined, undefined, slow);
// Watch routines and the read only connections (F21): the person's own vercel and gh tools, through the same safe runner.
const gh = new GhCli(undefined, undefined, slow);
const watchList: { engine: WatchEngine | null } = { engine: null };
const taskLog = new TaskLog(join(settings.data, "tasks.db"), problem);
// The plan gate (plan.ts, F25): nothing is gated until the shell says payments are on (plan.state). The free fix count lives
// beside the task history and is opened only when it is first needed, so with payments off nothing about it is written.
const plan = new PlanGate({ fixes: () => new FreeFixes(taskLog.database), emit: (e) => say(e) });
const runner = new AgentRunner({ reachable: settings.engine === "sdk" ? claudeOnline : undefined, settings: runnerSettings, ci: gh, watches: { forProject: (p) => watchList.engine?.forProject(p) ?? [] }, reviewState: (p) => review.stateFor(p), shadowRoot: join(settings.data, "shadow"), engine: createEngine(settings), log: taskLog, reviewer: process.env.COMPANION_REVIEW === "1" && settings.engine === "sdk" ? createEngine(settings) : undefined, ledger: new Ledger(join(settings.data, "ledger.db"), undefined, problem), dailyCeilingUsd: startingLimit(process.env.COMPANION_DAILY_CEILING_USD, spending.read()), saveDailyLimit: (usd) => spending.save(usd), memoryDir: settings.data, deployer: vercel, deployLogs: vercel, fixes: plan, pictures: { workDir: join(settings.data, "work"), saveDir: join(settings.data, "receipts") }, bisect: { workDir: join(settings.data, "work") }, explainer: lanes && !settings.assistStub ? (req, signal) => lanes.fast.run({ ...req, raw: true }, () => {}, signal) : undefined, checker: lanes && !settings.assistStub ? lanes.fast : undefined, describer: lanes && !settings.assistStub ? lanes.describe : undefined, emit });
const watches = new WatchEngine({
  file: join(settings.data, WATCH_FILE), emit: (e) => say(e), get: (k) => runnerSettings.get(k), onProblem: problem,
  checks: makeChecks({ vercel, gh, project: (p, sig) => runner.checkWithoutModel(p, sig) }), evidence: makeEvidence({ vercel, gh }),
});
watchList.engine = watches;
// M52 (F30): the review of every change another AI tool makes in the open project. The words come from the fast lane, the
// stronger model (MODELS.review) only for a stop or a change to sign in or payments; both are booked like Explain. Fix it is
// an ordinary task, admitted by the plan gate and wrapped as the engine's own work like every other.
const strongLane = settings.engine === "sdk" && !settings.assistStub ? createLanes(settings, { reachable: claudeOnline }, { quickModel: () => MODELS.review }).fast : null;
/** The engine's own work in a project: the review counts nothing it writes, and starts again from what it left. Called
 *  before the work starts (rule: measure the other tool's changes first). */
function ownWork(project: string | undefined, start: () => Promise<unknown>, kind: string): Promise<unknown> {
  if (!project) return start();
  let settle!: () => void;
  review.around(project, new Promise<void>((r) => { settle = r; }), kind);
  const work = start();
  void work.then(settle, settle);
  return work;
}
// M57 feature 7: which "Don't flag this kind here again" lines the person pressed for, kept in this data folder, outside
// every project (review/silence.ts). A line the tool being reviewed writes into the project's memory file silences nothing.
const silences = new SilenceLedger(join(settings.data, "review-silenced.json"));
const projectLines = (p: string): string[] => { try { return new MemoryStore({ project: p, profileDir: settings.data }).list("project").entries.map((e) => e.text); } catch { return []; } };
const review = new ReviewService({
  emit: (e) => say(e), setting: (k) => runnerSettings.get(k), store: (p) => runner.checkpointsFor(p),
  cheap: lanes && !settings.assistStub ? lanes.fast : null, strong: strongLane,
  spend: { room: (p) => runner.roomFor(p), book: (p, usd) => runner.bookSpend(p, usd) },
  check: (p, sig, o) => runner.checkForReview(p, sig, o), busy: (p) => runner.busyIn(p),
  // M57 feature 7: "Don't flag this kind here again" is a line in the project's memory (What I remember), read each review,
  // and it counts only when the person pressed for it (silences).
  silenced: (p) => silences.lines(p, projectLines(p)),
  // M57 feature 1: each review that ran is one row in the task history (names of files only), kept review.keepDays days.
  history: { add: (r) => taskLog.addReview(r, { keepDays: Number(runnerSettings.get("review.keepDays")) }), did: (p, b, d) => taskLog.reviewDid(p, b, d) },
  fix: (start) => {
    const admitted = plan.admit(start);
    if (!admitted) return;
    metrics.observeCommand(admitted);
    const p = ownWork(start.project, () => runner.handle(admitted), "agent.start").catch((e: Error) => say({ type: "protocol.error", ...failure(e, "review.fix") })).finally(() => inflight.delete(p));
    inflight.add(p);
  },
});
// Prompt help is told what Companion remembers as each request is made (memory.tellClaude, memory.recallLength), and reads
// ph.useProjectInfo and ph.handBack on each request.
const assist = lanes ? new AssistService({ ...lanes, images: new ImageStore(), emit, memory: promptHelpMemory(runnerSettings, settings.data), settings: runnerSettings, spend: { room: (p) => runner.roomFor(p), book: (p, usd) => runner.bookSpend(p, usd) } }) : null;
const walks = new WalkService({ emit, lessonDirs: [join(settings.data, "lessons"), fileURLToPath(new URL("../../lessons", import.meta.url))], store: new FileWalkStore(join(settings.data, "walks")), checker: projectChecker, now: () => new Date().toISOString(), fromProject: lessonsFromProject, startWhereYouAre: () => runnerSettings.get("teach.startWhereYouAre") === true });
const inflight = new Set<Promise<unknown>>();
// The browser check's one time download: only on the person's press, ended by Stop everything, by the app closing, and by
// this engine being ended by force (the installer ends with it).
// The zero cost warm up (warm.ts): only the real engine has a Claude binary to read through.
const warmer = new Warmer({ binary: () => (settings.engine === "sdk" ? resolveClaudeBinary(settings.claudeBin, settings.claudeBinId) : null) });
const browser = new BrowserSetup({ emit: say, timeoutMs: () => 15 * 60_000 * slow(), ...(settings.browserStubMs ? pretendInstaller(settings.browserStubMs) : {}), ...(settings.browserStubInstaller ? { installer: settings.browserStubInstaller } : {}) });

// The app closing its end of the pipe is how we are told to stop; writing to a closed pipe must not look like a crash.
process.stdout.on("error", () => process.exit(0));
say({ type: "runner.hello", runnerVersion: "0.0.1", sdk: SDK_VERSION });
for (const m of notes) say({ type: "protocol.error", reason: m });
watches.start();   // the schedule runs only while this engine does
async function announceAuth() {
  if (settings.engine !== "sdk") return;
  const a = await currentAuth(settings);
  say({ type: "auth.status", method: a.method, ...(a.method === "api_key" ? { source: "keychain" } : {}) });
}
try { await announceAuth(); } catch { say({ type: "auth.status", method: "unknown" }); }   // a failed look-up must not stop the engine starting

// One thing going wrong in the background must never take the whole engine (and with it Stop, approvals and every task) down.
const survive = (what: string) => (e: unknown) => { try { say({ type: "protocol.error", ...failure(e), reason: `Something went wrong in the background. ${PRODUCT} kept running.`, line: what }); } catch { /* nowhere to say it */ } };
process.on("unhandledRejection", survive("unhandledRejection"));
process.on("uncaughtException", survive("uncaughtException"));

/** A group that has just been switched off stops its tools here: Flow ends the tasks and checks that are running, Guide the
 *  lessons and Show me, Voice what Prompt help, the error explainer and Second Look were reading. (The shell stops its own: the
 *  microphone, speech, the pointer, a conversion.) What they made stays, and Undo of it still works. */
function stopGroups(groups: string[]) { stopGroupWork(groups, { runner, walks, browser, assist, watches }); }

function dispatch(cmd: Command) {
  // The app asks "are you alive?" and the Stop key depends on the answer, so this is answered before anything else.
  // The answer names the ping it answers (must fix 12): the Stop key waits for its own, never for just any event.
  if (cmd.type === "runner.ping") { say({ type: "runner.pong", ping: cmd.id }); return; }
  // The plan on this Mac, from the shell only (a page cannot send it). It changes what the next command may start; nothing
  // running is stopped, slowed or changed.
  if (cmd.type === "plan.state") { plan.setState(cmd); return; }
  // The shell's Google accounts (M21): kept in memory for the Google tools; nothing is said back, and no token is ever logged.
  if (cmd.type === "google.accounts") { setGoogleAccounts(cmd.accounts); return; }
  // After a key is saved the app asks again who we are signed in as.
  if (cmd.type === "auth.check") { void announceAuth(); return; }
  // The settings line from the shell: each value checked again, names (never values) in the answer.
  if (cmd.type === "settings.apply") {
    const before = offNow((k) => runnerSettings.get(k));
    say({ type: "settings.applied", ...runnerSettings.apply(plan.admit(cmd) as typeof cmd) });
    stopGroups(newlyOff(before, offNow((k) => runnerSettings.get(k))));
    // The review watches the project this line names, and only while review.mode is not off and Flow is on.
    review.setProject(cmd.project);
    return;
  }
  // A tool whose group is switched off does nothing (F20): the shell refuses it first, and this is the second check.
  const off = refusal((k) => runnerSettings.get(k), cmd);
  if (off) { say({ type: "protocol.error", reason: off, line: cmd.type }); return; }
  // A counted fix or a Pro feature the plan does not cover is not started (plan.ts says plan.limit). Everything that stops,
  // undoes, approves or checks is never gated.
  const admitted = plan.admit(cmd);
  if (!admitted) return;
  cmd = admitted;
  // Home opened or the ask box got the keyboard: read the Claude binary through once (nothing is run or sent). How long it
  // took goes to the log, never anything else.
  if (cmd.type === "engine.warm") { void warmer.warm().then((r) => { if (r.read) process.stderr.write(`warm: read the Claude binary (${Math.round(r.bytes / 1048576)} MB) in ${r.ms} ms\n`); }); return; }
  if (cmd.type === "browser.check") { browser.status(); return; }
  if (cmd.type === "browser.install") { const p = browser.install().finally(() => inflight.delete(p)); inflight.add(p); return; }
  if (cmd.type === "doctor.check") { void doctor().then((items) => say({ type: "doctor.report", items })).catch((e: Error) => say({ type: "protocol.error", ...failure(e, cmd.type), reason: `${PRODUCT} could not check this Mac. Try again.` })); return; }
  if (cmd.type.startsWith("metrics.")) {
    if (cmd.type === "metrics.set") metrics.setEnabled(cmd.enabled);
    else if (cmd.type === "metrics.note") { metrics.note(cmd.name); return; }
    else if (cmd.type === "metrics.erase") metrics.erase();
    say({ type: "metrics.summary", ...metrics.summary() });
    return;
  }
  // Watch routines: the schedule and the checks live in watch.ts; the group switch was checked above.
  if (cmd.type.startsWith("watch.")) { const p = Promise.resolve(watches.handle(cmd)).catch((e: Error) => say({ type: "protocol.error", ...failure(e, cmd.type) })).finally(() => inflight.delete(p)); inflight.add(p); return; }
  metrics.observeCommand(cmd);
  if (cmd.type === "agent.interruptAll") { walks.stopAll(); void browser.stop(); warmer.stop(); watches.stopAll(); review.stopAll(); }
  if (cmd.type === "review.now" || cmd.type === "review.dismiss" || cmd.type === "review.fix") { const p = review.handle(cmd).catch((e: Error) => say({ type: "protocol.error", ...failure(e, cmd.type) })).finally(() => inflight.delete(p)); inflight.add(p); return; }
  const c = cmd;
  const work = c.type.startsWith("walk.") ? walks.handle(c as never) : c.type.startsWith("assist.")
    ? (assist ? assist.handle(c) : Promise.resolve(say({ type: "protocol.error", ...failure("Prompt help and Show me how are not available in this mode", c.type) })))
    : OWN_WORK.has(c.type) ? ownWork(ownProject(c), () => runner.handle(c), c.type) : runner.handle(c);
  if (cmd.type === "agent.interruptAll" && assist) assist.cancelAll();
  // M57 feature 7: a press of "Don't flag this kind here again" is recorded once its line is in memory; a line forgotten,
  // edited or erased ends its silence.
  if ((c.type === "memory.add" || c.type === "memory.forget" || c.type === "memory.edit" || c.type === "memory.erase") && c.scope === "project") {
    const after = () => { try { if (c.type === "memory.add") silences.pressed(c.project, c.text, projectLines(c.project)); else silences.prune(c.project, projectLines(c.project)); } catch { /* the safe side: nothing silenced */ } };
    void work.then(after, after);
  }
  const p = work.catch((e: Error) => say({ type: "protocol.error", ...failure(e, cmd.type) })).finally(() => inflight.delete(p));
  inflight.add(p);
}

/** The project a command of the engine's own work is in: its own, or for an approved plan the plan's. */
function ownProject(cmd: Command): string | undefined {
  const named = (cmd as { project?: unknown }).project;
  if (typeof named === "string" && named) return named;
  const agent = (cmd as { agent?: unknown }).agent;
  return typeof agent === "string" ? runner.projectOf(agent) : undefined;
}

function takeKey(line: string): boolean {
  try {
    const j = JSON.parse(line) as { type?: string; key?: unknown; fresh?: unknown };
    if (j.type !== "auth.key") return false;
    heldKey.set(typeof j.key === "string" ? j.key : null);
    // A key the person just saved is checked once with Anthropic (free, keytest.ts), so setup can say whether it works.
    if (j.fresh === true && typeof j.key === "string") { const k = j.key.trim(); void announceAuth().then(async () => say({ type: "auth.status", method: "api_key", source: "keychain", tested: await testKey(k) })); return true; }
  } catch { say({ type: "protocol.error", ...failure("the key from the app could not be read") }); return false; }
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
      // The key handoff, parsing and a throw in one command are all handled line by line (pump.ts, must fix 12): one
      // command that goes wrong is said for that command, and the next one is still read.
      pumpLine(line, { takeKey, dispatch, say });
    }
  }
  // The app closed the pipe: stop everything, let receipts finish, then exit.
  watches.stop(); watches.stopAll(); review.stop();
  void runner.handle({ v: 1, id: "shutdown", type: "agent.interruptAll", reason: "app closed" });
  void browser.stop();   // a real download runs in its own process group, so it is ended and waited for, never left behind
  void releaseShotDrive();
  await Promise.allSettled([...inflight]);
  await runner.background();   // pictures being made stop their servers and delete their private copies first
}

await main();
process.exit(0);

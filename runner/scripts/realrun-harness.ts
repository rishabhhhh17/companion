// The real run harness: the one way a script spends the founder's own API key on real Claude (the smoke script,
// real-verify, and the evals when they run for real). It holds every rule CLAUDE.md sets for testing Companion with Claude Code:
// - Claude Code is always the SDK's bundled binary (pathToClaudeCodeExecutable), never a `claude` found on PATH.
// - The key is read in code from the Keychain item named by COMPANION_KEYCHAIN_SERVICE (companion-dev by default here),
//   through runner/src/keychain.ts. It is never printed: everything said passes through hideKey().
// - Claude Code gets a throwaway CLAUDE_CONFIG_DIR at a non default path, explicit settingSources, strictMcpConfig true,
//   CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 and CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1, and never bypassPermissions. Its environment
//   is built from a short plain one (minimalEnv), so no shell setting changes what is sent. checkOptions() refuses to start
//   a query that misses any of these.
// - system/init must list only the tools the case expects (checkInit); anything else stops the run there.
// - A per case and a total dollar stop (SpendMeter). In process queries are counted while they run, from the token counts
//   of each reply; a stop aborts the query in flight, ends the case at once, and no new query starts after it. A runner
//   process (real-verify) books a round only when its result arrives, so a round in flight is not seen until then: there
//   each task's own budget is the hard bound, cut to the room left under the stops before it is sent, and a task cut
//   short counts its whole budget (see realKit in real-verify.ts).
// - Every refusal and every stop fails its case with the reason, even when product code turned it into its own message:
//   a run the harness ended is never scored as quality.
// - A dry run is the default: it prints the plan and spends nothing. --spend is required to spend.
// Tested with stubbed queries in runner/test/realrun-harness.test.ts. NOT YET RUN AGAINST REAL CLAUDE.
import { Database } from "bun:sqlite";
import { chmodSync, existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { query as realQuery } from "@anthropic-ai/claude-agent-sdk";
import { minimalEnv } from "../src/env.ts";
import { DEFAULT_REF, getApiKey, type KeychainRef } from "../src/keychain.ts";
import { buildChildEnv } from "../src/safety.ts";
import { resolveClaudeBinary } from "../src/sdkEngine.ts";
import { canonicalModel, estimateUsd, requestProblems } from "../src/models.ts";

export const DEFAULT_KEYCHAIN_SERVICE = "companion-dev";
type Ev = Record<string, any>;
export type QueryFn = (params: { prompt: unknown; options?: Record<string, any> }) => AsyncIterable<any>;

// ---------- the command line ----------

export type Args = { spend: boolean; only: string[]; perCaseUsd?: number; totalUsd?: number; timeoutS?: number; flags: Set<string> };
/** --dry-run (the default) or --spend; --per-case-usd=N, --total-usd=N and --timeout-s=N; the script's own flags; case names. */
export function parseArgs(argv: string[], ownFlags: string[] = []): Args | { error: string } {
  const a: Args = { spend: false, only: [], flags: new Set() };
  let dry = false;
  for (const arg of argv) {
    const num = /^--(per-case-usd|total-usd|timeout-s)=(.*)$/.exec(arg);
    if (arg === "--spend") a.spend = true;
    else if (arg === "--dry-run") dry = true;
    else if (num) {
      const v = Number(num[2]);
      if (!num[2] || !Number.isFinite(v) || v <= 0) return { error: `${arg}: give a positive number` };
      if (num[1] === "per-case-usd") a.perCaseUsd = v; else if (num[1] === "total-usd") a.totalUsd = v; else a.timeoutS = v;
    } else if (ownFlags.includes(arg)) a.flags.add(arg);
    else if (arg.startsWith("-")) return { error: `${arg} is not a known option (known: --dry-run, --spend, --per-case-usd=N, --total-usd=N, --timeout-s=N${ownFlags.length ? ", " + ownFlags.join(", ") : ""})` };
    else a.only.push(arg);
  }
  if (a.spend && dry) return { error: "choose --dry-run or --spend, not both" };
  return a;
}

export function keychainRefFrom(env: Record<string, string | undefined>): KeychainRef {
  return { service: env.COMPANION_KEYCHAIN_SERVICE?.trim() || DEFAULT_KEYCHAIN_SERVICE, account: env.COMPANION_KEYCHAIN_ACCOUNT?.trim() || DEFAULT_REF.account };
}

/** The key, and anything that looks like one, never reaches the terminal. */
export function hideKey(text: string, key?: string | null): string {
  let s = String(text);
  if (key && key.length >= 8) s = s.split(key).join("[key hidden]");
  return s.replace(/sk-ant-[A-Za-z0-9_-]{8,}/g, "[key hidden]");
}

// ---------- the money ----------

export class SpendStop extends Error {
  constructor(message: string, public scope: "case" | "total") { super(message); }
}
const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
const usd = (n: number) => `$${n.toFixed(n > 0 && n < 0.01 ? 4 : 2)}`;

/** What a run has spent, by Companion's estimate: settled amounts (Claude Code's own cost figure for a finished query) plus
 *  money still in flight (from the token counts so far). Over a case's stop or the total stop, it throws SpendStop, and
 *  tells onStop first (runCases ends the case on it, so a caller that swallows the error cannot carry on spending). */
export class SpendMeter {
  private caseSettled = 0;
  private totalSettled = 0;
  private inflight = new Map<string, number>();
  private caseCap: number;
  caseName = "";
  onStop?: (e: SpendStop) => void;
  constructor(public readonly perCaseUsd: number, public readonly totalUsd: number) { this.caseCap = perCaseUsd; }
  startCase(name: string, capUsd?: number) {
    this.caseName = name; this.caseSettled = 0; this.inflight.clear();
    this.caseCap = Math.min(capUsd ?? this.perCaseUsd, this.perCaseUsd);
  }
  get caseSpent() { return this.caseSettled + sum(this.inflight); }
  get totalSpent() { return this.totalSettled + sum(this.inflight); }
  get caseStop() { return this.caseCap; }
  remaining() { return Math.min(this.caseCap - this.caseSpent, this.totalUsd - this.totalSpent); }
  overTotal() { return this.totalSpent > this.totalUsd; }
  overCase() { return this.caseSpent > this.caseCap; }
  pending(key: string, amount: number) { this.inflight.set(key, Math.max(0, Number.isFinite(amount) ? amount : 0)); this.check(); }
  settle(key: string, amount: number) {
    this.inflight.delete(key);
    const a = Math.max(0, Number.isFinite(amount) ? amount : 0);
    this.caseSettled += a; this.totalSettled += a;
    this.check();
  }
  /** Before anything new starts: a stop when a stop was passed, or when no more than `need` dollars of room is left. */
  assertRoom(need = 0) {
    this.check();
    if (this.remaining() > need) return;
    const total = this.totalUsd - this.totalSpent <= this.caseCap - this.caseSpent;
    this.fail(total
      ? new SpendStop(`the total spending stop of ${usd(this.totalUsd)} leaves no room for more (spent about ${usd(this.totalSpent)})`, "total")
      : new SpendStop(`this case's spending stop of ${usd(this.caseCap)} leaves no room for more (spent about ${usd(this.caseSpent)})`, "case"));
  }
  private check() {
    if (this.overTotal()) this.fail(new SpendStop(`the total spending stop of ${usd(this.totalUsd)} was reached (spent about ${usd(this.totalSpent)})`, "total"));
    if (this.overCase()) this.fail(new SpendStop(`this case's spending stop of ${usd(this.caseCap)} was reached (spent about ${usd(this.caseSpent)})`, "case"));
  }
  private fail(e: SpendStop): never {
    try { this.onStop?.(e); } catch { /* a listener must not hide the stop */ }
    throw e;
  }
}

// ---------- Claude Code's folder and environment ----------

const isDefaultClaudeDir = (dir: string) => resolve(dir) === resolve(homedir(), ".claude") || resolve(dir).startsWith(resolve(homedir(), ".claude") + "/");

/** A new private folder for Claude Code's own files (saved conversations, file history), never ~/.claude. */
export function makeThrowawayConfigDir(root: string = tmpdir()): string {
  const d = realpathSync(mkdtempSync(join(root, "companion-realrun-claude-")));
  chmodSync(d, 0o700);
  if (isDefaultClaudeDir(d)) throw new Error("the throwaway folder would be ~/.claude");
  return d;
}

/** The environment for Claude Code on the API key route, built as the runner builds it, from the short plain environment an
 *  app opened from Finder has (minimalEnv keeps PATH, HOME, the locale, proxies and certificates, and drops everything else,
 *  so a Claude Code setting in the founder's shell, such as CLAUDE_CODE_EFFORT_LEVEL, never changes what a case sends), with
 *  this run's own folder for Claude Code's files. buildChildEnv adds the key and sets the two safety switches; this checks
 *  they are there. */
export function harnessEnv(o: { apiKey: string; configDir: string; parent?: Record<string, string | undefined> }): Record<string, string> {
  const parent = minimalEnv(o.parent ?? process.env);
  delete parent.CLAUDE_CONFIG_DIR;
  const env = buildChildEnv(parent, { route: "api_key", apiKey: o.apiKey, configDir: o.configDir });
  if (env.CLAUDE_CONFIG_DIR !== o.configDir || env.CLAUDE_CODE_DISABLE_AUTO_MEMORY !== "1" || env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB !== "1") throw new Error("the environment for Claude Code is not the one this harness requires");
  return env;
}

// ---------- the checks ----------

export type Expect = { tools: readonly string[] | "agent"; model?: string; claudeBinary: string; configDirs: string[] };

/** Plain built in Claude Code tools an agent session may list. Anything else (a connector, a scheduler, a hosted feature)
 *  fails the check, so a first real run shows it to a person instead of letting it pass. */
export const AGENT_TOOLS: readonly string[] = [
  "Task", "Agent", "Bash", "BashOutput", "KillShell", "KillBash", "TaskOutput", "TaskStop", "Glob", "Grep", "LS", "Read", "Edit", "MultiEdit", "Write",
  "NotebookEdit", "NotebookRead", "WebFetch", "WebSearch", "TodoWrite", "ExitPlanMode", "EnterPlanMode", "AskUserQuestion", "Skill", "SlashCommand",
  "ToolSearch", "Monitor", "TaskCreate", "TaskGet", "TaskUpdate", "TaskList",
];

/** Claude Code settings read from the environment that change what is sent (effort, thinking, output length, extra body
 *  fields, the model behind a lane) or what it costs (prompt caching). The app never sets them; a real run must not either. */
export const REQUEST_CHANGERS: readonly string[] = [
  "CLAUDE_CODE_EFFORT_LEVEL", "CLAUDE_CODE_EXTRA_BODY", "MAX_THINKING_TOKENS", "CLAUDE_CODE_MAX_OUTPUT_TOKENS", "CLAUDE_CODE_SUBAGENT_MODEL",
  "DISABLE_PROMPT_CACHING", "DISABLE_INTERLEAVED_THINKING",
];

/** Every reason the options must not start Claude. Never repeats a value (a value could be the key). */
export function checkOptions(options: Record<string, any>, ex: { claudeBinary: string; configDirs: string[]; model?: string }): string[] {
  const p: string[] = [];
  if (options.permissionMode === "bypassPermissions") p.push("permissionMode is bypassPermissions");
  if (options.allowDangerouslySkipPermissions) p.push("allowDangerouslySkipPermissions is set");
  if (!Array.isArray(options.settingSources)) p.push("settingSources is not an explicit list");
  if (options.strictMcpConfig !== true) p.push("strictMcpConfig is not true");
  if (options.mcpServers && typeof options.mcpServers === "object" && Object.keys(options.mcpServers).length) p.push("MCP servers are configured");
  if (options.pathToClaudeCodeExecutable !== ex.claudeBinary) p.push("the Claude binary is not the SDK's bundled one");
  const env = options.env as Record<string, string | undefined> | undefined;
  if (!env || typeof env !== "object") p.push("there is no explicit environment for Claude Code");
  else {
    if (env.CLAUDE_CODE_DISABLE_AUTO_MEMORY !== "1") p.push("CLAUDE_CODE_DISABLE_AUTO_MEMORY is not 1");
    if (env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB !== "1") p.push("CLAUDE_CODE_SUBPROCESS_ENV_SCRUB is not 1");
    const dir = env.CLAUDE_CONFIG_DIR;
    if (!dir) p.push("CLAUDE_CONFIG_DIR is not set to this run's own folder");
    else if (isDefaultClaudeDir(dir)) p.push("CLAUDE_CONFIG_DIR is the default ~/.claude");
    else if (!ex.configDirs.map((d) => resolve(d)).includes(resolve(dir))) p.push("CLAUDE_CONFIG_DIR is not this run's own folder");
    if (!env.ANTHROPIC_API_KEY) p.push("there is no API key in Claude Code's environment (this is the API key route)");
    for (const k of ["CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY"]) if (env[k]) p.push(`${k} is set`);
    // Anything else that changes the request or the account behind the options' back (Claude Code reads these over its flags).
    for (const k of Object.keys(env).sort()) if (env[k] !== undefined && (REQUEST_CHANGERS.includes(k) || (k.startsWith("ANTHROPIC_") && k !== "ANTHROPIC_API_KEY"))) p.push(`${k} is set in Claude Code's environment`);
  }
  const model = typeof options.model === "string" ? options.model : "";
  if (!model) p.push("no model is named");
  else {
    p.push(...requestProblems(model, { thinking: options.thinking, effort: options.effort, via: "sdk" }));
    if (ex.model && canonicalModel(model) !== canonicalModel(ex.model)) p.push(`the model is ${model}, not ${ex.model}`);
  }
  return p;
}

/** Every reason the system/init message is not what the case expects. */
export function checkInit(m: Ev, ex: { tools: readonly string[] | "agent"; model?: string }): string[] {
  const p: string[] = [];
  const tools: string[] = Array.isArray(m.tools) ? m.tools.map(String) : [];
  const allowed = ex.tools === "agent" ? AGENT_TOOLS : ex.tools;
  const extra = tools.filter((t) => t.startsWith("mcp__") || !allowed.includes(t));
  if (extra.length) p.push(`tools this check does not expect: ${extra.join(", ")}${ex.tools === "agent" ? " (if one is a plain built in Claude Code tool, read what it does, then add it to AGENT_TOOLS in runner/scripts/realrun-harness.ts)" : ""}`);
  if (Array.isArray(m.mcp_servers) && m.mcp_servers.length) p.push(`MCP servers were loaded: ${m.mcp_servers.map((s: Ev) => String(s?.name)).join(", ")}`);
  if (Array.isArray(m.plugins) && m.plugins.length) p.push(`plugins were loaded: ${m.plugins.map((s: Ev) => String(s?.name)).join(", ")}`);
  if (m.apiKeySource !== "ANTHROPIC_API_KEY") p.push(`the key came from "${String(m.apiKeySource)}", not ANTHROPIC_API_KEY (the API key route)`);
  if (m.permissionMode === "bypassPermissions") p.push("the permission mode is bypassPermissions");
  if (ex.model && m.model && canonicalModel(String(m.model)) !== canonicalModel(ex.model)) p.push(`the model is ${String(m.model)}, not ${ex.model}`);
  return p;
}

export class HarnessRefusal extends Error {}
/** A refusal or a spending stop: the harness ended it, so it is never a quality result and never swallowed. */
export const isHarnessStop = (e: unknown): boolean => e instanceof HarnessRefusal || e instanceof SpendStop;

/** The SDK's query, checked: the options before Claude starts, the room left under the stops, system/init when it arrives,
 *  and the money as it is spent. Any failure aborts the query (its process ends), is told to onRefusal (runCases fails the
 *  case on it), and throws. After a stop nothing new starts, so product code that turns the error into its own message
 *  cannot carry on spending. A continued conversation books only its own round (Claude Code's cost figure carries on from
 *  the saved conversation's total; `sessions` remembers it). */
export function guardQuery(real: QueryFn, o: { meter: SpendMeter; expect: Expect; onInit?: (m: Ev) => void; onMessage?: (m: Ev) => void; onRefusal?: (e: Error) => void; sessions?: Map<string, number>; signal?: AbortSignal; label?: string }): QueryFn {
  let n = 0;
  const sessions = o.sessions ?? new Map<string, number>();
  const refuse = (e: unknown): never => {
    if (e instanceof Error && isHarnessStop(e)) { try { o.onRefusal?.(e); } catch { /* a listener must not hide the refusal */ } }
    throw e;
  };
  return (params) => {
    const options: Record<string, any> = { ...(params.options ?? {}) };
    const problems = checkOptions(options, o.expect);
    if (problems.length) refuse(new HarnessRefusal(`Not started: ${problems.join("; ")}`));
    // Not told: the stop that ended the case was told already, and a case that has ended is not failed by what comes after.
    if (o.signal?.aborted) throw new HarnessRefusal("Not started: the case was already stopped");
    try { o.meter.assertRoom(); } catch (e) { refuse(e); }
    const ac: AbortController = options.abortController ?? new AbortController();
    options.abortController = ac;
    if (o.signal) o.signal.addEventListener("abort", () => ac.abort(), { once: true });
    const key = `${o.label ?? "query"}-${++n}`;
    const model = String(options.model);
    const q = real({ ...params, options });
    return (async function* () {
      const usage = new Map<string, unknown>();
      let settled = false;
      let sessionId: string | undefined = typeof options.resume === "string" ? options.resume : undefined;
      const live = () => [...usage.values()].reduce((a: number, u) => a + estimateUsd(model, u as never), 0);
      const stop = (e: unknown) => { try { ac.abort(); } catch { /* already ended */ } return e; };
      try {
        for await (const m of q) {
          if (m?.session_id) sessionId = String(m.session_id);
          if (m?.type === "system" && m.subtype === "init") {
            const p = checkInit(m, o.expect);
            if (p.length) refuse(stop(new HarnessRefusal(`Stopped at system/init: ${p.join("; ")}`)));
            o.onInit?.(m);
          } else if (m?.type === "assistant" && m.message?.usage) {
            // One reply can arrive as several messages repeating the same usage: counted once per message id.
            usage.set(String(m.message.id ?? `m${usage.size}`), m.message.usage);
            try { o.meter.pending(key, live()); } catch (e) { refuse(stop(e)); }
          } else if (m?.type === "result") {
            const total = Number(m.total_cost_usd);
            const known = Number.isFinite(total) && total >= 0;
            const before = (sessionId && sessions.get(sessionId)) || 0;
            const spent = known ? (total >= before ? total - before : total) : live();
            if (known && sessionId && total > 0) sessions.set(sessionId, total);
            settled = true;
            try { o.meter.settle(key, spent); } catch (e) { refuse(stop(e)); }
          }
          o.onMessage?.(m);
          yield m;
        }
      } finally {
        // Ended without a result (stopped, crashed, or ended early by its reader): the estimate so far counts as spent.
        if (!settled) { try { o.meter.settle(key, live()); } catch { /* the stop itself is reported by the case */ } }
        try { await (q as AsyncGenerator<unknown>).return?.(undefined); } catch { /* already finished */ }
      }
    })();
  };
}

// ---------- the runner process (real-verify drives the runner exactly as the app starts it) ----------

/** What a script answers on the person's behalf so a run never waits forever: approval cards are denied (a scenario that
 *  checks the allow path names the one card it allows: `allow`), a loop card is answered (stop, unless asked to try a
 *  different way), and the shared files question is answered yes (the project is a throwaway folder). Returns null for
 *  everything else. */
let answerN = 0;
export function autoAnswer(e: Ev, o: { loopChoice?: "stop" | "different"; allow?: (e: Ev) => boolean } = {}): Ev | null {
  const id = `auto-${++answerN}`;
  if (e?.type === "approval.request") return { v: 1, id, type: "approval.resolve", approval: String(e.approval), decision: o.allow?.(e) === true ? "allow" : "deny", scope: "once" };
  if (e?.type === "loop.stuck") return { v: 1, id, type: "loop.choose", agent: String(e.agent), choice: o.loopChoice ?? "stop" };
  if (e?.type === "memory.agents_ask") return { v: 1, id, type: "memory.agents", project: String(e.project), answer: "yes" };
  return null;
}

export type Proc = { write(line: string): void; lines: AsyncIterable<string>; kill(): void; exited: Promise<number> };

/** The runner program, started as the app starts it (or the engine staged for the installed app, COMPANION_ENGINE_DIR). */
export function spawnRunner(o: { env: Record<string, string>; engineDir?: string }): Proc {
  const cmd = o.engineDir ? [join(o.engineDir, "bin/bun"), join(o.engineDir, "runner/src/main.ts")] : [process.execPath, join(import.meta.dir, "../src/main.ts")];
  const p = Bun.spawn(cmd, { stdin: "pipe", stdout: "pipe", stderr: "inherit", env: o.env });
  async function* lines() {
    const dec = new TextDecoder(); let buf = "";
    for await (const chunk of p.stdout as AsyncIterable<Uint8Array>) {
      buf += dec.decode(chunk, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l.trim()) yield l; }
    }
  }
  return {
    write: (line) => { try { (p.stdin as any).write(line + "\n"); (p.stdin as any).flush(); } catch { /* the runner has ended */ } },
    lines: lines(),
    kill: () => { try { (p.stdin as any).end(); } catch { /* closed */ } setTimeout(() => { try { p.kill(); } catch { /* gone */ } }, 1500); },
    exited: p.exited,
  };
}

/** A scenario that checks the allow path: only an approval card whose command matches `only` is answered yes (after
 *  `afterMs`, as a person would take a moment); every other card is denied at once and noted with its command. */
export type ApproveRule = { only: RegExp; afterMs?: number };

/** Reads the runner's events, answers what must be answered (autoAnswer), and records it. The key, when given, is handed
 *  over the pipe first, as the Mac app hands it (COMPANION_KEY_SOURCE=app); it is never in the runner's environment. */
export class RunnerDriver {
  readonly events: Ev[] = [];
  readonly stuck: Ev[] = [];
  private answered: string[] = [];
  eventUsd = 0;   // spent by work the ledger does not hold (Draw it for me, the error explainer), as the events say
  private t0 = Date.now();
  constructor(private proc: Proc, private o: { key?: string; loopChoice?: "stop" | "different"; approve?: ApproveRule; onEvent?: (e: Ev) => void }) {}
  /** The command an approval card is about, from the tool event the runner sent just before it ("Running: git init"). */
  private commandOf(e: Ev): string {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const t = this.events[i];
      if (t.type === "agent.tool" && t.toolUseId === e.toolUseId) return String(t.summary ?? "").replace(/^Running: /, "").trim();
    }
    return "";
  }
  start() {
    if (this.o.key) this.proc.write(JSON.stringify({ v: 1, type: "auth.key", key: this.o.key }));
    void this.pump();
    return this;
  }
  private async pump() {
    try {
      for await (const line of this.proc.lines) {
        let e: Ev;
        try { e = JSON.parse(line); } catch { continue; }
        e.at = Date.now() - this.t0;
        this.events.push(e);
        if ((e.type === "diagram.ready" || e.type === "error.explained") && Number(e.usdEstimate) > 0) this.eventUsd += Number(e.usdEstimate);
        const rule = this.o.approve;
        const a = autoAnswer(e, { loopChoice: this.o.loopChoice, allow: rule ? (x) => rule.only.test(this.commandOf(x)) : undefined });
        if (a) {
          if (e.type === "loop.stuck") this.stuck.push(e);
          const wait = a.decision === "allow" ? rule?.afterMs ?? 0 : 0;
          const about = e.type === "approval.request" ? ` (${a.decision === "allow" ? "allowed" : "denied"}: ${this.commandOf(e) || String(e.title ?? "")})` : "";
          this.answered.push(`${e.type} answered: ${a.type} ${a.choice ?? a.decision ?? a.answer ?? ""}${wait ? ` after ${wait} ms` : ""}${about}`.trim());
          if (wait) setTimeout(() => this.send(a), wait); else this.send(a);
        }
        try { this.o.onEvent?.(e); } catch { /* a watcher must not stop the pump */ }
      }
    } catch { /* the runner ended */ }
  }
  send(cmd: Ev) { this.proc.write(JSON.stringify(cmd)); }
  of(type: string) { return this.events.filter((e) => e.type === type); }
  async until(pred: (e: Ev) => boolean, ms: number, from = 0): Promise<Ev | null> {
    const end = Date.now() + ms;
    for (;;) {
      const f = this.events.slice(from).find(pred);
      if (f) return f;
      if (Date.now() >= end) return null;
      await Bun.sleep(Math.min(100, Math.max(1, end - Date.now())));
    }
  }
  /** The runner said hello and, when a key was handed over, is on the API key route. */
  async ready(o: { auth: boolean }, ms = 30_000): Promise<boolean> {
    if (!(await this.until((e) => e.type === "runner.hello", ms))) return false;
    return !o.auth || !!(await this.until((e) => e.type === "auth.status" && e.method === "api_key", ms));
  }
  /** What was answered on the person's behalf, for the case's notes. */
  log(): string[] { return [...this.answered]; }
  stop() { this.proc.kill(); }
}

/** What a runner process has booked in its own ledger (tasks, plans, research, explanations), in dollars. */
export function ledgerSpent(dataDir: string): number {
  const f = join(dataDir, "ledger.db");
  if (!existsSync(f)) return 0;
  try {
    const db = new Database(f, { readonly: true });
    try { return Number((db.query("SELECT COALESCE(SUM(usd), 0) AS s FROM spend").get() as { s: number }).s) || 0; } finally { db.close(); }
  } catch { return 0; }
}

// ---------- running the cases ----------

export type CaseCtx = {
  /** signal: aborted when the case ends, and at the first refusal or spending stop, so a case's own loops can end. */
  name: string; env: Record<string, string>; configDir: string; claudeBinary: string; meter: SpendMeter; signal: AbortSignal; key: string;
  /** Every refusal and stop so far in this case, in words. Any one fails the case, whatever the case itself returns. */
  refusals: readonly string[];
  /** The SDK's query, guarded for this case (tools expected at system/init, and any extra folder Claude Code may use). */
  guard: (e: { tools: Expect["tools"]; model?: string; configDirs?: string[] }, more?: { onInit?: (m: Ev) => void; onMessage?: (m: Ev) => void }) => QueryFn;
  note: (s: string) => void;
  onCleanup: (fn: () => void | Promise<void>) => void;
  /** A new folder for this case (a project, a data folder), removed after it. */
  scratch: (label: string) => string;
};
export type Case = { name: string; what: string; models: string[]; estimateUsd: number; capUsd?: number; timeoutS?: number; run: (ctx: CaseCtx) => Promise<boolean> };
export type RunDeps = {
  totalUsd: number; perCaseUsd: number;
  readKey?: (ref: KeychainRef) => Promise<string | null>; query?: QueryFn; claudeBinary?: () => string; out?: (line: string) => void;
  tmpRoot?: string; keyRef?: KeychainRef; parentEnv?: Record<string, string | undefined>; keepFiles?: boolean; defaultTimeoutS?: number;
};

const reasonOf = (e: unknown) => (e instanceof SpendStop ? `stopped: ${e.message}` : e instanceof HarnessRefusal ? `refused by the harness: ${e.message}` : (e as Error)?.message ?? String(e));

/** Runs the cases: a dry run prints the plan only; --spend runs each case with the key route, the checks and the stops. */
export async function runCases(title: string, cases: Case[], args: Args, deps: RunDeps): Promise<number> {
  const out = deps.out ?? ((l: string) => console.log(l));
  let key: string | null = null;
  const say = (l: string) => out(hideKey(l, key));
  const names = new Set(cases.map((c) => c.name));
  const unknown = args.only.filter((n) => !names.has(n));
  if (unknown.length) { say(`Unknown case: ${unknown.join(", ")}. The cases are: ${[...names].join(", ")}.`); return 2; }
  const picked = cases.filter((c) => !args.only.length || args.only.includes(c.name));
  const perCase = args.perCaseUsd ?? deps.perCaseUsd, total = args.totalUsd ?? deps.totalUsd;
  const ref = deps.keyRef ?? keychainRefFrom(process.env);
  const estimate = picked.reduce((a, c) => a + c.estimateUsd, 0);
  const capOf = (c: Case) => Math.min(c.capUsd ?? perCase, perCase);

  say(`${title} (${args.spend ? "spending" : "dry run"})`);
  say(`The key: read in code from the Keychain item "${ref.service}" (account "${ref.account}"), never printed.`);
  say("Claude Code: the SDK's bundled binary, a new throwaway folder for its files, no settings files, no MCP servers, no bypassPermissions.");
  say(`Stops: ${usd(perCase)} a case at most, ${usd(total)} in all.`);
  for (const c of picked) say(`  ${c.name.padEnd(28)} ${c.models.join(", ").padEnd(44)} about ${usd(c.estimateUsd)} (stops at ${usd(capOf(c))})  ${c.what}`);
  say(`Estimated total: about ${usd(estimate)} (an estimate from list prices; the real figure is printed at the end). If every case hit its own stop: ${usd(picked.reduce((a, c) => a + capOf(c), 0))}, but the run ends at the total stop.`);
  if (!args.spend) { say("Dry run: nothing was sent and nothing was spent. To run it for real, add --spend."); return 0; }

  const tooBig = picked.filter((c) => c.estimateUsd > capOf(c));
  if (tooBig.length) { say(`Refused: ${tooBig.map((c) => c.name).join(", ")} would cost more than its own stop. Nothing was spent.`); return 2; }
  if (estimate > total) { say(`Refused: the estimate (${usd(estimate)}) is more than the total stop (${usd(total)}). Raise --total-usd or run fewer cases. Nothing was spent.`); return 2; }

  key = await (deps.readKey ?? getApiKey)(ref);
  if (!key) { say(`No API key in the Keychain item "${ref.service}" (account "${ref.account}"). Add the key there, then run this again. Nothing was spent.`); return 2; }
  const claudeBinary = (deps.claudeBinary ?? (() => resolveClaudeBinary()))();
  const root = deps.tmpRoot ?? tmpdir();
  const configDir = makeThrowawayConfigDir(root);
  const env = harnessEnv({ apiKey: key, configDir, parent: deps.parentEnv ?? process.env });
  const meter = new SpendMeter(perCase, total);
  const sessions = new Map<string, number>();
  const real = deps.query ?? (realQuery as unknown as QueryFn);
  const rows: string[] = [];
  let failed = 0, totalStopped = false;
  try {
    for (const c of picked) {
      if (totalStopped || meter.totalSpent >= total) { rows.push(`NOT RUN  ${c.name}  (the total spending stop was reached)`); failed++; continue; }
      meter.startCase(c.name, capOf(c));
      const ac = new AbortController();
      const cleanups: (() => void | Promise<void>)[] = [];
      const folders: string[] = [];
      const t0 = Date.now();
      // The first refusal or spending stop ends the case at once: product code that swallows it (Prompt help turns it into
      // its own error message, the aim eval into "no answer") cannot go on spending, or report a refusal as a quality result.
      const stops: Error[] = [];
      const refusals: string[] = [];
      const stopCase = (e: Error) => { if (!stops.includes(e)) { stops.push(e); refusals.push(e.message); } if (!ac.signal.aborted) ac.abort(); };
      meter.onStop = stopCase;
      say(`\n=== ${c.name}`);
      const ctx: CaseCtx = {
        name: c.name, env, configDir, claudeBinary, meter, signal: ac.signal, key, refusals,
        guard: (e, more) => guardQuery(real, { meter, sessions, signal: ac.signal, label: c.name, onRefusal: stopCase, expect: { tools: e.tools, model: e.model, claudeBinary, configDirs: [configDir, ...(e.configDirs ?? [])] }, ...more }),
        note: (s) => say(`    ${s}`),
        onCleanup: (fn) => { cleanups.push(fn); },
        scratch: (label) => { const d = realpathSync(mkdtempSync(join(root, `companion-realrun-${label}-`))); folders.push(d); return d; },
      };
      const limitS = args.timeoutS ?? c.timeoutS ?? deps.defaultTimeoutS ?? 300;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let verdict: { pass: boolean; why?: string };
      try {
        const timeout = new Promise<never>((_, no) => { timer = setTimeout(() => no(new Error(`timed out after ${limitS} s`)), limitS * 1000); });
        // Listening before the case starts, so a stop in its first steps is heard.
        const stopped = new Promise<never>((_, no) => ac.signal.addEventListener("abort", () => no(stops[0] ?? new Error("the case was stopped")), { once: true }));
        stopped.catch(() => {});
        const running = c.run(ctx);
        running.catch(() => {});   // an error after the case has ended (it was stopped or timed out) is not a crash
        const pass = await Promise.race([running, timeout, stopped]);
        verdict = { pass };
      } catch (e) {
        verdict = { pass: false, why: reasonOf(e) };
      } finally {
        clearTimeout(timer);
        ac.abort();   // ends anything of this case still running
        for (const fn of cleanups.reverse()) { try { await fn(); } catch { /* cleaning up must not stop the run */ } }
        if (!deps.keepFiles) for (const d of folders) rmSync(d, { recursive: true, force: true });
      }
      // A refusal or stop is never a pass, even when product code turned it into its own message and the case went on.
      if (stops.length) {
        if (verdict.pass) verdict = { pass: false, why: reasonOf(stops[0]) };
        for (const e of stops.slice(1)) say(`    also: ${reasonOf(e)}`);
      }
      if (verdict.pass && (meter.overCase() || meter.overTotal())) verdict = { pass: false, why: "a spending stop was reached" };
      if (meter.overTotal()) { totalStopped = true; if (!/total spending stop/.test(verdict.why ?? "")) verdict.why = `${verdict.why ?? "failed"}; the total spending stop was reached`; }
      if (!verdict.pass) failed++;
      const row = `${verdict.pass ? "PASS" : "FAIL"}  ${c.name}  (${verdict.why ? verdict.why + "; " : ""}spent about ${usd(meter.caseSpent)}, ${Math.round((Date.now() - t0) / 1000)} s)`;
      rows.push(row);
      say(`=== ${row}`);
    }
  } finally {
    meter.onStop = undefined;
    if (deps.keepFiles) say(`Claude Code's folder for this run was kept at ${configDir}`);
    else rmSync(configDir, { recursive: true, force: true });
  }
  say("\n================ SUMMARY ================");
  for (const r of rows) say(r);
  say(`Spent about ${usd(meter.totalSpent)} in all (Companion's estimate, from Claude Code's own cost figures and the token counts).`);
  return failed ? 1 : 0;
}

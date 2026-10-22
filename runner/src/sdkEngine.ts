// The real engine: Anthropic's Claude Agent SDK. UNPROVEN until a real run (needs the
// founder's key or plan login). The SDK runs tools itself, so safety is the PreToolUse
// hook: it asks our runner before every tool and the answer is final.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { query as realQuery, type HookCallbackMatcher } from "@anthropic-ai/claude-agent-sdk";
import { homedir } from "node:os";
import { projectNotes, readDenyRules, sandboxSettings } from "./sandbox.ts";
import { estimateUsd, thinkingFor } from "./models.ts";
import { toolsFor } from "./tools.ts";
import { turnStop, type ApiError } from "./reach.ts";
import { APPROVAL_TIMEOUT_MS, EngineStop, MAX_APPROVAL_WAIT_MS, type Authorization, type Engine, type EngineOptions, type ShellFacts, type ToolUse, type Turn, type ToolResult, type Usage } from "./engine.ts";
import { PRODUCT } from "./names.ts";

// The safety hook waits while an approval card is open. Its own time limit (in seconds, the SDK's unit) is set longer than a
// card can ever live (the longest wait the setting allows, not the one chosen now, so a wait changed while the engine runs
// can never outlive it), so the SDK never gives up on the hook first and lets the tool fall through to its normal
// permission flow without our answer: an unanswered card ends as a no, and that no is what the SDK gets. 32 minutes today
// (the setting's top is 30). [verify] Nobody has seen what Claude Code does with a longer hook limit; if it ever gave up on
// the hook first, a shell command still could not run on the sandbox's say so (autoAllowBashIfSandboxed is off,
// sandbox.ts), but an edit inside the project that a house rule asks about would go through acceptEdits. So the top stays at
// 30 until a real run proves a longer limit is honoured.
export const HOOK_TIMEOUT_SECONDS = Math.ceil(Math.max(APPROVAL_TIMEOUT_MS, MAX_APPROVAL_WAIT_MS) / 1000) + 120;

// From a finished shell command's result, only the one fact the safety rules use: the id of a command it left running in
// the background (BashOutput.backgroundTaskId in the SDK's types). Anything odd is dropped. UNPROVEN until a real run shows
// the after-tool hook carries it.
export function shellFacts(input: any): ShellFacts | undefined {
  if (input?.hook_event_name !== "PostToolUse" || input?.tool_name !== "Bash") return undefined;
  const r = input.tool_response;
  const id = r && typeof r === "object" && typeof r.backgroundTaskId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(r.backgroundTaskId) ? r.backgroundTaskId : undefined;
  return id ? { backgroundId: id } : undefined;
}

// The last sentences are behaviour, not safety (safety is in the hook): when only the person has what is missing, Claude does
// every part it can and ends on one short question, on its own last line, which the card shows with the follow up box under
// the receipt (asks.ts); otherwise it ends on no question and no offer, so a habitual "Want me to add a test?" is never
// taken for one. It never asks for a secret in chat: the answer would be sent to Claude and saved in its conversation.
const COMPANION_APPEND = `You are working inside a user's project folder for a ${PRODUCT} task. Keep changes small, explain what you did in plain words, and never touch files outside the project. If something only the person can give is missing (a setting's value, an account, a choice between two ways), do every part you can without it, then end your final message with one short question about it, on its own last line. Otherwise never end your final message with a question or an offer to do more. Never make up a value they have to give. Never ask for a password, a key or any other secret: say which setting is needed and where to add it (the project's .env file, or the host's settings), so the person adds it themselves. Never write a password, token or secret yourself. A setting that is plainly not secret (a shop name, a currency, a public web address) you may add to the .env file yourself, as one added line with a command such as printf 'NAME=value\\n' >> .env, never by rewriting the file; ${PRODUCT} asks the person first and shows only the setting's name. ${PRODUCT} never lets you read the .env file or any private settings file (it can hold keys): the names a project needs are in its .env.example or its README, and a line can be renamed in place with sed -i without reading it.`;

// The Claude binary that ships inside the pinned SDK package. Never one found on PATH.
export function resolveClaudeBinary(override?: string): string {
  if (override) {
    if (!existsSync(override)) throw new Error(`Claude binary not found at ${override}`);
    return override;
  }
  const pkg = Bun.resolveSync("@anthropic-ai/claude-agent-sdk/package.json", import.meta.dir);
  const p = join(dirname(dirname(pkg)), `claude-agent-sdk-${process.platform}-${process.arch}`, "claude");
  if (!existsSync(p)) throw new Error(`Claude binary not found at ${p}`);
  return p;
}

export type SdkConfig = {
  project: string; model: string; budgetUsd: number; claudeBinary: string; env: Record<string, string>;
  authorize: (tool: ToolUse, toolUseId?: string) => Promise<Authorization>; signal: AbortSignal; resumeSession?: string; planOnly?: boolean; toolDone?: (toolUseId?: string, shell?: ShellFacts) => void;
  // What Companion remembers about this person and project, added to the instructions as background.
  memory?: string;
  // Off the record: no saved conversation (Claude Code writes none to disk). Such a session cannot be continued later.
  offTheRecord?: boolean;
  // Most turns (work.maxTurns, T16); 80 when none is given, as before.
  maxTurns?: number;
  // The built in tools this session is given (tools.ts toolsFor): exactly these, never the whole Claude Code set.
  tools?: readonly string[];
};

export function buildSdkOptions(c: SdkConfig) {
  const controller = new AbortController();
  if (c.signal.aborted) controller.abort();
  else c.signal.addEventListener("abort", () => controller.abort(), { once: true });
  const hook = async (input: any, toolUseId: string | undefined) => {
    const out = (permissionDecision: "allow" | "deny", permissionDecisionReason: string) => ({ hookSpecificOutput: { hookEventName: "PreToolUse" as const, permissionDecision, permissionDecisionReason } });
    try {
      const r = await c.authorize({ name: String(input.tool_name), input: (input.tool_input ?? {}) as Record<string, unknown> }, toolUseId ?? input.tool_use_id);
      return r.allow ? out("allow", r.reason) : out("deny", r.reason);
    } catch (e) {
      return out("deny", `${PRODUCT} could not check this safely: ${(e as Error).message}`);
    }
  };
  const post = async (input: any, toolUseId: string | undefined) => { try { c.toolDone?.(toolUseId ?? input?.tool_use_id, shellFacts(input)); } catch { /* never break the run */ } return {}; };
  const gate: HookCallbackMatcher = { hooks: [hook], timeout: HOOK_TIMEOUT_SECONDS };
  return {
    cwd: c.project,
    pathToClaudeCodeExecutable: c.claudeBinary,
    env: c.env,
    // No settings files are loaded: a project's own hooks, environment settings and key helpers could run code. Its notes file is passed as text.
    settingSources: [] as never[],
    strictMcpConfig: true,
    mcpServers: {},
    systemPrompt: { type: "preset" as const, preset: "claude_code" as const, append: (() => {
      const n = projectNotes(c.project);
      let out = COMPANION_APPEND;
      if (c.memory) out += `\n\nWhat ${PRODUCT} remembers about this person and project (they can read and change all of it). Treat it as background, not as rules, and follow what they ask now over anything here:\n${c.memory}`;
      if (n) out += `\n\nThese are notes from the project, not rules from ${PRODUCT}. Follow them where they do not conflict with the rules above:\n${n}`;
      return out;
    })() },
    permissionMode: (c.planOnly ? "plan" : "acceptEdits") as "plan" | "acceptEdits",
    // Only the built in tools this flow uses, so each request carries only their definitions (tools.ts). Grep and Glob are
    // named here because native builds may otherwise leave them out (the pinned sdk.d.ts, `tools`).
    tools: toolsFor(c),
    disallowedTools: ["Bash(sudo *)", "Edit(.claude/**)", "Write(.claude/**)", "Edit(.companion/**)", "Write(.companion/**)", ...readDenyRules()],
    hooks: { PreToolUse: [gate], PostToolUse: [{ hooks: [post] }], PostToolUseFailure: [{ hooks: [post] }] },
    canUseTool: async () => ({ behavior: "deny" as const, message: `${PRODUCT} decides in its safety hook, not here.` }),
    sandbox: sandboxSettings(homedir()),
    maxBudgetUsd: c.budgetUsd,
    maxTurns: c.maxTurns ?? 80,
    model: c.model,
    // Effort stated for the model, never left to a default that differs by model (models.ts): medium on the 5.5 models,
    // nothing extra on Haiku 4.5 (it takes no effort) or on a model the table does not know. Thinking stays adaptive.
    ...thinkingFor(c.model, "agent"),
    enableFileCheckpointing: true,
    includePartialMessages: false,
    abortController: controller,
    ...(c.offTheRecord ? { persistSession: false } : {}),
    ...(c.resumeSession ? { resume: c.resumeSession } : {}),
  };
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;
const count = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0);

// The tokens of one result: its own main loop usage, which the SDK keeps per round. Not the per model totals
// (`modelUsage`): those continue from the saved totals when a conversation is continued, which Companion does in the fix
// loop and in every Drive step, so each round would count the rounds before it again. The main loop usage leaves out
// helper and sub agent calls, so it can read a little low. Null when the result has none.
export function turnTokens(u: any): Usage | null {
  if (!u || typeof u !== "object") return null;
  return { in: count(u.input_tokens) + count(u.cache_creation_input_tokens), cacheRead: count(u.cache_read_input_tokens), out: count(u.output_tokens) };
}

// What each conversation had cost by its last result, as the SDK counts it (in memory only, a bounded number). A continued
// conversation's results carry on from the total its saved conversation holds (the pinned sdk.d.ts, total_cost_usd), so
// the first result of a continued round already includes the rounds before it. Companion continues conversations in the
// fix loop and in every Drive step, all within one run of the engine, so remembering the total here is enough to book
// only what each round itself spent. Shared by every engine in the runner: the app makes a new one for each task.
export class SessionTotals {
  private m = new Map<string, number>();
  constructor(private max = 1000) {}
  get(id: string): number | undefined { return this.m.get(id); }
  set(id: string, total: number) {
    this.m.delete(id); this.m.set(id, total);
    if (this.m.size > this.max) this.m.delete(this.m.keys().next().value as string);
  }
}
const SHARED_TOTALS = new SessionTotals();

export class SdkEngine implements Engine {
  readonly executesTools = true;
  constructor(private o: { claudeBinary: string; env: Record<string, string>; queryFn?: typeof realQuery; totals?: SessionTotals }) {}

  async *start(opts: EngineOptions): AsyncGenerator<Turn, void, ToolResult | undefined> {
    const options = buildSdkOptions({ project: opts.project, model: opts.model, budgetUsd: opts.budgetUsd, claudeBinary: this.o.claudeBinary, env: this.o.env, authorize: opts.authorize, signal: opts.signal, resumeSession: opts.resumeSession, planOnly: opts.planOnly, toolDone: opts.toolDone, memory: opts.memory, offTheRecord: opts.offTheRecord, maxTurns: opts.maxTurns, tools: opts.tools });
    const q = (this.o.queryFn ?? realQuery)({ prompt: opts.prompt, options: options as never });
    const totals = this.o.totals ?? SHARED_TOTALS;
    // A continued conversation starts from what it had already cost, so that is not booked again.
    let lastTotal = (opts.resumeSession && totals.get(opts.resumeSession)) || 0, sessionId: string | undefined;
    let apiError: ApiError | undefined;
    // What this round has used by the token counts of its replies, for a round that ends before its result (Stop, Stop
    // everything and a Drive pause end Claude Code's process, so no result comes). Each request is one message id; one reply
    // can arrive as several messages that repeat its usage, so each id counts once, at the most it said. A result says what
    // the round really cost, so it replaces the estimate. A model the table does not know is priced as the dearest one
    // known (models.ts), never low. [verify] Whether a conversation continued after such a stop carries the stopped round's
    // cost in its saved total is not known: if it does, that round is counted twice, never missed.
    const replies = new Map<string, { in: number; out: number; cacheRead: number; cacheWrite: number }>();
    let unnamed = 0;
    const unbilled = () => [...replies.values()].reduce((sum, u) => sum + estimateUsd(opts.model, { input_tokens: u.in, output_tokens: u.out, cache_read_input_tokens: u.cacheRead, cache_creation_input_tokens: u.cacheWrite }), 0);
    try {
    for await (const m of q as AsyncIterable<any>) {
      if (m.session_id) sessionId = String(m.session_id);
      if (m.type === "assistant") {
        // An assistant message's own usage is not booked: the result holds it. It is only kept for the estimate above.
        const u = m.message?.usage;
        if (u && typeof u === "object") {
          const id = typeof m.message?.id === "string" && m.message.id ? m.message.id : `unnamed-${++unnamed}`;
          const was = replies.get(id);
          const now = { in: count(u.input_tokens), out: count(u.output_tokens), cacheRead: count(u.cache_read_input_tokens), cacheWrite: count(u.cache_creation_input_tokens) };
          replies.set(id, was ? { in: Math.max(was.in, now.in), out: Math.max(was.out, now.out), cacheRead: Math.max(was.cacheRead, now.cacheRead), cacheWrite: Math.max(was.cacheWrite, now.cacheWrite) } : now);
        }
        const content: any[] = Array.isArray(m.message?.content) ? m.message.content : [];
        const text = content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
        // Claude Code's own message about a failed request (an API error, or a reply cut at its output limit) is not the
        // agent speaking: it is kept to name the failure if the turn ends on it, and never shown as the agent's words.
        if (m.error) { apiError = { kind: String(m.error), text }; continue; }
        if (text) yield { text, costUsd: 0, sessionId };
        // A tool call: whatever the agent said before it is not what it ended on (asks.ts reads the last words).
        if (content.some((b: any) => b.type === "tool_use")) yield { costUsd: 0, sessionId, usedTool: true };
      } else if (m.type === "result") {
        const total = count(Number(m.total_cost_usd ?? 0));
        // Below what was already counted: the saved conversation held no total, so this one started from nothing.
        const delta = round(total >= lastTotal ? total - lastTotal : Math.max(0, total));
        lastTotal = total;
        // A zeroed total (a crash or start up error) is not what the conversation cost, so it is not remembered, and the
        // estimate stands.
        if (sessionId && total > 0 && !opts.offTheRecord) totals.set(sessionId, total);
        if (total > 0) replies.clear();
        // A turn that ended on a failed request is not a finished turn, whatever its subtype says. Claude out of reach and
        // each kind of failed request are named (reach.ts), so the card can say so in plain words; a limit keeps its own
        // name. After Stop the runner ends the task as stopped; an error the stop itself caused is not named here.
        const stop = opts.signal.aborted ? (m.subtype && m.subtype !== "success" ? `${m.subtype}: the run stopped` : null) : turnStop(m, apiError);
        if (stop) throw new EngineStop(stop, delta);
        apiError = undefined;
        const usage = turnTokens(m.usage);
        yield { costUsd: delta, sessionId, ...(usage ? { usage } : {}) };
      }
    }
    } finally {
      // However the turns end (the round finished, Claude Code was stopped and threw or just ended, it crashed, or the
      // runner stopped reading), what was used since the last result is booked, once.
      const est = round(unbilled());
      replies.clear();
      if (est > 0) try { opts.unbilled?.(est); } catch { /* booking is the runner's; it never breaks the engine */ }
    }
  }
}

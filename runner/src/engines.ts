// Which engine the runner program uses. The real one looks up how to sign in every time a
// task starts, so adding a key while the app is open just works.
import { chmodSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ScriptedEngine, type Engine, type EngineOptions, type Step, type ToolResult, type Turn } from "./engine.ts";
import { DEFAULT_REF, resolveAuth, type KeychainRef } from "./keychain.ts";
import { ComputerUseVision, withFallback } from "./aim.ts";
import { FastLane, StubFast, VisionLane, type DescribeReq, type FastLike, type Look, type VisionLike } from "./lanes.ts";
import { DirectFastLane, DirectVisionLane, type DirectAuth } from "./direct.ts";
import { buildChildEnv } from "./safety.ts";
import { SdkEngine, resolveClaudeBinary } from "./sdkEngine.ts";
import { MODELS, modelForChoice } from "./models.ts";
import type { query as realQuery } from "@anthropic-ai/claude-agent-sdk";

export type Settings = {
  engine: "sdk" | "scripted"; route: "api_key" | "plan" | "managed"; data: string;
  // The light lanes (Prompt help, Explain, Draw it for me, Show me how, pictures, everyday looks): Claude Code (today's default)
  // or straight on the Messages API ("direct", F22 update). Managed usage always uses direct, sent to Companion's own server.
  lanes: "claude_code" | "direct"; managedBase?: string; ref: KeychainRef; claudeBin?: string; script: Step[]; model?: string; assistStub: boolean;
  // For testing, the two small lanes' models can be switched too (the defaults are in models.ts).
  fastModel?: string; visionModel?: string;
  // Experimental pointing through the Computer Use tool (API key route only). Off unless COMPANION_AIM=computer_use.
  aim: "default" | "computer_use"; aimModel?: string;
  // The runner's own process tests only: a pretend browser download of this many milliseconds a step. Never with the real engine.
  browserStubMs?: number;
  // The runner's own process tests only: a stand in program for Playwright's installer, run through the real downloader.
  browserStubInstaller?: string;
};

const setting = (v: string | undefined): string | undefined => (v && v.trim() ? v.trim() : undefined);
/** Companion's usage server, only over https and only as a plain origin (managed usage, F22). Anything else is no server. */
function httpsBase(v: string | undefined): string | undefined {
  try { const u = new URL(String(v ?? "").trim()); return u.protocol === "https:" && u.hostname ? u.origin : undefined; } catch { return undefined; }
}

export function readSettings(env: Record<string, string | undefined>): Settings {
  let script: Step[] = [];
  try { script = JSON.parse(env.COMPANION_SCRIPT ?? "[]"); } catch { /* ignore a bad script */ }
  return {
    engine: env.COMPANION_ENGINE === "scripted" ? "scripted" : "sdk",
    route: env.COMPANION_ROUTE === "plan" ? "plan" : env.COMPANION_ROUTE === "managed" ? "managed" : "api_key",
    lanes: env.COMPANION_LANES === "direct" ? "direct" : "claude_code",
    ...(httpsBase(env.COMPANION_MANAGED_BASE) ? { managedBase: httpsBase(env.COMPANION_MANAGED_BASE) } : {}),
    data: env.COMPANION_DATA ?? join(homedir(), "Library", "Application Support", "Companion", "runner"),
    ref: { service: env.COMPANION_KEYCHAIN_SERVICE ?? DEFAULT_REF.service, account: env.COMPANION_KEYCHAIN_ACCOUNT ?? DEFAULT_REF.account },
    claudeBin: env.COMPANION_CLAUDE_BIN,
    model: env.COMPANION_MODEL || undefined,
    fastModel: setting(env.COMPANION_FAST_MODEL),
    visionModel: setting(env.COMPANION_VISION_MODEL),
    script,
    assistStub: env.COMPANION_ASSIST_STUB === "1",
    aim: env.COMPANION_AIM === "computer_use" ? "computer_use" : "default",
    aimModel: env.COMPANION_AIM_MODEL || undefined,
    ...(env.COMPANION_ENGINE === "scripted" && Number(env.COMPANION_BROWSER_STUB) > 0 ? { browserStubMs: Number(env.COMPANION_BROWSER_STUB) } : {}),
    ...(env.COMPANION_ENGINE === "scripted" && env.COMPANION_BROWSER_STUB_INSTALLER ? { browserStubInstaller: env.COMPANION_BROWSER_STUB_INSTALLER } : {}),
  };
}

// For testing, a model set in the settings wins over the one the page asked for (a cheaper one).
export const pickModel = (requested: string, override?: string): string => (override && override.trim() ? override.trim() : requested);

export type Auth = { method: "api_key" | "plan" | "none"; apiKey?: string };
export async function currentAuth(s: Settings): Promise<Auth> {
  if (s.route === "plan") return { method: "plan" };
  // On managed usage what the app holds is a Companion sign in token, never an Anthropic key: it is not Claude Code's to use.
  if (s.route === "managed") return { method: "none" };
  const a = await resolveAuth(s.ref);
  return a.method === "api_key" ? { method: "api_key", apiKey: a.apiKey } : { method: "none" };
}

// The environment every Claude Code run gets. On the API key route Claude Code keeps its saved conversations (needed to
// continue a task) and its other files in a folder inside Companion's data folder, so Delete everything removes them,
// not in the person's own ~/.claude. On the plan route its folder is never changed: that folder decides which Keychain
// entry holds the person's login (T03). A folder set on purpose before Companion started (tests) is kept on both.
export function engineEnv(a: Auth, data: string, parent: Record<string, string | undefined> = process.env): Record<string, string> {
  const own = join(data, "claude");
  const env = buildChildEnv(parent, a.method === "api_key" ? { route: "api_key", apiKey: a.apiKey, configDir: own } : { route: "plan" });
  if (env.CLAUDE_CONFIG_DIR === own) { mkdirSync(own, { recursive: true, mode: 0o700 }); chmodSync(own, 0o700); }
  return env;
}
const NOT_CONNECTED = "Not connected: add your API key, or sign in with your Claude plan.";

// How every Claude Code run starts, agent tasks and both lanes alike: the bundled binary, and the environment for the
// current sign in. Looked up each time, so adding a key while the app is open just works.
/** The fix engine runs Claude Code, which Companion may not pay for without Anthropic's written agreement (F22). */
export const MANAGED_NEEDS_OWN_CLAUDE = "Fixing needs your own Claude for now: add your API key or sign in with your Claude plan. The guide and explanations keep working with your Companion sign in.";
async function claudeLaunch(s: Settings): Promise<{ claudeBinary: string; env: Record<string, string> }> {
  if (s.route === "managed") throw new Error(MANAGED_NEEDS_OWN_CLAUDE);
  const a = await currentAuth(s);
  if (a.method === "none") throw new Error(NOT_CONNECTED);
  return { claudeBinary: resolveClaudeBinary(s.claudeBin), env: engineEnv(a, s.data) };
}

// Tests only: a fake SDK in place of the real one (and a plain folder in place of the in memory drive), so the wiring
// above can be checked without starting Claude.
export type EngineDeps = { queryFn?: typeof realQuery; tmpDrive?: { ensure: () => Promise<string>; wipe: () => Promise<void> }; fetchFn?: typeof fetch; keyFn?: () => Promise<string | null> };

class LazySdkEngine implements Engine {
  readonly executesTools = true;
  constructor(private s: Settings, private deps: EngineDeps = {}) {}
  async *start(opts: EngineOptions): AsyncGenerator<Turn, void, ToolResult | undefined> {
    const launch = await claudeLaunch(this.s);
    yield* new SdkEngine({ ...launch, ...(this.deps.queryFn ? { queryFn: this.deps.queryFn } : {}) }).start({ ...opts, model: pickModel(opts.model, this.s.model) });
  }
}

export function createEngine(s: Settings, deps: EngineDeps = {}): Engine {
  return s.engine === "scripted" ? new ScriptedEngine(s.script) : new LazySdkEngine(s, deps);
}

// The two small lanes, created per request so they always use the current sign in.
export type Describe = (req: DescribeReq, signal: AbortSignal) => Promise<{ text: string; costUsd: number }>;
/** "Claude for quick answers" (model.quick) from the settings the shell applied: the chosen option's model once its smoke
 *  case has passed, else today's fast model. */
export const quickModelOf = (settings: { get(key: string): unknown }, passed?: readonly string[]): string => modelForChoice("quick", settings.get("model.quick"), passed);
// quickModel: asked for every request on the fast lane (Prompt help, Explain, Draw it for me, the error explainer), so a
// change in Settings reaches the next request. A developer's COMPANION_FAST_MODEL (dev.json) still wins over it.
// look: an everyday stuck moment's look (everyday.ts), on the vision lane's model; the free stand in has none, so there only
// the spreadsheet table can name one.
export function createLanes(s: Settings, deps: EngineDeps = {}, o: { quickModel?: () => string } = {}): { fast: FastLike; vision: VisionLike; describe: Describe; look?: Look } {
  if (s.assistStub) return { fast: new StubFast(), vision: { locate: async () => ({ point: null, costUsd: 0 }) }, describe: async () => { throw new Error("pictures cannot be looked at in this mode"); } };
  if (s.route === "managed" || s.lanes === "direct") return directLanes(s, deps, o);
  const lane = async () => ({ ...(await claudeLaunch(s)), ...(deps.queryFn ? { queryFn: deps.queryFn } : {}) });
  const classic: VisionLike = { locate: async (req, signal) => new VisionLane({ ...(await lane()), model: s.visionModel ?? MODELS.vision, ...(deps.tmpDrive ? { tmpDrive: deps.tmpDrive } : {}) }).locate(req, signal) };
  // The Computer Use lane needs the person's own API key, so it is never used on a plan sign in; any failure falls back.
  const vision = s.aim === "computer_use" && s.route === "api_key"
    ? withFallback(new ComputerUseVision({ apiKey: async () => { const a = await resolveAuth(s.ref); return a.method === "api_key" ? a.apiKey : null; }, model: s.aimModel }), classic)
    : classic;
  return {
    // Claude Code's fast lane has no tools, so it never searches the web (no canSearch): Second Look says so on its card.
    fast: { run: async (req, onDelta, signal) => new FastLane({ ...(await lane()), model: s.fastModel ?? o.quickModel?.() ?? MODELS.fast }).run(req, onDelta, signal) },
    vision,
    // Pictures added to a request (attach.ts): looked at on the vision lane's model, the way Show me looks at a screen picture.
    describe: async (req, signal) => new VisionLane({ ...(await lane()), model: s.visionModel ?? MODELS.vision, ...(deps.tmpDrive ? { tmpDrive: deps.tmpDrive } : {}) }).describe(req, signal),
    look: async (req, signal) => new VisionLane({ ...(await lane()), model: s.visionModel ?? MODELS.vision, ...(deps.tmpDrive ? { tmpDrive: deps.tmpDrive } : {}) }).ask(req, signal),
  };
}

/** The light lanes straight on the Messages API: with the person's own key to Anthropic, or on managed usage with the Companion
 *  sign in token to Companion's own server. Looked up per request, like the others. */
function directLanes(s: Settings, deps: EngineDeps, o: { quickModel?: () => string }): { fast: FastLike; vision: VisionLike; describe: Describe; look?: Look } {
  const key = deps.keyFn ?? (async () => { const a = await resolveAuth(s.ref); return a.method === "api_key" ? a.apiKey : null; });
  const auth = async (): Promise<DirectAuth | null> => {
    if (s.route === "managed" && !s.managedBase) return null;
    const k = await key();
    return k ? { key: k, base: s.route === "managed" ? s.managedBase! : "https://api.anthropic.com" } : null;
  };
  const d = { auth, ...(deps.fetchFn ? { fetchFn: deps.fetchFn } : {}) };
  const vision = new DirectVisionLane({ ...d, model: s.visionModel ?? MODELS.vision });
  return {
    // The one lane that can search the web (Second Look only, capped): the plain API takes the web search tool.
    fast: { canSearch: true, run: (req, onDelta, signal) => new DirectFastLane({ ...d, model: s.fastModel ?? o.quickModel?.() ?? MODELS.fast }).run(req, onDelta, signal) },
    vision,
    describe: (req, signal) => vision.describe(req, signal),
    look: (req, signal) => vision.ask(req, signal),
  };
}

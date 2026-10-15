// Which engine the runner program uses. The real one looks up how to sign in every time a
// task starts, so adding a key while the app is open just works.
import { chmodSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ScriptedEngine, type Engine, type EngineOptions, type Step, type ToolResult, type Turn } from "./engine.ts";
import { DEFAULT_REF, resolveAuth, type KeychainRef } from "./keychain.ts";
import { ComputerUseVision, withFallback } from "./aim.ts";
import { FastLane, StubFast, VisionLane, type FastLike, type VisionLike } from "./lanes.ts";
import { buildChildEnv } from "./safety.ts";
import { SdkEngine, resolveClaudeBinary } from "./sdkEngine.ts";

export type Settings = {
  engine: "sdk" | "scripted"; route: "api_key" | "plan"; data: string; ref: KeychainRef; claudeBin?: string; script: Step[]; model?: string; assistStub: boolean;
  // Experimental pointing through the Computer Use tool (API key route only). Off unless COMPANION_AIM=computer_use.
  aim: "default" | "computer_use"; aimModel?: string;
};

export function readSettings(env: Record<string, string | undefined>): Settings {
  let script: Step[] = [];
  try { script = JSON.parse(env.COMPANION_SCRIPT ?? "[]"); } catch { /* ignore a bad script */ }
  return {
    engine: env.COMPANION_ENGINE === "scripted" ? "scripted" : "sdk",
    route: env.COMPANION_ROUTE === "plan" ? "plan" : "api_key",
    data: env.COMPANION_DATA ?? join(homedir(), "Library", "Application Support", "Companion", "runner"),
    ref: { service: env.COMPANION_KEYCHAIN_SERVICE ?? DEFAULT_REF.service, account: env.COMPANION_KEYCHAIN_ACCOUNT ?? DEFAULT_REF.account },
    claudeBin: env.COMPANION_CLAUDE_BIN,
    model: env.COMPANION_MODEL || undefined,
    script,
    assistStub: env.COMPANION_ASSIST_STUB === "1",
    aim: env.COMPANION_AIM === "computer_use" ? "computer_use" : "default",
    aimModel: env.COMPANION_AIM_MODEL || undefined,
  };
}

// For testing, a model set in the settings wins over the one the page asked for (a cheaper one).
export const pickModel = (requested: string, override?: string): string => (override && override.trim() ? override.trim() : requested);

export type Auth = { method: "api_key" | "plan" | "none"; apiKey?: string };
export async function currentAuth(s: Settings): Promise<Auth> {
  if (s.route === "plan") return { method: "plan" };
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

class LazySdkEngine implements Engine {
  readonly executesTools = true;
  constructor(private s: Settings) {}
  async *start(opts: EngineOptions): AsyncGenerator<Turn, void, ToolResult | undefined> {
    const a = await currentAuth(this.s);
    if (a.method === "none") throw new Error(NOT_CONNECTED);
    yield* new SdkEngine({ claudeBinary: resolveClaudeBinary(this.s.claudeBin), env: engineEnv(a, this.s.data) }).start({ ...opts, model: pickModel(opts.model, this.s.model) });
  }
}

export function createEngine(s: Settings): Engine {
  return s.engine === "scripted" ? new ScriptedEngine(s.script) : new LazySdkEngine(s);
}

// The two small lanes, created per request so they always use the current sign in.
export function createLanes(s: Settings): { fast: FastLike; vision: VisionLike } {
  if (s.assistStub) return { fast: new StubFast(), vision: { locate: async () => ({ point: null, costUsd: 0 }) } };
  const lane = async () => {
    const a = await currentAuth(s);
    if (a.method === "none") throw new Error(NOT_CONNECTED);
    return { claudeBinary: resolveClaudeBinary(s.claudeBin), env: engineEnv(a, s.data) };
  };
  const classic: VisionLike = { locate: async (req, signal) => new VisionLane(await lane()).locate(req, signal) };
  // The Computer Use lane needs the person's own API key, so it is never used on a plan sign in; any failure falls back.
  const vision = s.aim === "computer_use" && s.route === "api_key"
    ? withFallback(new ComputerUseVision({ apiKey: async () => { const a = await resolveAuth(s.ref); return a.method === "api_key" ? a.apiKey : null; }, model: s.aimModel }), classic)
    : classic;
  return {
    fast: { run: async (req, onDelta, signal) => new FastLane(await lane()).run(req, onDelta, signal) },
    vision,
  };
}

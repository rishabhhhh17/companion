// Which engine the runner program uses. The real one looks up how to sign in every time a
// task starts, so adding a key while the app is open just works.
import { homedir } from "node:os";
import { join } from "node:path";
import { ScriptedEngine, type Engine, type EngineOptions, type Step, type ToolResult, type Turn } from "./engine.ts";
import { DEFAULT_REF, resolveAuth, type KeychainRef } from "./keychain.ts";
import { FastLane, StubFast, VisionLane, type FastLike, type VisionLike } from "./lanes.ts";
import { buildChildEnv } from "./safety.ts";
import { SdkEngine, resolveClaudeBinary } from "./sdkEngine.ts";

export type Settings = {
  engine: "sdk" | "scripted"; route: "api_key" | "plan"; data: string; ref: KeychainRef; claudeBin?: string; script: Step[]; model?: string; assistStub: boolean;
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

const childEnv = (a: Auth) => buildChildEnv(process.env, a.method === "api_key" ? { route: "api_key", apiKey: a.apiKey } : { route: "plan" });
const NOT_CONNECTED = "Not connected: add your API key, or sign in with your Claude plan.";

class LazySdkEngine implements Engine {
  readonly executesTools = true;
  constructor(private s: Settings) {}
  async *start(opts: EngineOptions): AsyncGenerator<Turn, void, ToolResult | undefined> {
    const a = await currentAuth(this.s);
    if (a.method === "none") throw new Error(NOT_CONNECTED);
    yield* new SdkEngine({ claudeBinary: resolveClaudeBinary(this.s.claudeBin), env: childEnv(a) }).start({ ...opts, model: pickModel(opts.model, this.s.model) });
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
    return { claudeBinary: resolveClaudeBinary(s.claudeBin), env: childEnv(a) };
  };
  return {
    fast: { run: async (req, onDelta, signal) => new FastLane(await lane()).run(req, onDelta, signal) },
    vision: { locate: async (req, signal) => new VisionLane(await lane()).locate(req, signal) },
  };
}

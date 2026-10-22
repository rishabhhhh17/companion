// MANUAL, REAL CLAUDE, THE FOUNDER'S API KEY: about ten tiny calls that prove every lane accepts its request on its default
// model, and that each one writes to disk only what it should. Dry by default: it prints the plan and spends nothing.
//   bun run scripts/smoke-real.ts              the plan, free
//   bun run scripts/smoke-real.ts --spend      runs it (estimated about $0.75 in all; stops at $1)
//   bun run scripts/smoke-real.ts --spend fast-haiku45 vision-sonnet55     only those cases
// Every rule for real runs (bundled binary, key from the Keychain in code, throwaway Claude Code folder, the init check, the
// spending stops) is in realrun-harness.ts. NOT YET RUN: nobody has spent a key on it.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { AgentRunner } from "../src/agent.ts";
import { API_URL, ComputerUseVision } from "../src/aim.ts";
import type { Authorization, ToolUse, Turn, Usage } from "../src/engine.ts";
import { engineEnv } from "../src/engines.ts";
import { FastLane, VisionLane, type Image } from "../src/lanes.ts";
import { estimateUsd, requestProblems } from "../src/models.ts";
import { release as releaseShotDrive } from "../src/ramdisk.ts";
import { SdkEngine, SessionTotals } from "../src/sdkEngine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { parseArgs, runCases, type Case, type CaseCtx } from "./realrun-harness.ts";
import { PRODUCT, PRODUCT_S } from "../src/names.ts";

// ---------- what each case may and may not leave on disk ----------

/** Every saved conversation (a .jsonl file) under a Claude Code folder. */
export function conversations(configDir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => { let names: string[] = []; try { names = readdirSync(d); } catch { return; } for (const n of names) { const p = join(d, n); try { if (statSync(p).isDirectory()) walk(p); else if (n.endsWith(".jsonl")) out.push(p); } catch { /* gone */ } } };
  walk(join(configDir, "projects"));
  return out.sort();
}
const added = (before: string[], after: string[]) => after.filter((f) => !before.includes(f));
/** Picture files anywhere under a folder. */
export function pictures(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => { let names: string[] = []; try { names = readdirSync(d); } catch { return; } for (const n of names) { const p = join(d, n); try { if (statSync(p).isDirectory()) walk(p); else if (/\.(png|jpe?g|webp|gif)$/i.test(n)) out.push(p); } catch { /* gone */ } } };
  walk(dir);
  return out;
}
/** Whether Claude Code put a folder for this project in the person's own ~/.claude (it must never). Only that one name is
 *  looked for; nothing in ~/.claude is listed or read. Claude Code names a project's folder after its path with every
 *  character that is not a letter or digit made a dash; if that naming changes, this check can miss it. */
export const inHomeClaude = (project: string) => existsSync(join(homedir(), ".claude", "projects", project.replace(/[^a-zA-Z0-9]/g, "-")));
const read = (f: string) => { try { return readFileSync(f, "utf8"); } catch { return ""; } };

// ---------- a picture to point at, made here (no screen is ever captured) ----------

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, data: Uint8Array) => {
  const out = new Uint8Array(12 + data.length); const v = new DataView(out.buffer);
  v.setUint32(0, data.length); out.set(new TextEncoder().encode(type), 4); out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
};
/** A white picture with one dark grey box, as a PNG in memory. */
export function boxPicture(w: number, h: number, box: { x: number; y: number; w: number; h: number }): Image {
  const raw = new Uint8Array(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    for (let x = 0; x < w; x++) {
      const inside = x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
      raw.set(inside ? [60, 60, 60] : [255, 255, 255], y * (1 + w * 3) + 1 + x * 3);
    }
  }
  const ihdr = new Uint8Array(13); const v = new DataView(ihdr.buffer);
  v.setUint32(0, w); v.setUint32(4, h); ihdr.set([8, 2, 0, 0, 0], 8);
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array())]);
  return { base64: png.toString("base64"), mediaType: "image/png", w, h };
}
const BOX = { x: 220, y: 90, w: 120, h: 60 };
const PICTURE = () => boxPicture(480, 240, BOX);
const QUESTION = "Where is the dark grey rectangle? Point at its middle.";
const onBox = (p: { x: number; y: number } | null | undefined) => !!p && p.x >= BOX.x - 10 && p.x <= BOX.x + BOX.w + 10 && p.y >= BOX.y - 10 && p.y <= BOX.y + BOX.h + 10;

// ---------- small helpers ----------

/** Tools may only read, or write inside the project. Anything else (a shell command, a web fetch) is refused. */
const insideOnly = (project: string, write: boolean) => async (t: ToolUse): Promise<Authorization> => {
  const path = String(t.input.file_path ?? t.input.path ?? t.input.notebook_path ?? project);
  const inside = path === project || path.startsWith(project + "/");
  const reads = ["Read", "Glob", "Grep", "LS"].includes(t.name);
  const writes = ["Write", "Edit", "MultiEdit"].includes(t.name);
  return inside && (reads || (write && writes)) ? { allow: true, reason: "" } : { allow: false, reason: "Not in this check: only reading, and writing inside the project." };
};
async function turns(gen: AsyncGenerator<Turn, void, any>): Promise<{ text: string; sessionId?: string; usd: number; first?: Usage }> {
  let text = "", sessionId: string | undefined, usd = 0, first: Usage | undefined;
  for (let n = await gen.next(); !n.done; n = await gen.next(undefined)) { if (n.value.text) text += n.value.text + "\n"; if (n.value.sessionId) sessionId = n.value.sessionId; usd += n.value.costUsd; if (n.value.usage && !first) first = n.value.usage; }
  return { text, sessionId, usd, first };
}
/** What the first round sent (its main loop's tokens, turnTokens in sdkEngine.ts): every request carries the instructions and
 *  the tool definitions again, so a leaner tool list shows up here (runner/src/tools.ts). */
export const firstRoundNote = (u: Usage | undefined): string =>
  u ? `first round: ${u.in + u.cacheRead} input tokens (${u.in} new, ${u.cacheRead} read from the cache), ${u.out} out` : "first round: no token counts";
const engineOn = (ctx: CaseCtx, model: string, env = ctx.env, configDirs: string[] = []) =>
  new SdkEngine({ claudeBinary: ctx.claudeBinary, env, queryFn: ctx.guard({ tools: "agent", model, configDirs }) as never, totals: new SessionTotals() });

/** A runner exactly as the app has it (its own task log, snapshots and memory folders), on the guarded engine. */
function runnerOn(ctx: CaseCtx, model: string, onInit?: (m: Record<string, any>) => void) {
  const events: Record<string, any>[] = [];
  const engine = new SdkEngine({ claudeBinary: ctx.claudeBinary, env: ctx.env, queryFn: ctx.guard({ tools: "agent", model }, { onInit }) as never, totals: new SessionTotals() });
  const runner = new AgentRunner({ shadowRoot: ctx.scratch("shadow"), engine, log: new TaskLog(":memory:"), memoryDir: ctx.scratch("memory"), emit: (e) => events.push(e as never) });
  ctx.onCleanup(() => runner.handle({ v: 1, id: "end", type: "agent.interruptAll", reason: "smoke test finished" }));
  return { runner, events, of: (t: string) => events.filter((e) => e.type === t) };
}

const SONNET = "claude-sonnet-5-5", OPUS = "claude-opus-5-5", HAIKU45 = "claude-haiku-4-5-20251001", HAIKU55 = "claude-haiku-5-5";

// The agent engine on a model: a tiny task that writes hello.txt and one saved conversation in the throwaway folder,
// nothing in ~/.claude. Sonnet 5.5 is the usual model for tasks; Opus 5.5 is "Careful" in Settings (models.ts MODEL_CHOICES).
const mainEngine = (name: string, model: string, estimate: number, cap: number): Case => ({
  name, models: [model], estimateUsd: estimate, capUsd: cap, timeoutS: 180,
  what: "a tiny task on the agent engine; writes hello.txt and one saved conversation in the throwaway folder, nothing in ~/.claude",
  async run(ctx) {
    const project = ctx.scratch("project"); const before = conversations(ctx.configDir);
    const r = await turns(engineOn(ctx, model).start({ prompt: "Create a file named hello.txt in this folder containing the single word hi. Do nothing else, then stop.", project, model, signal: ctx.signal, budgetUsd: cap, authorize: insideOnly(project, true) }));
    const saved = added(before, conversations(ctx.configDir));
    ctx.note(`hello.txt = ${JSON.stringify(read(join(project, "hello.txt")).trim())}; saved conversations: ${saved.length}; in ~/.claude: ${inHomeClaude(project)}; cost ${r.usd}; ${firstRoundNote(r.first)}`);
    return read(join(project, "hello.txt")).trim() === "hi" && saved.length >= 1 && !inHomeClaude(project);
  },
});
// A read only diagnosis, as Rescue asks it: Opus 5.5 is the usual model for Rescue; Sonnet 5.5 is "Recommended" in Settings.
const rescueOn = (name: string, model: string, estimate: number): Case => ({
  name, models: [model], estimateUsd: estimate, capUsd: 0.3, timeoutS: 240,
  what: `a read only diagnosis on ${model === OPUS ? "Opus 5.5 (thinking cannot be turned off there)" : "Sonnet 5.5"}; the project is not changed`,
  async run(ctx) {
    const project = ctx.scratch("project");
    const page = `<!doctype html><html><body><button onclick="showGallery()">Show gallery</button><script>function show() { document.title = "ok"; }</script></body></html>`;
    writeFileSync(join(project, "index.html"), page);
    const r = await turns(engineOn(ctx, model).start({ prompt: "Read index.html. In one sentence, say why the Show gallery button does nothing. Change nothing.", project, model, signal: ctx.signal, budgetUsd: 0.3, planOnly: true, authorize: insideOnly(project, false) }));
    ctx.note(`answer: ${r.text.trim().slice(0, 200)}; ${firstRoundNote(r.first)}`);
    return /showGallery|not defined|named|show\(\)/i.test(r.text) && read(join(project, "index.html")) === page && !inHomeClaude(project);
  },
});

export const SMOKE_CASES: Case[] = [
  mainEngine("main-engine-sonnet55", SONNET, 0.08, 0.2),
  mainEngine("main-engine-opus55", OPUS, 0.15, 0.3),
  rescueOn("rescue-opus55", OPUS, 0.15),
  rescueOn("rescue-sonnet55", SONNET, 0.06),
  // The fast lane: Haiku 4.5 is the usual model for quick answers; Sonnet 5.5 is "Recommended" in Settings.
  ...[HAIKU45, HAIKU55, SONNET].map((model): Case => ({
    name: model === HAIKU45 ? "fast-haiku45" : model === HAIKU55 ? "fast-haiku55" : "fast-sonnet55", models: [model], estimateUsd: model === HAIKU45 ? 0.002 : model === HAIKU55 ? 0.001 : 0.004, capUsd: 0.05, timeoutS: 90,
    what: "a one turn answer on the fast lane, with no tools; saves no conversation",
    async run(ctx) {
      const before = conversations(ctx.configDir);
      const r = await new FastLane({ claudeBinary: ctx.claudeBinary, env: ctx.env, model, queryFn: ctx.guard({ tools: [], model }) as never })
        .run({ text: "Reply with exactly the word ok, in lower case, and nothing else.", system: "You reply with exactly what you are asked for.", raw: true }, () => {}, ctx.signal);
      await Bun.sleep(1500);   // the lane hands the answer back before its process has ended; give it time to write anything it would
      const saved = added(before, conversations(ctx.configDir));
      ctx.note(`answer ${JSON.stringify(r.text)}; saved conversations: ${saved.length}; estimate $${r.costUsd}`);
      return /^\s*ok\b/i.test(r.text) && saved.length === 0;
    },
  })),
  ...[SONNET, OPUS].map((model): Case => ({
    name: model === SONNET ? "vision-sonnet55" : "vision-opus55", models: [model], estimateUsd: model === SONNET ? 0.01 : 0.02, capUsd: 0.05, timeoutS: 90,
    what: "Show me how's lane on a made up picture (never a screen); no saved conversation, no picture left in Claude Code's folder",
    async run(ctx) {
      const before = conversations(ctx.configDir);
      ctx.onCleanup(() => releaseShotDrive());
      const r = await new VisionLane({ claudeBinary: ctx.claudeBinary, env: ctx.env, model, queryFn: ctx.guard({ tools: [], model }) as never }).locate({ image: PICTURE(), question: QUESTION, ocr: [] }, ctx.signal);
      await Bun.sleep(2500);
      const saved = added(before, conversations(ctx.configDir));
      const pics = pictures(ctx.configDir);
      ctx.note(`point ${JSON.stringify(r.point)}; on the box: ${onBox(r.point)}; saved conversations: ${saved.length}; pictures in Claude Code's folder: ${pics.length}`);
      if (!onBox(r.point)) ctx.note("QUALITY: the point missed the box (the call itself worked)");
      return saved.length === 0 && pics.length === 0;
    },
  })),
  {
    name: "aim-toolset-sonnet55", models: [SONNET], estimateUsd: 0.01, capUsd: 0.05, timeoutS: 60,
    what: "the experimental pointing lane on the computer toolset, straight to the Messages API; nothing written to disk",
    async run(ctx) {
      let problems: string[] = [], calls = 0;
      // The only network call made outside Claude Code: checked before it leaves, and metered from its usage.
      const fetchFn = (async (url: string, init: RequestInit) => {
        if (url !== API_URL) throw new Error("only the Messages API may be called");
        const body = JSON.parse(String(init.body));
        problems = requestProblems(body.model, { thinking: body.thinking, effort: body.output_config?.effort, tools: body.tools, tool_choice: body.tool_choice, temperature: body.temperature, lastRole: body.messages.at(-1)?.role, betas: String((init.headers as Record<string, string>)["anthropic-beta"] ?? "").split(",").filter(Boolean), via: "api" });
        if (problems.length) throw new Error(`refused before sending: ${problems.join("; ")}`);
        ctx.meter.assertRoom();   // never after a stop, or with no room left
        const res = await fetch(url, { ...init, signal: ctx.signal });
        calls++;
        ctx.meter.settle(`aim-${calls}`, estimateUsd(body.model, (await res.clone().json().catch(() => null))?.usage));   // throws at a stop
        return res;
      }) as unknown as typeof fetch;
      const r = await new ComputerUseVision({ apiKey: async () => ctx.key, model: SONNET, fetchFn }).locate({ image: PICTURE(), question: QUESTION, ocr: [] }, ctx.signal);
      ctx.note(`requests: ${calls}; point ${JSON.stringify(r.point)}; on the box: ${onBox(r.point)}`);
      if (!onBox(r.point)) ctx.note("QUALITY: the point missed the box (the call itself worked)");
      return problems.length === 0 && calls >= 1 && pictures(ctx.configDir).length === 0;
    },
  },
  {
    name: "resumed-companion-folder", models: [SONNET], estimateUsd: 0.08, capUsd: 0.2, timeoutS: 180,
    what: `a conversation continued later, in the Claude Code folder ${PRODUCT} owns on the key route (its data folder), as the app does`,
    async run(ctx) {
      const project = ctx.scratch("project"), data = ctx.scratch("data");
      const { CLAUDE_CONFIG_DIR: _shell, ...parent } = process.env;
      const env = engineEnv({ method: "api_key", apiKey: ctx.key }, data, parent);
      const own = join(data, "claude");
      const engine = engineOn(ctx, SONNET, env, [own]);
      const ask = (prompt: string, resumeSession?: string) => turns(engine.start({ prompt, project, model: SONNET, signal: ctx.signal, budgetUsd: 0.1, authorize: insideOnly(project, false), ...(resumeSession ? { resumeSession } : {}) }));
      const throwaway = conversations(ctx.configDir);
      const one = await ask("Remember the word plum. Reply with only the word noted.");
      if (!one.sessionId) { ctx.note("the first round named no conversation"); return false; }
      const two = await ask("What word did I ask you to remember? Reply with only that word.", one.sessionId);
      const saved = conversations(own);
      ctx.note(`second answer ${JSON.stringify(two.text.trim())}; same conversation: ${two.sessionId === one.sessionId}; saved in ${PRODUCT_S} folder: ${saved.length}; new in the throwaway folder: ${added(throwaway, conversations(ctx.configDir)).length}; in ~/.claude: ${inHomeClaude(project)}`);
      return /plum/i.test(two.text) && saved.length >= 1 && added(throwaway, conversations(ctx.configDir)).length === 0 && !inHomeClaude(project);
    },
  },
  {
    name: "follow-up", models: [SONNET], estimateUsd: 0.12, capUsd: 0.3, timeoutS: 300,
    what: "a task, then a follow up (agent.send) through the runner; the follow up continues the same conversation",
    async run(ctx) {
      const project = ctx.scratch("project");
      const inits: string[] = [];
      const r = runnerOn(ctx, SONNET, (m) => inits.push(String(m.session_id)));
      await r.runner.handle({ v: 1, id: "s1", type: "agent.start", project, agent: "smoke", mode: "drive", prompt: "Create a file named note.txt containing the single word one. Do nothing else, then stop.", model: SONNET, budgetUsd: 0.15 });
      await r.runner.handle({ v: 1, id: "s2", type: "agent.send", project, agent: "smoke", text: "Change note.txt so it contains the single word two instead." });
      const receipts = r.of("receipt");
      ctx.note(`receipts: ${receipts.length}; note.txt = ${JSON.stringify(read(join(project, "note.txt")).trim())}; conversations seen: ${JSON.stringify(inits)}; errors: ${JSON.stringify(r.of("protocol.error").map((e) => e.reason))}`);
      return receipts.length === 2 && read(join(project, "note.txt")).trim() === "two" && inits.length >= 2 && inits[0] === inits.at(-1);
    },
  },
  {
    name: "off-the-record", models: [SONNET], estimateUsd: 0.06, capUsd: 0.2, timeoutS: 180,
    what: "an off the record task through the runner; it must leave no saved conversation and no memory",
    async run(ctx) {
      const project = ctx.scratch("project");
      const before = conversations(ctx.configDir);
      const r = runnerOn(ctx, SONNET);
      await r.runner.handle({ v: 1, id: "s1", type: "agent.start", project, agent: "smoke", mode: "drive", prompt: "Create a file named private.txt containing the single word ok. Do nothing else, then stop.", model: SONNET, budgetUsd: 0.15, offTheRecord: true });
      await Bun.sleep(1500);
      const saved = added(before, conversations(ctx.configDir));
      const memory = existsSync(join(project, ".companion", "project.md"));
      ctx.note(`receipt: ${r.of("receipt").length}; private.txt = ${JSON.stringify(read(join(project, "private.txt")).trim())}; saved conversations: ${saved.length}; project memory written: ${memory}; errors: ${JSON.stringify(r.of("protocol.error").map((e) => e.reason))}`);
      return r.of("receipt").length === 1 && read(join(project, "private.txt")).trim() === "ok" && saved.length === 0 && !memory && !inHomeClaude(project);
    },
  },
];

if (import.meta.main) {
  const args = parseArgs(process.argv.slice(2), ["--keep-files"]);
  if ("error" in args) { console.error(args.error); process.exit(2); }
  const code = await runCases("Real smoke test", SMOKE_CASES, args, { totalUsd: 1, perCaseUsd: 0.3, keepFiles: args.flags.has("--keep-files"), defaultTimeoutS: 180 });
  await releaseShotDrive().catch(() => {});
  process.exit(code);
}

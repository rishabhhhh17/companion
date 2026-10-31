// The daily limit for the light features when no project is open (M14 follow up). Prompt help, the error explainer, Second
// Look, Show me how (and the everyday looks) and the other small answers spend on the person's own Claude. With a project
// open their cost counts in that project's day. With none open it used to count nowhere, so a person with no folder chosen had
// no daily cap on them. Now the stand in project (NO_PROJECT) has a day of its own: the same limit, the same local day, kept
// in the same ledger file, with the same words when it is reached. Every model here is a stand in: nothing is spent.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner, NO_PROJECT } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { AssistService, ImageStore } from "../src/lanes.ts";
import { Ledger } from "../src/ledger.ts";
import { LIMIT_REACHED, LIMIT_REACHED_NO_PROJECT } from "../src/spending.ts";
import { TaskLog } from "../src/tasklog.ts";
import { RunnerSettings } from "../src/settings.ts";
import { NAMES } from "../src/names.ts";
import { toBase64 } from "../src/attach.ts";
import { parseCommand, parseEvent, serialize, type Command, type Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-bl-${l}-`))); made.push(d); return d; };
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const PNG = toBase64(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]));
const GOOD_DIAGRAM = JSON.stringify({ nodes: [{ id: "page", label: "Signup page" }, { id: "api", label: "API route" }], edges: [{ from: "page", to: "api" }], broken: { edge: ["page", "api"], reason: "The route does not exist" }, caption: "Renamed route." });
const LOOK = JSON.stringify({ verdict: "check", items: [{ kind: "claim", claim: "120 x 4 = 460", issue: "It is 480", verify: "Multiply again" }], checked: ["The steps follow"], cantTell: [] });
const POINT = { x: 100, y: 50, targetText: "Deploy", confidence: 0.9, caption: "Click Deploy" };
const EVERYDAY_NONE = JSON.stringify({ found: false });

/** The engine's side as main.ts wires it: one runner (the ledger and the limit), and Prompt help / Show me how reading the
 *  same runner's roomFor and bookSpend. Every lane answers at a fixed price, and counts how often it was asked. */
/** Second Look starts off since F28; these tests book its cost, so it is switched on. */
function secondLookOn(): RunnerSettings {
  const settings = new RunnerSettings();
  settings.apply({ v: 1, id: "s", type: "settings.apply", values: { "secondLook.on": true } } as never);
  return settings;
}
function rig(o: { limit?: number; ledger?: Ledger; price?: number } = {}) {
  const price = o.price ?? 0.05;
  const events: Event[] = [];
  const asked = { explainer: 0, checker: 0, describer: 0, fast: 0, vision: 0, look: 0 };
  const ledger = o.ledger ?? new Ledger(":memory:");
  const settings = secondLookOn();
  const runner = new AgentRunner({
    shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), ledger, dailyCeilingUsd: o.limit ?? 10, settings,
    explainer: async (req) => { asked.explainer++; return { text: /diagram/i.test(req.system) ? GOOD_DIAGRAM : "It means the page asked for a name that was not there yet. It is safe to try again.", costUsd: price }; },
    checker: { canSearch: false, run: async () => { asked.checker++; return { text: LOOK, costUsd: price }; } },
    describer: async () => { asked.describer++; return { text: "A blue button that says Join.", costUsd: price }; },
  });
  // Every call to the one booking function, whoever makes it.
  const booked: [string | undefined, number][] = [];
  const real = runner.bookSpend.bind(runner);
  runner.bookSpend = (p, u) => { booked.push([p, u]); real(p, u); };
  const images = new ImageStore();
  const svc = new AssistService({
    fast: { run: async () => { asked.fast++; return { text: "Add a gallery page", costUsd: price }; } },
    vision: { locate: async () => { asked.vision++; return { point: POINT, costUsd: price }; } },
    look: async () => { asked.look++; return { text: EVERYDAY_NONE, costUsd: price }; },
    images, emit: (e) => events.push(e),
    spend: { room: (p) => runner.roomFor(p), book: (p, usd) => runner.bookSpend(p, usd) },
  });
  const cmd = (c: Record<string, unknown>) => runner.handle({ v: 1, id: `c${Math.random()}`, ...c } as never);
  const assist = (c: Record<string, unknown>) => svc.handle({ v: 1, id: `a${Math.random()}`, ...c } as never);
  const shot = () => assist({ type: "assist.image", ref: "sm_1", mediaType: "image/jpeg", base64: "/9j/4AAQSkZJRg==", w: 1280, h: 800 });
  /** The light features that need no project, by name: each is one press of its key / one question. */
  const features: Record<string, (extra?: Record<string, unknown>) => Promise<void>> = {
    "Prompt help": (x) => assist({ type: "assist.prompt", req: "ph1", app: "Cursor", target: "cursor", text: "add gallery", style: "full", ...x }),
    "the error explainer": (x) => cmd({ type: "error.explain", req: "ee1", app: "com.apple.Terminal", text: "TypeError: x is not a function", ...x }),
    "Second Look": (x) => cmd({ type: "secondlook.check", req: "sl1", app: "com.openai.chat", text: "Your budget: 120 x 4 = 460.", ...x }),
    "Show me how": async (x) => { await shot(); await assist({ type: "assist.locate", req: "sm_1", question: "Where do I deploy?", image: { ref: "sm_1", w: 1280, h: 800 }, ...x }); },
    "an everyday look": async (x) => { await shot(); await assist({ type: "assist.locate", req: "sm_1", question: "Find the problem on my screen.", image: { ref: "sm_1", w: 1280, h: 800 }, ocr: [], mode: "everyday", ...x }); },
    "a look again": async (x) => { await shot(); await assist({ type: "assist.locate", req: "sm_1", question: "Fix this problem on my screen: C4 shows #REF!.", image: { ref: "sm_1", w: 1280, h: 800 }, ocr: [], mode: "recheck", ...x }); },
  };
  const calls = () => Object.values(asked).reduce((a, b) => a + b, 0);
  const shown = async (project: string) => { await cmd({ type: "spending.show", project }); return of(events, "spending.state").at(-1); };
  return { events, asked, ledger, runner, svc, images, booked, cmd, assist, features, calls, shown };
}

describe("with no project open, a light call is booked against the stand in's day", () => {
  for (const name of ["Prompt help", "the error explainer", "Second Look", "Show me how", "an everyday look", "a look again"]) {
    test(`${name} books its cost`, async () => {
      const r = rig({ price: 0.05 });
      await r.features[name]();
      expect(r.ledger.spentToday(NO_PROJECT)).toBeCloseTo(0.05, 6);
      expect(r.booked.length).toBe(1);
    });
  }
  test("Prompt help books both of its calls when its first answer is too long", async () => {
    const r = rig({ price: 0.02 });
    // The stand in lane answers with a very long text the first time and a short one after.
    let n = 0;
    const svc = new AssistService({ fast: { run: async () => ({ text: ++n === 1 ? "x ".repeat(400) : "Add a gallery page", costUsd: 0.02 }) }, vision: { locate: async () => ({ point: null, costUsd: 0 }) }, images: new ImageStore(), emit: () => {}, spend: { room: (p) => r.runner.roomFor(p), book: (p, u) => r.runner.bookSpend(p, u) } });
    await svc.handle({ v: 1, id: "a", type: "assist.prompt", req: "q", app: "Cursor", target: "cursor", text: "add gallery", style: "full" } as never);
    expect(r.ledger.spentToday(NO_PROJECT)).toBeCloseTo(0.04, 6);
  });
  test("Second Look books what a failed check still cost", async () => {
    const r = rig();
    const bad = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: () => {}, ledger: r.ledger, dailyCeilingUsd: 10, settings: secondLookOn(), checker: { canSearch: false, run: async () => ({ text: "not json", costUsd: 0.004 }) } });
    await bad.handle({ v: 1, id: "c", type: "secondlook.check", req: "sl", app: "com.openai.chat", text: "The sky is blue." } as never);
    expect(r.ledger.spentToday(NO_PROJECT)).toBeCloseTo(0.004, 6);
  });
  test("it shows in the Settings row, as the day's total for the stand in", async () => {
    const r = rig({ limit: 10, price: 0.25 });
    expect(await r.shown(NO_PROJECT)).toMatchObject({ project: NO_PROJECT, limitUsd: 10, spentUsd: 0 });
    await r.features["the error explainer"]();
    await r.features["Prompt help"]();
    const s = await r.shown(NO_PROJECT);
    expect(s).toMatchObject({ project: NO_PROJECT, limitUsd: 10, spentUsd: 0.5 });
    expect(parseEvent(serialize(s)).ok).toBe(true);
  });
  test("a project named 'no-project' on a command is the same stand in, and an unknown folder is too", async () => {
    const r = rig({ price: 0.1 });
    await r.features["the error explainer"]({ project: NO_PROJECT });
    await r.features["Second Look"]({ project: join(tmp("gone"), "not-there") });
    expect(r.ledger.spentToday(NO_PROJECT)).toBeCloseTo(0.2, 6);
  });
  test("nothing is stored but a number: the ledger holds no text from the call", async () => {
    const r = rig();
    const dir = tmp("ledger"), path = join(dir, "ledger.db");
    const l = new Ledger(path);
    const q = rig({ ledger: l });
    await q.features["the error explainer"]({ text: "TypeError: secretword is not a function" });
    await q.features["Prompt help"]({ text: "my private plan for the secretword launch" });
    await q.features["Second Look"]({ text: "secretword is 460" });
    for (const f of readdirSync(dir)) expect(readFileSync(join(dir, f)).includes("secretword"), f).toBe(false);
    expect(r.ledger.spentToday(NO_PROJECT)).toBe(0);   // a separate ledger is untouched
    expect(l.spentToday(NO_PROJECT)).toBeGreaterThan(0);
  });
});

describe("at the limit, a light call with no project open refuses in plain words and changes nothing", () => {
  for (const name of ["Prompt help", "the error explainer", "Second Look", "Show me how", "an everyday look", "a look again"]) {
    test(name, async () => {
      const r = rig({ limit: 1, price: 0.05 });
      r.ledger.add(NO_PROJECT, 1);
      const before = r.events.length;
      await r.features[name]();
      expect(r.calls(), "no model was asked").toBe(0);
      expect(r.booked).toEqual([]);
      expect(r.ledger.spentToday(NO_PROJECT)).toBeCloseTo(1, 6);
      const said = r.events.slice(before);
      expect(said.length).toBe(1);
      const text = (said[0] as any).reason;
      expect(text).toBe(LIMIT_REACHED_NO_PROJECT);
      expect(text).not.toMatch(/project/i);
      expect(["assist.error", "error.explained", "secondlook.result"]).toContain(said[0].type);
      expect(parseEvent(serialize(said[0])).ok).toBe(true);
    });
  }
  test("a screenshot held for Show me how is dropped at the limit, not kept", async () => {
    const r = rig({ limit: 1 });
    r.ledger.add(NO_PROJECT, 1);
    await r.features["Show me how"]();
    expect(r.images.get("sm_1")).toBeUndefined();
  });
  test("the call that crosses the limit finishes; the next one is refused", async () => {
    const r = rig({ limit: 1, price: 0.6 });
    await r.features["the error explainer"]();
    await r.features["the error explainer"]();   // 0.6 spent, 0.4 left: allowed, takes it to 1.2
    expect(r.asked.explainer).toBe(2);
    await r.features["the error explainer"]();
    expect(r.asked.explainer).toBe(2);
    expect(of(r.events, "error.explained").at(-1).reason).toBe(LIMIT_REACHED_NO_PROJECT);
    expect(r.ledger.spentToday(NO_PROJECT)).toBeCloseTo(1.2, 6);
  });
  test("raising the limit in Settings lets it through again", async () => {
    const saved: number[] = [];
    const r = rig({ limit: 1 });
    (r.runner as any).o.saveDailyLimit = (u: number) => saved.push(u);
    r.ledger.add(NO_PROJECT, 1);
    await r.features["Second Look"]();
    expect(of(r.events, "secondlook.result").at(-1).reason).toBe(LIMIT_REACHED_NO_PROJECT);
    await r.cmd({ type: "spending.set", project: NO_PROJECT, limitUsd: 5 });
    await r.features["Second Look"]();
    expect(of(r.events, "secondlook.result").at(-1).ok).toBe(true);
  });
});

describe("the day is the local day, and the total survives a restart", () => {
  test("a new local day starts from zero", async () => {
    let now = new Date(2026, 9, 21, 23, 58);
    const path = join(tmp("db"), "ledger.db");
    const r = rig({ limit: 1, price: 0.6, ledger: new Ledger(path, () => now) });
    await r.features["Prompt help"](); await r.features["Prompt help"]();   // 1.2 spent: over
    await r.features["Prompt help"]();
    expect(r.asked.fast).toBe(2);
    expect((await r.shown(NO_PROJECT)).spentUsd).toBeCloseTo(1.2, 6);
    now = new Date(2026, 9, 22, 0, 1);
    expect((await r.shown(NO_PROJECT)).spentUsd).toBe(0);
    await r.features["Prompt help"]();
    expect(r.asked.fast).toBe(3);
    expect(r.ledger.spentToday(NO_PROJECT)).toBeCloseTo(0.6, 6);
  });
  test("after the engine restarts the total is still there, and the limit still holds", async () => {
    const path = join(tmp("db"), "ledger.db");
    const first = rig({ limit: 1, price: 0.6, ledger: new Ledger(path) });
    await first.features["the error explainer"](); await first.features["the error explainer"]();
    const second = rig({ limit: 1, price: 0.6, ledger: new Ledger(path) });   // a new engine on the same file
    expect((await second.shown(NO_PROJECT)).spentUsd).toBeCloseTo(1.2, 6);
    await second.features["the error explainer"]();
    expect(second.asked.explainer).toBe(0);
    expect(of(second.events, "error.explained")[0].reason).toBe(LIMIT_REACHED_NO_PROJECT);
  });
  test("a ledger that cannot be written still counts while the engine runs", async () => {
    const r = rig({ limit: 1, price: 0.6 });
    (r.ledger as any).db.close();   // every write and read of the file now fails
    await r.features["Prompt help"](); await r.features["Prompt help"](); await r.features["Prompt help"]();
    expect(r.asked.fast).toBe(2);
  });
});

describe("a project's own total and the stand in's do not mix", () => {
  // The design: the limit is per place the work belongs to. A project has its own day, and the stand in (no folder chosen)
  // has its own, with the same limit. So the stand in never uses up a project's day, a project never uses up the stand in's,
  // and what the Settings row shows for the folder in view is exactly what that folder (or the stand in) spent.
  test("the stand in being full does not stop a project's light calls, and they book to the project", async () => {
    const project = tmp("proj"); writeFileSync(join(project, "package.json"), "{}");
    const r = rig({ limit: 1, price: 0.05 });
    r.ledger.add(NO_PROJECT, 1);
    await r.features["the error explainer"]({ project });
    expect(r.asked.explainer).toBe(1);
    expect(r.ledger.spentToday(project)).toBeCloseTo(0.05, 6);
    expect(r.ledger.spentToday(NO_PROJECT)).toBeCloseTo(1, 6);
  });
  test("a project being full does not stop the stand in, and what it spends is not the project's", async () => {
    const project = tmp("proj"); writeFileSync(join(project, "package.json"), "{}");
    const r = rig({ limit: 1, price: 0.05 });
    r.ledger.add(project, 1);
    await r.features["Second Look"]({ project });
    expect(of(r.events, "secondlook.result").at(-1).reason).toBe(LIMIT_REACHED);
    await r.features["Second Look"]();
    expect(of(r.events, "secondlook.result").at(-1).ok).toBe(true);
    expect(r.ledger.spentToday(project)).toBeCloseTo(1, 6);
    expect(r.ledger.spentToday(NO_PROJECT)).toBeCloseTo(0.05, 6);
  });
  test("each Settings row shows its own total", async () => {
    const project = tmp("proj"); writeFileSync(join(project, "package.json"), "{}");
    const r = rig({ limit: 10, price: 0.25 });
    await r.features["the error explainer"]({ project });
    await r.features["the error explainer"]();
    await r.features["the error explainer"]();
    expect((await r.shown(project)).spentUsd).toBeCloseTo(0.25, 6);
    expect((await r.shown(NO_PROJECT)).spentUsd).toBeCloseTo(0.5, 6);
  });
  test("the limit itself is one number for both", async () => {
    const r = rig({ limit: 3 });
    expect((await r.shown(NO_PROJECT)).limitUsd).toBe(3);
    expect((await r.shown("/some/project")).limitUsd).toBe(3);
  });
});

describe("Show me how is booked against the project it was asked in", () => {
  test("with a project named, to that project; with none, to the stand in", async () => {
    const project = tmp("proj");
    const r = rig({ price: 0.03 });
    await r.features["Show me how"]({ project });
    expect(r.ledger.spentToday(project)).toBeCloseTo(0.03, 6);
    expect(r.ledger.spentToday(NO_PROJECT)).toBe(0);
    await r.features["Show me how"]();
    expect(r.ledger.spentToday(NO_PROJECT)).toBeCloseTo(0.03, 6);
  });
  test("a look that found nothing clear still cost something, and is booked", async () => {
    const events: Event[] = [], images = new ImageStore(), booked: [string | undefined, number][] = [];
    const svc = new AssistService({ fast: { run: async () => ({ text: "", costUsd: 0 }) }, vision: { locate: async () => ({ point: null, targets: [], costUsd: 0.02 }) }, images, emit: (e) => events.push(e), spend: { room: () => 5, book: (p, u) => booked.push([p, u]) } });
    await svc.handle({ v: 1, id: "i", type: "assist.image", ref: "s", mediaType: "image/jpeg", base64: "/9j/4AAQ", w: 100, h: 100 } as never);
    await svc.handle({ v: 1, id: "l", type: "assist.locate", req: "r", question: "q", image: { ref: "s", w: 100, h: 100 } } as never);
    expect(of(events, "assist.error")[0].reason).toMatch(/No clear target/);
    expect(booked).toEqual([[undefined, 0.02]]);
  });
  test("the shell command may carry the project, and the engine reads it", () => {
    expect(parseCommand(serialize({ v: 1, id: "l", type: "assist.locate", req: "r", question: "q", image: { ref: "r", w: 10, h: 10 }, project: "/Users/me/site" } as never)).ok).toBe(true);
  });
});

describe("every light feature goes through the one booking function", () => {
  // A future feature cannot forget to book: the spy sees every call to the booking function, and a light call that cost money
  // and did not reach it fails here. Explain and pictures are tasks' own light calls and book through it too.
  for (const name of ["Prompt help", "the error explainer", "Second Look", "Show me how", "an everyday look", "a look again"]) {
    test(`${name}: its cost reaches bookSpend with the project, and only there`, async () => {
      const project = tmp("proj"); writeFileSync(join(project, "package.json"), "{}");
      const r = rig({ price: 0.07 });
      const adds: number[] = [];
      const add = r.ledger.add.bind(r.ledger);
      let inside = 0;
      const wrapped = r.runner.bookSpend;
      r.runner.bookSpend = (p, u) => { inside++; try { wrapped(p, u); } finally { inside--; } };
      r.ledger.add = (p, u) => { adds.push(inside); add(p, u); };
      await r.features[name]({ project });
      expect(r.booked).toEqual([[project, 0.07]]);
      expect(adds).toEqual([1]);   // the one ledger write happened inside the booking function
    });
  }
  test("Draw it for me", async () => {
    const project = tmp("proj"); writeFileSync(join(project, "package.json"), "{}");
    const r = rig({ price: 0.07 });
    await r.cmd({ type: "diagram.ask", project, question: "why" });
    expect(of(r.events, "diagram.ready")[0].made).toBe(true);
    expect(r.booked).toEqual([[project, 0.07]]);
    expect(r.ledger.spentToday(project)).toBeCloseTo(0.07, 6);
  });
  test("Draw it for me waits at the limit with the same words", async () => {
    const project = tmp("proj"); writeFileSync(join(project, "package.json"), "{}");
    const r = rig({ limit: 1 });
    r.ledger.add(project, 1);
    await r.cmd({ type: "diagram.ask", project, question: "why" });
    expect(r.asked.explainer).toBe(0);
    expect(of(r.events, "diagram.ready")[0].reason).toBe(LIMIT_REACHED);
  });
  test("Prompt help, the error explainer and Second Look with a project open keep the project sentence", async () => {
    const project = tmp("proj2"); writeFileSync(join(project, "package.json"), "{}");
    const r = rig({ limit: 1 });
    r.ledger.add(project, 1);
    await r.features["Prompt help"]({ project });
    await r.features["the error explainer"]({ project });
    await r.features["Second Look"]({ project });
    expect(r.calls()).toBe(0);
    expect(of(r.events, "assist.error").at(-1).reason).toBe(LIMIT_REACHED);
    expect(of(r.events, "error.explained").at(-1).reason).toBe(LIMIT_REACHED);
    expect(of(r.events, "secondlook.result").at(-1).reason).toBe(LIMIT_REACHED);
  });
  test("Explain after a task", async () => {
    const project = tmp("proj"); writeFileSync(join(project, "a.txt"), "x\n");
    const r = rig({ price: 0.07 });
    const edit: Step = { tool: { name: "Edit", input: { file_path: "a.txt", old_string: "x", new_string: "y" } }, costUsd: 0 };
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([[edit, { text: "done", costUsd: 0 }]]), log: new TaskLog(":memory:"), emit: (e) => r.events.push(e), ledger: r.ledger, dailyCeilingUsd: 10, proof: async () => ({ verdict: "passed", steps: [] }),
      explainer: async () => ({ text: '{"why":["The word changed.","So the page reads it."],"question":{"text":"What changed?","options":["The word","Nothing"],"correct":0}}', costUsd: 0.07 }) });
    const seen: [string | undefined, number][] = [];
    const real = runner.bookSpend.bind(runner);
    runner.bookSpend = (p, u) => { seen.push([p, u]); real(p, u); };
    await runner.handle({ v: 1, id: "s", type: "agent.start", project, agent: "b1", mode: "drive", prompt: "change x", model: "m", budgetUsd: 1 } as never);
    await Bun.sleep(100);
    expect(of(r.events, "explain.ready").length).toBe(1);
    expect(seen).toEqual([[project, 0.07]]);
    expect(r.ledger.spentToday(project)).toBeCloseTo(0.07, 6);
  });
  test("pictures added to a request", async () => {
    const project = tmp("proj"); writeFileSync(join(project, "a.txt"), "x\n");
    const ledger = new Ledger(":memory:");
    const events: Event[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([[{ text: "ok", costUsd: 0 }]]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), ledger, dailyCeilingUsd: 10, proof: async () => ({ verdict: "passed", steps: [] }),
      describer: async () => ({ text: "A blue button.", costUsd: 0.07 }) });
    const seen: [string | undefined, number][] = [];
    const real = runner.bookSpend.bind(runner);
    runner.bookSpend = (p, u) => { seen.push([p, u]); real(p, u); };
    await runner.handle({ v: 1, id: "s", type: "agent.start", project, agent: "b1", mode: "drive", prompt: "match the button", model: "m", budgetUsd: 1, images: [{ name: "b.png", mediaType: "image/png", base64: PNG }] } as never);
    expect(seen).toEqual([[project, 0.07]]);
    expect(ledger.spentToday(project)).toBeCloseTo(0.07, 6);
  });
  test("main.ts hands Prompt help and Show me how the runner's own functions", () => {
    const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
    expect(main).toMatch(/spend: \{ room: \(p\) => runner\.roomFor\(p\), book: \(p, usd\) => runner\.bookSpend\(p, usd\) \}/);
  });
  test("a new call to a light lane shows up here, so it cannot be added without booking", () => {
    // Every place that asks a light lane (the Claude Code fast lane, the vision lane, or the plain API ones) and the number of
    // calls it has. Adding another changes the count and fails this test: book its cost through bookSpend (or the spend.book
    // AssistService is given), add a test above, then update the count here.
    const read = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
    const count = (src: string, re: RegExp) => (src.match(re) ?? []).length;
    const agent = read("agent.ts"), lanes = read("lanes.ts");
    expect({ explainer: count(agent, /this\.o\.explainer!?\(/g), describer: count(agent, /this\.o\.describer\(/g), checker: count(agent, /secondLook\([^)]*this\.o\.checker/g) }).toEqual({ explainer: 3, describer: 1, checker: 1 });
    expect({ fast: count(lanes, /this\.o\.fast\.run\(/g), vision: count(lanes, /this\.o\.vision\.locate\(/g), look: count(lanes, /this\.o\.look\(/g) }).toEqual({ fast: 2, vision: 1, look: 1 });
    // Nothing else in the engine calls a lane: every other file that could would show up here. (secondlook.ts calls the fast lane
    // once, for agent.ts's secondLookCheck, which books what it returns, success or failure; the count of that call is checked.)
    expect(count(read("secondlook.ts"), /\bfast\.run\(/g)).toBe(1);
    for (const f of readdirSync(new URL("../src/", import.meta.url).pathname).filter((x) => x.endsWith(".ts") && !["agent.ts", "lanes.ts", "direct.ts", "engines.ts", "main.ts", "secondlook.ts"].includes(x))) {
      expect(count(read(f), /\b(?:o\.explainer|o\.describer|vision\.locate|fast\.run|o\.look)\b/g), `${f} must not call a light lane without booking`).toBe(0);
    }
    // And each of those calls is next to a booking: agent.ts books through bookSpend, lanes.ts through the spend it is given.
    expect(count(agent, /this\.bookSpend\(/g)).toBeGreaterThanOrEqual(6);
    expect(count(lanes, /\bbook\(/g)).toBeGreaterThanOrEqual(5);
    expect(count(agent, /this\.ledger\.add\(\s*cmd\.project,\s*(?:costUsd|prior)\b/g), "Explain and pictures book through bookSpend, not the ledger").toBe(0);
  });
});

describe("make me something: a new folder is a project, so it is booked there", () => {
  type Case = { name: string; ok: boolean; cmd: Record<string, unknown>; task?: Record<string, unknown> };
  const cases: Case[] = readFileSync(new URL("../../protocol/fixtures/project-new-cases.jsonl", import.meta.url), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  /** What the shell leaves behind: a home folder, the folder for everything made for a request, and in it a brand new empty
   *  folder. The task is the fixture's own task line with that folder as the project. */
  function newFolder(caseName: string, rounds: Step[][], o: { limit?: number; spentAlready?: number } = {}) {
    const home = tmp("home"), parent = join(home, NAMES.newFolderParent);
    mkdirSync(parent);
    const project = join(parent, "Website for my bakery");
    mkdirSync(project);
    const task = { ...cases.find((x) => x.name === caseName)!.task!, project } as unknown as Command;
    expect(parseCommand(JSON.stringify(task)).ok).toBe(true);
    const ledger = new Ledger(":memory:");
    if (o.spentAlready) ledger.add(project, o.spentAlready);
    const events: Event[] = [];
    const engine = new ScriptedEngine(rounds);
    const runner = new AgentRunner({ shadowRoot: tmp("shadow"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), ledger, dailyCeilingUsd: o.limit ?? 10, proof: async () => ({ verdict: "passed", steps: [] }) });
    return { project, task, events, engine, ledger, runner };
  }
  const plan = (cost: number): Step => ({ text: 'Here is the plan:\n```json\n["Make the home page"]\n```', costUsd: cost });
  const answer = (cost: number): Step => ({ text: '```json\n{"title":"Who competes with Acme","answer":"Two shops nearby.","notes":[{"text":"Bake Co sells bread.","source":"https://example.com/bake"}]}\n```', costUsd: cost });

  test("something to build: the plan and each step are booked to the new folder", async () => {
    const r = newFolder("something to build starts a plan", [[plan(0.2)], [{ tool: { name: "Write", input: { file_path: "index.html", content: "<h1>Bakery</h1>" } }, costUsd: 0.3 }]]);
    await r.runner.handle(r.task);
    expect(r.ledger.spentToday(r.project)).toBeCloseTo(0.2, 6);
    await r.runner.handle({ v: 1, id: "a", type: "drive.approve", agent: (r.task as any).agent, steps: ["Make the home page"] });
    expect(r.ledger.spentToday(r.project)).toBeCloseTo(0.5, 6);
    expect(r.ledger.spentToday(NO_PROJECT)).toBe(0);
  });
  test("something to look up: the research is booked to the new folder", async () => {
    const r = newFolder("something to look up starts research", [[answer(0.15)]]);
    await r.runner.handle(r.task);
    expect(of(r.events, "research.done").length).toBe(1);
    expect(r.ledger.spentToday(r.project)).toBeCloseTo(0.15, 6);
  });
  test("at the limit neither starts, in the usual words, and nothing is asked", async () => {
    for (const name of ["something to build starts a plan", "something to look up starts research"]) {
      const r = newFolder(name, [[plan(0.2)], [answer(0.2)]], { limit: 1, spentAlready: 1 });
      await r.runner.handle(r.task);
      expect(r.engine.calls.length, name).toBe(0);
      expect(of(r.events, "protocol.error").some((e) => /daily limit/i.test(e.reason)), name).toBe(true);
      expect(r.ledger.spentToday(r.project), name).toBeCloseTo(1, 6);
      expect(readdirSync(r.project), name).toEqual([]);
    }
  });
});

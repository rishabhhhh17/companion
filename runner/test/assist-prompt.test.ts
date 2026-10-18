// The Prompt help service end to end, with a stand in for Claude: what is sent, what comes back, and what is checked.
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AssistService, ImageStore, type FastLike } from "../src/lanes.ts";
import { StreamRestorer } from "../src/prompthelp.ts";
import type { Event } from "../../protocol/index.ts";
import { RunnerSettings } from "../src/settings.ts";

type Req = { text: string; system?: string; extra?: string };
function mk(replies: string[], opts: { deltas?: string[][] } = {}) {
  const events: Event[] = [];
  const calls: Req[] = [];
  let n = 0;
  const fast: FastLike = {
    async run(req: Req, onDelta, signal) {
      calls.push(req);
      const reply = replies[Math.min(n, replies.length - 1)];
      for (const d of opts.deltas?.[n] ?? [reply]) onDelta(d);
      n++;
      return { text: reply, costUsd: 0.002 };
    },
  } as FastLike;
  const svc = new AssistService({ fast, vision: { locate: async () => ({ point: null, costUsd: 0 }) }, images: new ImageStore(), emit: (e) => events.push(e) });
  const ask = (text: string, extra: Record<string, unknown> = {}) => svc.handle({ v: 1, id: "c", type: "assist.prompt", req: "ph", app: "com.openai.codex", target: "chat", text, style: "full", ...extra } as never);
  const done = () => events.find((e) => e.type === "assist.prompt.done") as any;
  const error = () => events.find((e) => e.type === "assist.error") as any;
  return { events, calls, ask, done, error };
}
const token = (req: Req) => req.text.match(/\[\[KEEP_\d+\]\]/)?.[0] ?? "";

describe("what Companion remembers", () => {
  test("it is sent as background next to the prompt, never inside the text being rewritten", async () => {
    const calls: Req[] = [];
    const fast = { async run(req: Req, onDelta: (t: string) => void) { calls.push(req); onDelta("Better"); return { text: "Better", costUsd: 0.001 }; } } as unknown as FastLike;
    const svc = new AssistService({ fast, vision: { locate: async () => ({ point: null, costUsd: 0 }) }, images: new ImageStore(), emit: () => {}, memory: () => "- Prefers short answers" });
    await svc.handle({ v: 1, id: "c", type: "assist.prompt", req: "ph", app: "com.openai.codex", target: "chat", text: "do it", style: "full" } as never);
    expect(calls[0].extra).toContain("Prefers short answers");
    expect(calls[0].text).not.toContain("short answers");
  });
  test("a memory that fails never stops the rewrite", async () => {
    const calls: Req[] = [];
    const fast = { async run(req: Req, onDelta: (t: string) => void) { calls.push(req); onDelta("Better"); return { text: "Better", costUsd: 0.001 }; } } as unknown as FastLike;
    const svc = new AssistService({ fast, vision: { locate: async () => ({ point: null, costUsd: 0 }) }, images: new ImageStore(), emit: () => {}, memory: () => { throw new Error("disk"); } });
    await svc.handle({ v: 1, id: "c", type: "assist.prompt", req: "ph", app: "com.openai.codex", target: "chat", text: "do it", style: "full" } as never);
    expect(calls.length).toBe(1);
  });
});

describe("what is sent to Claude", () => {
  test("code, links and commands are set aside before sending, so they cannot be changed", async () => {
    const r = mk(["Improved: [[KEEP_1]] and [[KEEP_2]]"]);
    await r.ask("fix `foo()` at https://a.com/x please");
    expect(r.calls[0].text).not.toContain("foo()");
    expect(r.calls[0].text).not.toContain("a.com");
    expect(r.calls[0].text).toContain("[[KEEP_1]]");
  });
  test("the instructions match the kind of app and the style", async () => {
    const r = mk(["Better"]);
    await r.ask("do it", { target: "claude_code", style: "light" });
    expect(r.calls[0].system).toMatch(/terminal/i);
    expect(r.calls[0].system).toMatch(/clarity only/i);
  });
  test("no project folder means no project information is sent", async () => {
    const r = mk(["Better"]);
    await r.ask("do it");
    expect(r.calls[0].extra ?? "").not.toMatch(/Project/);
  });
  test("a granted folder sends a short description of it, with no file contents or secrets", async () => {
    const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-as-")));
    writeFileSync(join(d, "package.json"), JSON.stringify({ name: "studio-site", dependencies: { react: "19" } }));
    writeFileSync(join(d, "secret.txt"), "TOP SECRET CONTENT"); mkdirSync(join(d, "src"));
    const r = mk(["Better"]);
    await r.ask("do it", { project: d });
    expect(r.calls[0].extra).toContain("studio-site");
    expect(r.calls[0].extra).not.toContain("TOP SECRET CONTENT");
    expect(r.calls[0].system).toMatch(/background/i);
  });
  test("an answer to the question is passed along, and asking again is switched off", async () => {
    const r = mk(["Better"]);
    await r.ask("do it", { answer: "Postgres", noQuestion: true });
    expect(r.calls[0].extra).toContain("Postgres");
    expect(r.calls[0].system).toMatch(/do not ask/i);
  });
  test("an empty text is refused plainly and nothing is sent", async () => {
    const r = mk(["x"]);
    await r.ask("   ");
    expect(r.calls.length).toBe(0);
    expect(r.error().reason).toMatch(/no text/i);
  });
});

describe("what comes back", () => {
  test("the markers are replaced by the exact originals, and the diff shows only real changes", async () => {
    const r = mk(["Make it work: [[KEEP_1]] everywhere."]);
    await r.ask("make it work `useState(0)` everywhere");
    expect(r.done().text).toBe("Make it work: `useState(0)` everywhere.");
    expect(r.done().diff.some(([o, t]: string[]) => o === "=" && t.includes("`useState(0)`"))).toBe(true);
  });
  test("a piece the model dropped is added back, not lost", async () => {
    const r = mk(["Please fix it."]);
    await r.ask("fix this `weirdCode()`");
    expect(r.done().text).toContain("`weirdCode()`");
  });
  test("a question and its quick answers are passed on", async () => {
    const r = mk(["Build a gallery.\nQUESTION: Open full size on click?\nOPTIONS: Yes | No"]);
    await r.ask("make a gallery thing");
    expect(r.done()).toMatchObject({ text: "Build a gallery.", question: "Open full size on click?", options: ["Yes", "No"] });
  });
  test("when asked not to ask, a question that comes anyway is dropped", async () => {
    const r = mk(["Build a gallery.\nQUESTION: Open full size on click?"]);
    await r.ask("make a gallery thing", { noQuestion: true });
    expect(r.done().question).toBeUndefined();
    expect(r.done().text).toBe("Build a gallery.");
  });
  test("terminals get 'copy', other apps 'paste'", async () => {
    const t = mk(["Better"]); await t.ask("do it", { app: "com.apple.Terminal", target: "other" });
    expect(t.done().handback).toBe("copy");
    const c = mk(["Better"]); await c.ask("do it", { app: "com.openai.codex", target: "chat" });
    expect(c.done().handback).toBe("paste");
  });
  test("the cost of every call is added up", async () => {
    const r = mk(["x ".repeat(500), "short"]);
    await r.ask("make it");
    expect(r.done().usdEstimate).toBeCloseTo(0.004, 6);
  });
});

describe("a rewrite that grew too much", () => {
  test("it is sent back once with a length limit, and the shorter one is used", async () => {
    const r = mk(["w ".repeat(400), "A short good one."]);
    await r.ask("make it");
    expect(r.calls.length).toBe(2);
    expect(r.calls[1].extra).toMatch(/shorter|at most/i);
    expect(r.done().text).toBe("A short good one.");
  });
  test("if it is still too long, yours is left alone and you are told", async () => {
    const r = mk(["w ".repeat(400)]);
    await r.ask("make it");
    expect(r.done()).toBeUndefined();
    expect(r.error().reason).toMatch(/longer than yours|left yours alone/i);
  });
});

describe("streaming without showing markers", () => {
  const run = (chunks: string[], spans: string[]) => { const s = new StreamRestorer(spans); return chunks.map((c) => s.push(c)).join("") + s.flush(); };
  test("a whole marker in one piece is replaced at once", () => expect(run(["Use [[KEEP_1]] now"], ["`a()`"])).toBe("Use `a()` now"));
  test("a marker split across pieces is held until it is complete", () => expect(run(["Use [[KE", "EP_", "1]] now"], ["`a()`"])).toBe("Use `a()` now"));
  test("text that only looks like the start of a marker is let through at the end", () => expect(run(["see [[ke", "ep this"], [])).toBe("see [[keep this"));
  test("ordinary text streams straight through", () => expect(run(["hello ", "world"], [])).toBe("hello world"));
  test("nothing is held back at the end of the stream", () => expect(run(["end [[KEEP_"], ["x"])).toBe("end [[KEEP_"));
  test("through the service, the person never sees a marker", async () => {
    const r = mk(["Use [[KEEP_1]] now"], { deltas: [["Use [[KE", "EP_1]] now"]] });
    await r.ask("use `a()` now");
    const shown = r.events.filter((e) => e.type === "assist.prompt.delta").map((e: any) => e.text).join("");
    expect(shown).not.toContain("KEEP");
    expect(shown).toContain("`a()`");
  });
});

// M11 area 5 (Settings, the registry T16): Use project info in Prompt help (ph.useProjectInfo) and Give the suggestion back
// by (ph.handBack), applied by the shell's settings.apply and read on each request. The usual values are today's.
describe("Prompt help settings", () => {
  const withSettings = (values: Record<string, unknown>) => {
    const s = new RunnerSettings();
    s.apply({ v: 1, id: "s", type: "settings.apply", values });
    const events: Event[] = [];
    const calls: Req[] = [];
    const fast = { async run(req: Req, onDelta: (t: string) => void) { calls.push(req); onDelta("Better"); return { text: "Better", costUsd: 0.001 }; } } as unknown as FastLike;
    const svc = new AssistService({ fast, vision: { locate: async () => ({ point: null, costUsd: 0 }) }, images: new ImageStore(), emit: (e) => events.push(e), memory: () => "- Prefers short answers", settings: s });
    const ask = (extra: Record<string, unknown> = {}) => svc.handle({ v: 1, id: "c", type: "assist.prompt", req: "ph", app: "com.openai.codex", target: "chat", text: "do it", style: "full", ...extra } as never);
    const done = () => events.find((e) => e.type === "assist.prompt.done") as any;
    return { calls, ask, done };
  };
  const folder = () => {
    const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-ph-")));
    writeFileSync(join(d, "package.json"), JSON.stringify({ name: "studio-site", dependencies: { react: "19" } }));
    return d;
  };
  test("project info is sent by default, and not at all when it is turned off; what Companion remembers is left to its own setting", async () => {
    const d = folder();
    const on = withSettings({});
    await on.ask({ project: d });
    expect(on.calls[0].extra).toContain("studio-site");
    const off = withSettings({ "ph.useProjectInfo": false });
    await off.ask({ project: d });
    expect(off.calls[0].extra ?? "").not.toContain("studio-site");
    expect(off.calls[0].extra ?? "").not.toMatch(/Project information/);
    expect(off.calls[0].extra).toContain("Prefers short answers");
  });
  test("the suggestion goes back by paste by default, by copy when chosen, and a terminal always gets copy", async () => {
    const usual = withSettings({}); await usual.ask();
    expect(usual.done().handback).toBe("paste");
    const copy = withSettings({ "ph.handBack": "copy" }); await copy.ask();
    expect(copy.done().handback).toBe("copy");
    const term = withSettings({ "ph.handBack": "paste" }); await term.ask({ app: "com.apple.Terminal", target: "other" });
    expect(term.done().handback).toBe("copy");
  });
  test("a value the rules refuse is the usual one", async () => {
    const odd = withSettings({ "ph.handBack": "clipboard", "ph.useProjectInfo": "no" });
    const d = folder();
    await odd.ask({ project: d });
    expect(odd.done().handback).toBe("paste");
    expect(odd.calls[0].extra).toContain("studio-site");
  });
});

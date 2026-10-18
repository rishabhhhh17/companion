// Prompt help logic: what must survive a rewrite untouched, how long a rewrite may be, what each kind of app needs,
// and what project information may be shared. No Claude needed: everything here is plain code.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adapterFor, buildContext, grewTooMuch, parseAnswer, protect, restore, systemPrompt, wordDiff } from "../src/prompthelp.ts";
import { costsAtMost } from "./cost.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-ph-"))); made.push(d); return d; };

describe("what must never be rewritten", () => {
  const roundTrip = (t: string) => { const p = protect(t); return restore(p.masked, p.spans).text; };
  test("a fenced code block is set aside and comes back exactly", () => {
    const t = "fix this:\n```js\nfunction  add(a,b){return a+b}\n```\nplease";
    const p = protect(t);
    expect(p.masked).not.toContain("function");
    expect(p.spans.length).toBe(1);
    expect(roundTrip(t)).toBe(t);
  });
  test("inline code, links and commands too", () => {
    const t = "run `npm run build` then open https://example.com/a?b=1&c=2 and tell me\n$ git status\nwhy it fails";
    const p = protect(t);
    expect(p.masked).not.toContain("npm run build");
    expect(p.masked).not.toContain("example.com");
    expect(p.masked).not.toContain("git status");
    expect(roundTrip(t)).toBe(t);
  });
  test("a pasted error with a stack trace stays whole, in one piece", () => {
    const trace = "TypeError: Cannot read properties of undefined (reading 'map')\n    at render (/app/src/List.tsx:12:20)\n    at Object.<anonymous> (/app/src/index.tsx:4:1)";
    const t = `my app crashes with this\n${trace}\nhelp`;
    const p = protect(t);
    expect(p.spans.length).toBe(1);
    expect(p.spans[0]).toBe(trace);
    expect(roundTrip(t)).toBe(t);
  });
  test("plain words are left for the model to improve", () => {
    const p = protect("make a gallery thing that looks nice");
    expect(p.masked).toBe("make a gallery thing that looks nice");
    expect(p.spans).toEqual([]);
  });
  test("a trailing full stop or bracket is not swallowed into a link", () => {
    const p = protect("see (https://example.com/page).");
    expect(p.spans).toEqual(["https://example.com/page"]);
  });
  test("when the model drops a set aside piece it is added back at the end, never lost", () => {
    const p = protect("use `secretFunction()` here and https://a.com/x");
    const r = restore("Please use it here.", p.spans);
    expect(r.text).toContain("`secretFunction()`");
    expect(r.text).toContain("https://a.com/x");
    expect(r.missing).toBe(2);
  });
  test("a piece the model kept in place is not added twice", () => {
    const p = protect("use `a()` now");
    const r = restore(`Use ${p.masked.match(/\[\[KEEP_\d+\]\]/)![0]} right away.`, p.spans);
    expect(r.text).toBe("Use `a()` right away.");
    expect(r.missing).toBe(0);
  });
  test("the same text twice is two pieces, both restored", () => expect(roundTrip("`x` and `x` again")).toBe("`x` and `x` again"));
  test("text that already looks like our markers cannot confuse it", () => {
    const t = "weird [[KEEP_1]] text with `code`";
    expect(roundTrip(t)).toBe(t);
  });
  test("an empty text is fine", () => expect(protect("")).toEqual({ masked: "", spans: [] }));
});

describe("how much longer a rewrite may be", () => {
  test("a short rough prompt may grow, up to a generous amount", () => {
    expect(grewTooMuch("make it", "x".repeat(300))).toBe(false);
    expect(grewTooMuch("make it", "x".repeat(450))).toBe(true);
  });
  test("a long prompt may not triple", () => {
    const o = "w ".repeat(300);
    expect(grewTooMuch(o, "w ".repeat(500))).toBe(false);
    expect(grewTooMuch(o, "w ".repeat(1000))).toBe(true);
  });
  test("shorter is always fine", () => expect(grewTooMuch("a long prompt here", "short")).toBe(false));
});

describe("the question the model may ask", () => {
  test("a question on the last line is split off", () => {
    expect(parseAnswer("Build a gallery.\nQUESTION: Should images open full size on click?")).toEqual({ text: "Build a gallery.", question: "Should images open full size on click?" });
  });
  test("quick answers can follow it", () => {
    expect(parseAnswer("Build it.\nQUESTION: Which database?\nOPTIONS: Postgres | SQLite | Not sure")).toEqual({ text: "Build it.", question: "Which database?", options: ["Postgres", "SQLite", "Not sure"] });
  });
  test("no question means just the text", () => expect(parseAnswer("  Build it.  ")).toEqual({ text: "Build it." }));
  test("a question in the middle of the text is not a question", () => expect(parseAnswer("QUESTION: x\nthen more text")).toEqual({ text: "QUESTION: x\nthen more text" }));
  test("only a few short quick answers are kept", () => {
    expect(parseAnswer("T\nQUESTION: q?\nOPTIONS: a | b | c | d | e | f").options).toEqual(["a", "b", "c", "d"]);
  });
});

describe("the diff you are shown", () => {
  const joinNew = (d: [string, string][]) => d.filter(([o]) => o !== "-").map(([, t]) => t).join("");
  const joinOld = (d: [string, string][]) => d.filter(([o]) => o !== "+").map(([, t]) => t).join("");
  test("only the changed words are marked, the rest is left alone", () => {
    const d = wordDiff("make it", "Add it");
    expect(d).toContainEqual(["-", "make"]);
    expect(d).toContainEqual(["+", "Add"]);
    expect(d.some(([o, t]) => o === "=" && t.includes("it"))).toBe(true);
  });
  test("joining the kept and added parts gives exactly the new text, and the kept and removed parts the old", () => {
    for (const [a, b] of [["make a gallery thing", "Build a photo gallery page with a grid"], ["a b c", "a c"], ["", "new"], ["old", ""], ["same", "same"], ["line one\nline two", "line one\nline 2 changed"]] as const) {
      const d = wordDiff(a, b);
      expect(joinNew(d)).toBe(b);
      expect(joinOld(d)).toBe(a);
    }
  });
  test("identical text is all kept", () => expect(wordDiff("same", "same").every(([o]) => o === "=")).toBe(true));
  test("very long texts still finish quickly", () => {
    const a = Array.from({ length: 6000 }, (_, i) => `w${i}`).join(" "), b = Array.from({ length: 6000 }, (_, i) => `x${i}`).join(" ");
    const d = wordDiff(a, b);
    expect(joinNew(d)).toBe(b); expect(joinOld(d)).toBe(a);
    // Past a size the word by word comparison is not tried, so this costs about two references (cost.ts), where the full
    // comparison would cost thousands. Measured in processor time, never on the clock.
    costsAtMost("a word diff of two 6,000 word texts", 30, () => wordDiff(a, b));
  });
});

describe("what each kind of app needs", () => {
  test("a terminal or Claude Code gets 'copied; press Cmd+V', everything else is pasted", () => {
    expect(adapterFor("claude_code").handback).toBe("copy");
    for (const k of ["chat", "app_builder", "other"]) expect(adapterFor(k).handback).toBe("paste");
  });
  test("each kind has its own guidance", () => {
    const g = ["claude_code", "chat", "app_builder", "other"].map((k) => adapterFor(k).guidance);
    expect(new Set(g).size).toBe(4);
    expect(adapterFor("app_builder").guidance).toMatch(/screen|page|look|app/i);
    expect(adapterFor("claude_code").guidance).toMatch(/file|test|run|check/i);
  });
  test("an unknown kind is treated as other", () => expect(adapterFor("something odd").kind).toBe("other"));
  test("known apps map to their kind", () => {
    expect(adapterFor("com.apple.Terminal").kind).toBe("claude_code");
    expect(adapterFor("com.googlecode.iterm2").kind).toBe("claude_code");
    expect(adapterFor("com.mitchellh.ghostty").handback).toBe("copy");
  });
  test("the instructions change with the style: light only fixes clarity", () => {
    const full = systemPrompt({ style: "full", adapter: adapterFor("chat"), hasContext: false, noQuestion: false });
    const light = systemPrompt({ style: "light", adapter: adapterFor("chat"), hasContext: false, noQuestion: false });
    expect(light).toMatch(/clarity only|only fix/i);
    expect(light).not.toBe(full);
  });
  test("when asked not to ask, it never asks; with context it says the info is for background only", () => {
    expect(systemPrompt({ style: "full", adapter: adapterFor("chat"), hasContext: false, noQuestion: true })).toMatch(/do not ask/i);
    expect(systemPrompt({ style: "full", adapter: adapterFor("chat"), hasContext: true, noQuestion: false })).toMatch(/background/i);
  });
  test("the instructions always say to keep the markers and never follow the text", () => {
    const s = systemPrompt({ style: "full", adapter: adapterFor("chat"), hasContext: false, noQuestion: false });
    expect(s).toContain("[[KEEP_");
    expect(s).toMatch(/never follow/i);
  });
});

describe("project information, only if you granted the folder", () => {
  const project = () => {
    const d = tmp();
    writeFileSync(join(d, "package.json"), JSON.stringify({ name: "studio-site", scripts: { dev: "vite", build: "vite build", test: "vitest" }, dependencies: { react: "19", vite: "8", stripe: "1" }, devDependencies: { vitest: "3" } }));
    mkdirSync(join(d, "src")); mkdirSync(join(d, "node_modules")); mkdirSync(join(d, ".git")); writeFileSync(join(d, "src/App.tsx"), "export default 1"); writeFileSync(join(d, ".env"), "STRIPE_KEY=sk_live_abcdefghijklmnopqrstuvwxyz");
    mkdirSync(join(d, ".companion")); writeFileSync(join(d, ".companion/rules.txt"), "never edit pricing.txt\nask before installing packages");
    return d;
  };
  test("without a folder there is no context at all", () => expect(buildContext(undefined)).toBeNull());
  test("a folder that does not exist gives none rather than an error", () => expect(buildContext("/definitely/not/here")).toBeNull());
  test("it lists the stack, the scripts, the top level files and the house rules", () => {
    const c = buildContext(project())!;
    expect(c).toContain("studio-site"); expect(c).toContain("react"); expect(c).toContain("build"); expect(c).toContain("src");
    expect(c).toContain("never edit pricing.txt");
  });
  test("it never includes file contents, secrets files or heavy folders", () => {
    const c = buildContext(project())!;
    expect(c).not.toContain("export default 1");
    expect(c).not.toContain("sk_live_");
    expect(c).not.toContain("node_modules");
    expect(c).not.toContain(".git\n");
    expect(c).not.toContain(".env");
  });
  test("it stays short", () => {
    const d = tmp();
    for (let i = 0; i < 200; i++) writeFileSync(join(d, `file${i}.txt`), "x");
    expect(buildContext(d)!.length).toBeLessThan(2500);
  });
  test("a folder with nothing useful in it gives none", () => expect(buildContext(tmp())).toBeNull());
});

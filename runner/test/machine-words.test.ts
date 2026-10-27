// M15 wave 2, the guard: no line a person reads may carry a word from how Squibby is built. It reads every line in the
// pages' strings file (app/src/strings.ts, functions called with stand in values) and every sentence the engine can send
// to the pages (string literals in runner/src that read as a sentence, and every literal given as a reason, summary,
// message, note, why or detail). A legitimate use is allowed only by name, below, with why.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { S } from "../../app/src/strings.ts";
import { FAIL_WORDS } from "../src/plainfail.ts";

// git in lower case is the command; "Git" (the tool a person installs) is a name and fine.
const MACHINE = /\b(exit code|stderr|agent\.start|hooks?|engine|checkpoints?|shadow store|SDK)\b/i;
const GIT = /\bgit\b/;
// Allowed on purpose: "git history" is the person's own project history (a folder that has one is moved with it, and Undo
// does not cover a folder inside the project that has its own); "Android SDK" is the real name of a tool to install.
const ALLOWED_PHRASES = [/\bgit history\b/g, /\bAndroid SDK\b/g];
const machineWord = (text: string): string | null => {
  let t = text;
  for (const p of ALLOWED_PHRASES) t = t.replace(p, "");
  return MACHINE.exec(t)?.[0] ?? GIT.exec(t)?.[0] ?? null;
};

// Files and literals that never reach a person: instructions for the model (which tell it what not to say), and SQL.
const NOT_FOR_A_PERSON: Record<string, RegExp> = {
  "sdkEngine.ts": /^`You are working inside a user's project folder/,
  "explain.ts": /^"Never use these words:/,
  "tasklog.ts": /^"(UPDATE|INSERT|SELECT|CREATE)\b/,
};

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) out.push(...sourceFiles(p)); else if (p.endsWith(".ts")) out.push(p); }
  return out;
}
const runnerSrc = new URL("../src", import.meta.url).pathname;
const LITERAL = /(`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*")/g;
const FIELD = /\b(reason|summary|message|note|notice|why|detail)\s*:\s*(`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*")/g;
const withoutComments = (s: string) => s.split("\n").map((l) => l.replace(/^\s*(\/\/|\*|\/\*\*).*$/, "").replace(/\s\/\/ .*$/, "")).join("\n");

/** Every literal a person may read, from the engine's source, with where it is. */
function engineLines(): { at: string; text: string }[] {
  const out: { at: string; text: string }[] = [];
  for (const f of sourceFiles(runnerSrc)) {
    const name = f.slice(runnerSrc.length + 1);
    const src = withoutComments(readFileSync(f, "utf8"));
    const add = (lit: string, index: number) => {
      const skip = NOT_FOR_A_PERSON[name.split("/").pop()!];
      if (skip?.test(lit)) return;
      out.push({ at: `${name}:${src.slice(0, index).split("\n").length}`, text: lit.replace(/\$\{[^}]*\}/g, "X") });
    };
    for (const m of src.matchAll(LITERAL)) if (/^.[A-Z][^]*\s[^]*[.!?].$/.test(m[1])) add(m[1], m.index!);
    for (const m of src.matchAll(FIELD)) add(m[2], m.index!);
  }
  return out;
}

/** Every line in the strings file, functions called with stand in values. */
function stringsLines(): { at: string; text: string }[] {
  const out: { at: string; text: string }[] = [];
  const walk = (v: unknown, at: string) => {
    if (typeof v === "string") { out.push({ at, text: v }); return; }
    if (typeof v === "function") { for (const args of [["x", "y", "z"], [1, 2, 3]]) { try { walk((v as (...a: unknown[]) => unknown)(...args), `${at}()`); } catch { /* a stand in it cannot take */ } } return; }
    if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${at}.${k}`);
  };
  walk(S, "S");
  return out;
}

describe("no machine words in what a person reads", () => {
  test("the guard catches each word, and lets the allowed ones through", () => {
    for (const bad of ["It stopped with exit code 1.", "See stderr.", "could not handle agent.start", "The hook said no.", "The engine stopped.", "Unknown checkpoint.", "The shadow store failed.", "The SDK failed.", "git add failed."]) expect(machineWord(bad), bad).not.toBeNull();
    for (const ok of ["Squibby needs Git to keep undo points.", "It has git history, and that goes with it.", "Building it needs the Android SDK.", "Check your GitHub settings.", "Add your API key."]) expect(machineWord(ok), ok).toBeNull();
  });
  test("the strings file", () => {
    const lines = stringsLines();
    expect(lines.length).toBeGreaterThan(800);
    expect(lines.filter((l) => machineWord(l.text)).map((l) => `${l.at}: ${l.text}`)).toEqual([]);
  });
  test("every sentence the engine can send", () => {
    const lines = engineLines();
    expect(lines.length).toBeGreaterThan(300);
    expect(lines.filter((l) => machineWord(l.text)).map((l) => `${l.at}: ${l.text.slice(0, 160)}`)).toEqual([]);
  });
  test("the plain failure sentences", () => {
    for (const w of Object.values(FAIL_WORDS)) expect(machineWord(w), w).toBeNull();
  });
});

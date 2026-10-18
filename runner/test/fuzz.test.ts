// Everything that reads text we do not control (a tool's output, the model's answer, a lesson file, a protocol line)
// must never throw and never hang, whatever it is given. Seeded, so a failure can be repeated.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCommand, parseEvent } from "../../protocol/index.ts";
import { parseDiagram } from "../src/diagram.ts";
import { parsePointText } from "../src/lanes.ts";
import { locateProblem } from "../src/proof/locate.ts";
import { parseLesson } from "../src/walk.ts";
import { parseAnswer } from "../src/aim.ts";
import { redact } from "../src/redact.ts";
import { growsGently, noHang } from "./cost.ts";

let seed = 20261014;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const PIECES = ["{", "}", "[", "]", '"', ":", ",", "\n", "\r\n", "\t", " ", "\u0000", "\u001b[31m", "\u001b[0m", "src/App.tsx(5,7): error TS2322: x", "app.js:12", "at /a/b.js:3:4", "File \"x.py\", line 9", "Error:", "TAP version 13", "not ok 1 - x", "  error: |-", "  location: '/x/y.js:1:1'", "é", "😀", "‮", "<script>", "../../etc/passwd", "sk-ant-api03-AAAAAAAAAAAAAAAAAAAA", "null", "true", "1e999", "-0", "NaN", "[object Object]", "\\", "%s", "`", "$(rm -rf /)", "x".repeat(300)];
const junk = (n: number) => Array.from({ length: n }, () => pick(PIECES)).join(rnd() < 0.5 ? "" : " ");
// "Never hang" is measured in processor time (cost.ts), never on the wall clock, so a busy Mac cannot fail it; very large
// input is also checked for growing no faster than its size.
const timed = (f: () => unknown, ms = 1500) => { noHang(f, ms); };

describe("garbage in, no crash and no hang", () => {
  // A real project folder for the locator, there until every test has run (it used to be removed while the tests were
  // only being collected, so the locator gave up at once and its large inputs were never really read).
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "companion-fuzz-")));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  test("the locator on random tool output and on very large output", () => {
    expect(locateProblem("x", dir, "checks")).not.toBeNull();   // the folder is there: the text is really read
    for (let i = 0; i < 300; i++) timed(() => locateProblem(junk(1 + Math.floor(rnd() * 40)), dir, "checks"));
    for (const [what, piece, n] of [["many lines of errors", "error: x\n", 25_000], ["places with no line breaks", "a.js:1:1 ", 12_500], ["very long lines", "x".repeat(5000) + "\n", 62], ["one line with no end", "x", 10_000]] as const) {
      timed(() => locateProblem(piece.repeat(n * 8), dir, "checks"), 4000);
      growsGently(`the locator on ${what}`, 8, 20, () => locateProblem(piece.repeat(n), dir, "checks"), () => locateProblem(piece.repeat(n * 8), dir, "checks"));
    }
  }, 120_000);
  test("the diagram parser on random model answers", () => {
    for (let i = 0; i < 400; i++) timed(() => parseDiagram(junk(1 + Math.floor(rnd() * 30))));
    expect(parseDiagram('{"nodes":' + "[".repeat(5000))).toBeNull();
  });
  test("the pointing parsers on random answers", () => {
    for (let i = 0; i < 400; i++) { timed(() => parsePointText(junk(1 + Math.floor(rnd() * 30)), { base64: "", mediaType: "image/jpeg", w: 100, h: 100 })); }
    for (let i = 0; i < 200; i++) timed(() => parseAnswer(JSON.parse(rnd() < 0.5 ? "null" : '{"content":[{"type":"tool_use","input":{"coordinate":[' + (rnd() * 1e6) + "," + (-rnd() * 1e6) + ']}}]}'), { base64: "", mediaType: "image/jpeg", w: 100, h: 100 }, []));
  });
  test("the lesson checker on random files", () => {
    for (let i = 0; i < 400; i++) { let v: unknown; try { v = JSON.parse(junk(1 + Math.floor(rnd() * 20))); } catch { v = junk(5); } timed(() => parseLesson(v)); }
    const lesson = (n: number) => ({ id: "a", title: "t", app: "a", goal: "g", steps: Array.from({ length: n }, () => ({})) });
    const [few, many] = [lesson(12_500), lesson(100_000)];
    timed(() => parseLesson(many));
    growsGently("the lesson checker on a lesson with very many steps", 8, 20, () => parseLesson(few), () => parseLesson(many));
  });
  test("the protocol on random lines", () => {
    for (let i = 0; i < 500; i++) { const l = junk(1 + Math.floor(rnd() * 20)); timed(() => parseCommand(l)); timed(() => parseEvent(l)); }
    for (const l of ['{"v":1,"id":"a","type":"__proto__"}', '{"v":1,"id":"a","type":"constructor"}', '{"v":1,"id":"a","type":"toString"}', '{"__proto__":{"x":1},"v":1,"id":"a","type":"runner.ping"}']) { expect(() => parseCommand(l)).not.toThrow(); }
    expect(parseCommand('{"v":1,"id":"a","type":"constructor"}').ok).toBe(false);
  });
  test("secret covering on random text, including text built to be slow", () => {
    for (let i = 0; i < 300; i++) timed(() => redact(junk(1 + Math.floor(rnd() * 40))));
    // Text built to be slow for a careless pattern costs time in step with its length, never more.
    for (const [what, make, n] of [["a key that never ends", (k: number) => "sk-" + "a".repeat(k), 12_500], ["long runs of card like digits", (k: number) => "1234 ".repeat(k), 6_250], ["a long run of letters", (k: number) => "A".repeat(k) + "=", 25_000]] as const) {
      const [small, big] = [make(n), make(n * 8)];
      timed(() => redact(big), 3000);
      growsGently(`secret covering on ${what}`, 8, 20, () => redact(small), () => redact(big));
    }
  });
  test("a secret in the middle of noise is still covered", () => {
    expect(redact(junk(10) + " sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAA " + junk(10))).not.toContain("AAAAAAAAAAAAAAAAAAAA");
  });
});

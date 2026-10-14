// Everything that reads text we do not control (a tool's output, the model's answer, a lesson file, a protocol line)
// must never throw and never hang, whatever it is given. Seeded, so a failure can be repeated.
import { describe, expect, test } from "bun:test";
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

let seed = 20261014;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const PIECES = ["{", "}", "[", "]", '"', ":", ",", "\n", "\r\n", "\t", " ", "\u0000", "\u001b[31m", "\u001b[0m", "src/App.tsx(5,7): error TS2322: x", "app.js:12", "at /a/b.js:3:4", "File \"x.py\", line 9", "Error:", "TAP version 13", "not ok 1 - x", "  error: |-", "  location: '/x/y.js:1:1'", "é", "😀", "‮", "<script>", "../../etc/passwd", "sk-ant-api03-AAAAAAAAAAAAAAAAAAAA", "null", "true", "1e999", "-0", "NaN", "[object Object]", "\\", "%s", "`", "$(rm -rf /)", "x".repeat(300)];
const junk = (n: number) => Array.from({ length: n }, () => pick(PIECES)).join(rnd() < 0.5 ? "" : " ");
const timed = (f: () => unknown, ms = 1500) => { const t = performance.now(); f(); expect(performance.now() - t).toBeLessThan(ms); };

describe("garbage in, no crash and no hang", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "companion-fuzz-")));
  test("the locator on random tool output and on very large output", () => {
    for (let i = 0; i < 300; i++) timed(() => locateProblem(junk(1 + Math.floor(rnd() * 40)), dir, "checks"));
    timed(() => locateProblem("error: x\n".repeat(200_000), dir, "checks"), 4000);
    timed(() => locateProblem("a.js:1:1 ".repeat(100_000), dir, "checks"), 4000);
    timed(() => locateProblem(("x".repeat(5000) + "\n").repeat(500), dir, "checks"), 4000);
  });
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
    timed(() => parseLesson({ id: "a", title: "t", app: "a", goal: "g", steps: Array.from({ length: 100_000 }, () => ({})) }));
  });
  test("the protocol on random lines", () => {
    for (let i = 0; i < 500; i++) { const l = junk(1 + Math.floor(rnd() * 20)); timed(() => parseCommand(l)); timed(() => parseEvent(l)); }
    for (const l of ['{"v":1,"id":"a","type":"__proto__"}', '{"v":1,"id":"a","type":"constructor"}', '{"v":1,"id":"a","type":"toString"}', '{"__proto__":{"x":1},"v":1,"id":"a","type":"runner.ping"}']) { expect(() => parseCommand(l)).not.toThrow(); }
    expect(parseCommand('{"v":1,"id":"a","type":"constructor"}').ok).toBe(false);
  });
  test("secret covering on random text, including text built to be slow", () => {
    for (let i = 0; i < 300; i++) timed(() => redact(junk(1 + Math.floor(rnd() * 40))));
    timed(() => redact("sk-" + "a".repeat(100_000)), 3000);
    timed(() => redact("1234 ".repeat(50_000)), 3000);
    timed(() => redact("A".repeat(200_000) + "="), 3000);
  });
  test("a secret in the middle of noise is still covered", () => {
    expect(redact(junk(10) + " sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAA " + junk(10))).not.toContain("AAAAAAAAAAAAAAAAAAAA");
  });
  rmSync(dir, { recursive: true, force: true });
});

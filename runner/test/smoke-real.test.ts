// The real smoke test (runner/scripts/smoke-real.ts) is only ever run with --spend by the founder. Here: its plan, its disk
// checks and its dry run, which must spend nothing. No Claude starts; the one Keychain look up asks for a throwaway
// companion-test- item that does not exist.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { SMOKE_CASES, boxPicture, conversations, pictures } from "../scripts/smoke-real.ts";
import { canonicalModel, MODEL_CHOICES } from "../src/models.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-test-smoke-${l}-`))); made.push(d); return d; };
const script = join(import.meta.dir, "../scripts/smoke-real.ts");
const run = (args: string[], env: Record<string, string> = {}) => {
  const p = Bun.spawnSync([process.execPath, script, ...args], { env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/tmp", ...env }, stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString() };
};

describe("the plan", () => {
  test("about ten small cases covering every lane and model the brief names, estimated under a dollar", () => {
    expect(SMOKE_CASES.length).toBeGreaterThanOrEqual(9);
    expect(SMOKE_CASES.length).toBeLessThanOrEqual(13);
    expect(new Set(SMOKE_CASES.map((c) => c.name)).size).toBe(SMOKE_CASES.length);
    expect(SMOKE_CASES.reduce((a, c) => a + c.estimateUsd, 0)).toBeLessThan(1);
    const by = (n: string) => SMOKE_CASES.find((c) => c.name === n)!;
    expect(by("main-engine-sonnet55").models).toEqual(["claude-sonnet-5-5"]);
    expect(by("rescue-opus55").models).toEqual(["claude-opus-5-5"]);
    expect(by("fast-haiku45").models).toEqual(["claude-haiku-4-5-20251001"]);
    expect(by("fast-haiku55").models).toEqual(["claude-haiku-5-5"]);
    expect(by("vision-sonnet55").models).toEqual(["claude-sonnet-5-5"]);
    for (const n of ["resumed-companion-folder", "follow-up", "off-the-record"]) expect(by(n)).toBeDefined();
    // The model choices in Settings (models.ts MODEL_CHOICES): each option names the case that must pass before it is offered.
    expect(by("main-engine-opus55").models).toEqual(["claude-opus-5-5"]);
    expect(by("rescue-sonnet55").models).toEqual(["claude-sonnet-5-5"]);
    expect(by("fast-sonnet55").models).toEqual(["claude-sonnet-5-5"]);
    for (const [job, options] of Object.entries(MODEL_CHOICES)) for (const [id, c] of Object.entries(options)) {
      expect(by(c.smoke), `${job}.${id}`).toBeDefined();
      expect(by(c.smoke).models.map(canonicalModel), `${job}.${id}`).toEqual([canonicalModel(c.model)]);
    }
  });
  test("every case has its own stop at or under the per case stop, and its estimate fits under it", () => {
    for (const c of SMOKE_CASES) { expect(c.capUsd!, c.name).toBeLessThanOrEqual(0.3); expect(c.estimateUsd, c.name).toBeLessThanOrEqual(c.capUsd!); expect(c.timeoutS!, c.name).toBeGreaterThan(0); }
  });
});

describe("what the checks look at on disk", () => {
  test("saved conversations are the .jsonl files under projects/", () => {
    const d = tmp("cfg");
    mkdirSync(join(d, "projects", "-tmp-x"), { recursive: true });
    writeFileSync(join(d, "projects", "-tmp-x", "a.jsonl"), "{}");
    writeFileSync(join(d, "projects", "-tmp-x", "notes.txt"), "x");
    writeFileSync(join(d, "settings.json"), "{}");
    expect(conversations(d)).toEqual([join(d, "projects", "-tmp-x", "a.jsonl")]);
    expect(conversations(join(d, "missing"))).toEqual([]);
  });
  test("pictures are found at any depth", () => {
    const d = tmp("pics");
    mkdirSync(join(d, "a", "b"), { recursive: true });
    writeFileSync(join(d, "a", "b", "1.PNG"), "x"); writeFileSync(join(d, "a", "x.txt"), "x");
    expect(pictures(d)).toEqual([join(d, "a", "b", "1.PNG")]);
  });
  test("the made up picture is a real PNG with the box where the check expects it", () => {
    const img = boxPicture(48, 24, { x: 20, y: 8, w: 10, h: 6 });
    const png = Buffer.from(img.base64, "base64");
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.readUInt32BE(16)).toBe(48); expect(png.readUInt32BE(20)).toBe(24);
    const idatAt = png.indexOf("IDAT"); const len = png.readUInt32BE(idatAt - 4);
    const raw = inflateSync(png.subarray(idatAt + 4, idatAt + 4 + len));
    const px = (x: number, y: number) => raw[y * (1 + 48 * 3) + 1 + x * 3];
    expect(px(25, 10)).toBe(60); expect(px(2, 2)).toBe(255);
    expect(img).toMatchObject({ mediaType: "image/png", w: 48, h: 24 });
  });
});

describe("running the script", () => {
  test("with no options it is a dry run: the plan, nothing sent, nothing spent", () => {
    const r = run([], { COMPANION_KEYCHAIN_SERVICE: `companion-test-nonexistent-${Math.random().toString(36).slice(2)}` });
    expect(r.code).toBe(0);
    for (const c of SMOKE_CASES) expect(r.out).toContain(c.name);
    expect(r.out).toMatch(/nothing was sent and nothing was spent/i);
    expect(r.out).not.toMatch(/=== /);
  });
  test("--spend with no key in the Keychain item: nothing runs and it says where the key goes", () => {
    const service = `companion-test-nonexistent-${Math.random().toString(36).slice(2)}`;
    const r = run(["--spend", "fast-haiku45"], { COMPANION_KEYCHAIN_SERVICE: service });
    expect(r.code).toBe(2);
    expect(r.out).toContain(service);
    expect(r.out).toMatch(/Nothing was spent/);
    expect(r.out).not.toMatch(/=== /);
  });
  test("an unknown option is refused", () => {
    expect(run(["--yes-really"]).code).toBe(2);
  });
});

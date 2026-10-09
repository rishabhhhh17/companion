import { describe, expect, test } from "bun:test";
import { atLeast, doctor, parseVersion } from "../src/doctor.ts";

const run = (map: Record<string, { code: number; out: string }>) => async (cmd: string) => { const r = map[cmd] ?? { code: 127, out: "" }; return { code: r.code, stdout: r.out, stderr: "" }; };

describe("reading versions", () => {
  test("the numbers are found in the usual wordings", () => {
    expect(parseVersion("v20.11.1")).toEqual([20, 11, 1]); expect(parseVersion("git version 2.39.3 (Apple Git-145)")).toEqual([2, 39, 3]); expect(parseVersion("Vercel CLI 53.4.0")).toEqual([53, 4, 0]); expect(parseVersion("nothing")).toBeNull();
  });
  test("old, equal and newer are told apart", () => {
    expect(atLeast([18, 20, 8], [20, 0])).toBe(false); expect(atLeast([20, 0, 0], [20, 0])).toBe(true); expect(atLeast([22, 1, 0], [20, 0])).toBe(true); expect(atLeast(null, [20, 0])).toBe(false);
  });
});

describe("your Mac check", () => {
  test("everything present is fine", async () => {
    const items = await doctor(run({ "node --version": { code: 0, out: "v22.1.0" }, "git --version": { code: 0, out: "git version 2.39.3" }, "vercel --version": { code: 0, out: "Vercel CLI 53.4.0" } }), () => true);
    expect(items.every((i) => i.ok)).toBe(true);
  });
  test("an old Node and missing tools are explained with what to do", async () => {
    const items = await doctor(run({ "node --version": { code: 0, out: "v18.20.8" } }), () => false);
    const by = (id: string) => items.find((i) => i.id === id)!;
    expect(by("node")).toMatchObject({ ok: false }); expect(by("node").detail).toMatch(/20 or newer/); expect(by("node").fix).toMatch(/nodejs\.org/);
    expect(by("git").fix).toMatch(/xcode-select/); expect(by("vercel").fix).toMatch(/npm install -g vercel/); expect(by("browser").ok).toBe(false);
  });
  test("a tool that crashes or hangs is reported as missing, not as a crash", async () => {
    const items = await doctor(async () => { throw new Error("boom"); }, () => true);
    expect(items.find((i) => i.id === "node")!.ok).toBe(false);
  });
});

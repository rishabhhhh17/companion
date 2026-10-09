import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NOT_SIGNED_IN, VercelCli, addShipReceipt, readShips } from "../src/ship/deploy.ts";
import type { RunResult } from "../src/proof/exec.ts";

const made: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "dep-")); made.push(d); return d; };
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const res = (o: Partial<RunResult>): RunResult => ({ code: 0, signal: null, stdout: "", stderr: "", timedOut: false, ms: 1, ...o });
const cli = (out: Partial<RunResult>, calls: string[] = []) => new VercelCli((async (command: string) => { calls.push(command); return res(out); }) as never, join(tmp(), "auth.json"));

describe("the Vercel tool", () => {
  test("signed in means the login file exists; its contents are never opened", () => {
    const d = tmp(), f = join(d, "auth.json");
    expect(new VercelCli(undefined, f).signedIn()).toBe(false);
    writeFileSync(f, "secret"); expect(new VercelCli(undefined, f).signedIn()).toBe(true);
  });
  test("a preview is a deploy without the production flag, and the link is the last one printed", async () => {
    const calls: string[] = [];
    const r = await cli({ stdout: "https://shop-abc123-me.vercel.app", stderr: "Inspect: https://vercel.com/me/shop/abc\nPreview: https://shop-abc123-me.vercel.app [3s]" }, calls).preview("/p");
    expect(r).toEqual({ ok: true, url: "https://shop-abc123-me.vercel.app" });
    expect(calls[0]).toBe("vercel deploy --yes"); expect(calls[0]).not.toContain("--prod");
  });
  test("a login flow starting means not signed in, and it is stopped", async () => {
    const r = await cli({ matched: true, signal: "SIGTERM", code: null }).preview("/p");
    expect(r).toEqual({ ok: false, reason: NOT_SIGNED_IN });
  });
  test("failures are said in plain words, with secrets hidden", async () => {
    const r: any = await cli({ code: 1, stderr: "Error: token sk_live_abcdefghijklmnop1234 rejected" }).preview("/p");
    expect(r.ok).toBe(false); expect(r.reason).not.toContain("sk_live_abcdef"); expect(r.reason).toContain("Vercel said no");
    expect(((await cli({ code: 127 }).preview("/p")) as any).reason).toMatch(/not installed/);
    expect(((await cli({ timedOut: true, code: null }).preview("/p")) as any).reason).toMatch(/Nothing went live/);
  });
  test("a finished deploy with no link is a failure, not a guess", async () => {
    expect(((await cli({ stdout: "done" }).preview("/p")) as any).ok).toBe(false);
  });
  test("promote only accepts a Vercel preview link, and uses promote, not a new deploy", async () => {
    const calls: string[] = [];
    expect(((await cli({}, calls).promote("https://evil.example.com", "/p")) as any).ok).toBe(false);
    expect(calls.length).toBe(0);
    const ok: any = await cli({ stdout: "Success! https://shop.vercel.app" }, calls).promote("https://shop-abc.vercel.app", "/p");
    expect(ok.ok).toBe(true); expect(calls[0]).toBe("vercel promote https://shop-abc.vercel.app --yes");
  });
  test("rollback uses the Vercel rollback", async () => {
    const calls: string[] = [];
    expect((await cli({}, calls).rollback("/p")).ok).toBe(true);
    expect(calls[0]).toBe("vercel rollback --yes");
  });
});

describe("the record of what went live", () => {
  test("receipts are kept in a readable file, newest last, and capped", () => {
    const d = tmp();
    for (let i = 0; i < 55; i++) addShipReceipt(d, { at: `2026-10-09T10:${String(i).padStart(2, "0")}:00Z`, action: "live", snapshot: `cp_${i}`, gates: [], proof: "passed" });
    const all = readShips(d);
    expect(all.length).toBe(50); expect(all.at(-1)!.snapshot).toBe("cp_54");
  });
  test("a damaged file reads as empty and is replaced safely", () => {
    const d = tmp(); addShipReceipt(d, { at: "x", action: "live", snapshot: "a", gates: [], proof: "passed" });
    writeFileSync(join(d, ".companion", "ships.json"), "{ not json");
    expect(readShips(d)).toEqual([]);
    addShipReceipt(d, { at: "y", action: "live", snapshot: "b", gates: [], proof: "passed" });
    expect(readShips(d).length).toBe(1);
  });
});

// The zero cost warm up: when Home opens or the ask box gets the keyboard, the bundled Claude binary is read through once
// so its pages are in the Mac's memory when the first task starts it. It is never run, no prompt is sent, nothing is spent.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCommand } from "../../protocol/index.ts";
import { CHUNK, Warmer, readThrough } from "../src/warm.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const file = (bytes: number) => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-warm-"))); made.push(d);
  const p = join(d, "claude"); writeFileSync(p, Buffer.alloc(bytes, 7)); return p;
};

describe("reading the binary through", () => {
  test("every byte is read, in chunks, and nothing is kept", async () => {
    const p = file(2 * CHUNK + 3);
    expect(await readThrough(p, new AbortController().signal)).toBe(2 * CHUNK + 3);
  });
  test("Stop ends it partway", async () => {
    const p = file(3 * CHUNK);
    const ac = new AbortController(); ac.abort();
    await expect(readThrough(p, ac.signal)).rejects.toThrow();
  });
});

describe("the warm up", () => {
  test("reads once, then not again for a while, then again", async () => {
    let t = 0, reads = 0;
    const p = file(10);
    const w = new Warmer({ binary: () => p, now: () => t, everyMs: 1000, read: async () => { reads++; return 10; } });
    expect(await w.warm()).toMatchObject({ read: true, bytes: 10 });
    t = 999; expect(await w.warm()).toMatchObject({ read: false, why: "recent" });
    t = 1000; expect(await w.warm()).toMatchObject({ read: true });
    expect(reads).toBe(2);
  });
  test("one at a time: a second press while it reads does nothing", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const w = new Warmer({ binary: () => "/x", now: () => 0, read: async () => { await gate; return 5; } });
    const first = w.warm();
    expect(await w.warm()).toMatchObject({ read: false, why: "busy" });
    release();
    expect(await first).toMatchObject({ read: true, bytes: 5 });
  });
  test("no binary (the scripted engine, a damaged copy of the app), or one that cannot be read: nothing breaks", async () => {
    expect(await new Warmer({ binary: () => null }).warm()).toMatchObject({ read: false, why: "no_binary" });
    expect(await new Warmer({ binary: () => { throw new Error("Claude binary not found"); } }).warm()).toMatchObject({ read: false, why: "no_binary" });
    expect(await new Warmer({ binary: () => "/nowhere/claude-companion-test" }).warm()).toMatchObject({ read: false, why: "failed" });
  });
  test("Stop everything ends a read under way", async () => {
    const w = new Warmer({ binary: () => "/x", now: () => 0, read: (_p, signal) => new Promise((_, rej) => signal.addEventListener("abort", () => rej(new Error("stopped")), { once: true })) });
    const p = w.warm();
    w.stop();
    expect(await p).toMatchObject({ read: false, why: "stopped" });
  });
  test("it only ever reads: no program is started, no prompt is sent, nothing goes on the network", () => {
    const src = readFileSync(new URL("../src/warm.ts", import.meta.url), "utf8").replace(/^\s*(\/\/|\*|\/\*\*).*$/gm, "");
    for (const bad of ["spawn", "exec", "child_process", "fetch(", "query(", "prewarm", "keychain", "Bun.$"]) expect(src.includes(bad), bad).toBe(false);
  });
  test("the engine answers the page's warm up message, and the protocol knows it", () => {
    expect(parseCommand(JSON.stringify({ v: 1, id: "w1", type: "engine.warm" })).ok).toBe(true);
    const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
    expect(main).toContain('cmd.type === "engine.warm"');
    expect(main).toMatch(/agent\.interruptAll[^\n]*warmer\.stop\(\)/);
  });
});

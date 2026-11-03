// Must fix 12 (review of 4 Nov): one throw while handling a command used to end the engine's command loop, while the page
// was told it kept running. Buttons then did nothing and Stop might not stop. Each line is now handled on its own: a throw
// is said as a protocol.error for that command, and the next command is answered as usual.
import { describe, expect, test } from "bun:test";
import { pumpLine } from "../src/pump.ts";

const deps = (dispatch: (cmd: { type: string }) => void) => {
  const said: Record<string, unknown>[] = [], keys: string[] = [];
  return { said, keys, d: { takeKey: (l: string) => { keys.push(l); }, dispatch: dispatch as never, say: (e: Record<string, unknown>) => { said.push(e); } } };
};

describe("one command that throws never stops the engine listening", () => {
  test("the throw is said for that command, and the next one is answered", () => {
    const seen: string[] = [];
    const { said, d } = deps((cmd) => { if (cmd.type === "tasks.list") throw new Error("boom at /Users/me/secret sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789"); seen.push(cmd.type); });
    pumpLine('{"v":1,"id":"a","type":"tasks.list","project":"/p"}', d);
    pumpLine('{"v":1,"id":"b","type":"runner.ping"}', d);
    expect(seen).toEqual(["runner.ping"]);
    expect(said.length).toBe(1);
    expect(said[0]).toMatchObject({ type: "protocol.error", failed: "tasks.list" });
    expect(String(said[0].reason)).toMatch(/^[A-Z]/);
    expect(JSON.stringify(said[0])).not.toContain("abcdefghijklmnopqrstuvwxyz0123456789");
  });
  test("a line that is not a command is said once and skipped", () => {
    const seen: string[] = [];
    const { said, d } = deps((cmd) => { seen.push(cmd.type); });
    pumpLine("not json", d);
    pumpLine('{"v":1,"id":"x","type":"nope"}', d);
    pumpLine('{"v":1,"id":"b","type":"runner.ping"}', d);
    expect(said.map((e) => e.type)).toEqual(["protocol.error", "protocol.error"]);
    expect(seen).toEqual(["runner.ping"]);
  });
  test("the key handoff is taken before anything is parsed or repeated", () => {
    const { said, keys, d } = deps(() => { throw new Error("never"); });
    pumpLine('{"v":1,"type":"auth.key","key":"sk-ant-api03-zzzzzzzzzzzzzzzzzzzzzzzzzz"}', d);
    expect(keys.length).toBe(1);
    expect(said).toEqual([]);
  });
  test("a throw while saying the error is not a second failure", () => {
    let n = 0;
    const d = { takeKey: () => {}, dispatch: (() => { throw new Error("x"); }) as never, say: () => { n++; throw new Error("pipe closed"); } };
    expect(() => pumpLine('{"v":1,"id":"b","type":"runner.ping"}', d)).not.toThrow();
    expect(n).toBe(1);
  });
  test("the engine's loop goes through it", async () => {
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(main).toContain("pumpLine(line, { takeKey, dispatch, say });");
  });
});

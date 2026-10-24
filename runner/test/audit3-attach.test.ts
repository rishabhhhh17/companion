// Audit round 3 (24 Oct 2026): the engine's own check counts the text that goes (after its secrets are hidden), not the text it was given.
import { describe, expect, test } from "bun:test";
import { ATTACH, checkAttachments } from "../src/attach.ts";

describe("the engine's caps count the text after hiding secrets", () => {
  const line = "password=abc12\n";   // 15 bytes; "password=[secret]\n" is 18
  test("a file under the cap that grows past it when its secrets are hidden is refused, even if the page did not do it", () => {
    const raw = line.repeat(Math.floor(99_900 / line.length));
    expect(new TextEncoder().encode(raw).length).toBeLessThanOrEqual(ATTACH.maxTextBytes);
    expect("error" in checkAttachments({ files: [{ name: "config.log", text: raw }] })).toBe(true);
  });
  test("whatever the engine lets through is within both caps as it goes", () => {
    const part = line.repeat(Math.floor(65_000 / line.length));
    const r = checkAttachments({ files: ["a.log", "b.log", "c.log"].map((name) => ({ name, text: part })) });
    if ("error" in r) return;   // refused is fine
    const sizes = r.files.map((f) => new TextEncoder().encode(f.text).length);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(ATTACH.maxTextBytes);
    expect(sizes.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(ATTACH.maxTextTotal);
  });
});

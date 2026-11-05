// Bug bash (m67): a memory line's date ("2026-10-09", saved by the engine) shown in Home west of UTC.
import { expect, test } from "bun:test";
import { memoryDate } from "./memorySettings.ts";

test("a line saved on 9 Oct shows 9 Oct in Los Angeles", () => {
  const was = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  try { expect(memoryDate("2026-10-09")).toMatch(/\b9\b/); } finally { process.env.TZ = was; }
});

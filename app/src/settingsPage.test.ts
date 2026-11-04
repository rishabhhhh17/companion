import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { placeShown } from "./settingsPage.tsx";
import { S } from "./strings.ts";

describe("nothing unfinished in Settings (M28)", () => {
  test("Google shows only once this build has it set up, or an account is already kept", () => {
    expect(placeShown("google", false)).toBe(false);
    expect(placeShown("google", true)).toBe(true);
    expect(placeShown("key", false)).toBe(true);
  });
  test("no note for the team ever reaches a person", () => {
    const all = JSON.stringify(S);
    expect(all).not.toMatch(/for the team|google\.json|build again/i);
    expect(readFileSync(new URL("./strings.ts", import.meta.url), "utf8")).not.toMatch(/For the team:/);
  });
});

describe("moving between Settings pages", () => {
  // Found 3 Nov 2026 while shooting the orb's pictures: a page reads one setting per row (PageView's useSetting loop), so
  // going from General to About or Character changed how many it read and the whole Settings window went blank (React
  // error 300). Each page is its own component instance, keyed by the page, so the count never changes under it. Must fix
  // 4 (review of 4 Nov): the loop itself is gone, one useSettings call reads the whole list (partBoundary.test.ts).
  test("each page is drawn fresh, so a page with fewer rows never breaks the window", () => {
    const src = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
    expect(src).toContain("useSettings(keys);");
    expect(src).not.toContain("for (const k of keys) useSetting(k);");
    expect(src).toContain("<PageView key={page} page={page} />");
    expect(src).not.toMatch(/<PageView page=/);
  });
});

describe("About names the build (must fix 6)", () => {
  // A tester's report must match the source it came from: About shows the commit beside the version.
  test("the version line carries the commit when the build knows it", () => {
    expect(S.setRows.version("0.1.0", "1a2b3c4d5e6f")).toBe("Version 0.1.0, build 1a2b3c4d5e6f");
    expect(S.setRows.version("0.1.0", "")).toBe("Version 0.1.0");
    expect(S.setRows.version("0.1.0", "unknown")).toBe("Version 0.1.0");
    expect(S.setRows.version("")).toBe("");
    const src = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
    // M69 step 3: About's head names it with its version ("Squibby 0.9.2"), the build and the channel under it.
    expect(src).toContain("{info.version ? `${S.product} ${info.version}` : S.product}");
    expect(src).toContain("S.setRows.build(info.commit)");
  });
});

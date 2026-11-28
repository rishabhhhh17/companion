// F29 (28 Nov 2026): on Squibby's own server, a Mac with no sign in says "Sign in to start" with Sign in with Google as the
// main button, never the vague "Fixing is not switched on" (the founder could not find the sign in, which was hidden).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { blockerOf, fixOffered } from "./homeHero.ts";
import { googleParts } from "./settings.ts";
import { S } from "./strings.ts";

const base = { connected: "none", runnerUp: true, claude: null } as const;
describe("sign in to start", () => {
  test("managed and signed out: Sign in to start; signed in or on a developer key route: as before", () => {
    expect(blockerOf({ ...base, account: { managed: true, signedIn: false } })).toBe("signIn");
    expect(blockerOf({ ...base, account: { managed: true, signedIn: true } })).toBe("key");
    expect(blockerOf({ ...base, account: { managed: false, signedIn: false } })).toBe("key");
    expect(blockerOf({ ...base, account: null })).toBe("key");
    expect(blockerOf({ ...base, connected: "api_key", account: { managed: true, signedIn: false } })).toBe(null);
    expect(fixOffered("signIn")).toBe(false);
  });
  test("its words, and its button starts Google's own sign in", () => {
    expect(S.home.blocked.signIn.main).toBe("Sign in with Google");
    expect(S.home.blockedTag.signIn).toBe("Not signed in");
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain('if (blocker === "signIn") { void invoke("google_start", { signin: true, apps: [], label: null })');
    expect(card).toContain('invoke("account_state")');
  });
  test("Settings always offers the sign in", () => {
    expect(googleParts([], false).signIn).toBe(true);
  });
  test("A18: a closed Google tab never locks Settings' Sign in or Connect until the old wait times out", () => {
    // The shell lets a second press take over (google_start, GOOGLE_GEN), so the page keeps both buttons pressable.
    const page = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
    const g = page.slice(page.indexOf("function GoogleSection("), page.indexOf("function GoogleSection(") + 6000);
    expect(g).toContain("onClick={() => start(true)}");
    expect(g).not.toMatch(/disabled=\{[^}]*waiting/);
  });
});

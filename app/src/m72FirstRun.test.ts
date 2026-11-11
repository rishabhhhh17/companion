// M72 (make it work), the walkthrough's first run items: Back never throws away a found problem (item 1), the found screen
// shows the file, the line and the plain reason it already has (item 17), and the tall layout has no empty band (item 18).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { backPress } from "./onboarding.ts";
import { S } from "./strings.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("item 1: Back keeps a found problem", () => {
  test("with an optional sub panel open on the check screen, Back closes it and stays on the finding", () => {
    expect(backPress("check", { fold: true, more: true, found: true })).toEqual({ close: true });
    expect(backPress("check", { fold: false, more: true, found: true })).toEqual({ close: true });
    expect(backPress("check", { fold: true, more: false, found: false })).toEqual({ close: true });
  });
  test("with nothing open, Back goes to the screen before; on the first screen there is no Back", () => {
    expect(backPress("check", { fold: false, more: false, found: true })).toEqual({ to: "project" });
    expect(backPress("project", { fold: false, more: false, found: false })).toEqual({ to: "hello" });
    expect(backPress("hello", { fold: false, more: false, found: false })).toBeNull();
  });
  // The page using it (a problem found before Back is offered again, never checked again) is clicked through since M59:
  // app/dom/firstRun.test.tsx.
});

describe("item 17: the found screen shows what it already has", () => {
  // The failing line drawn as the pointed code (file, line and the line itself) is checked on the rendered first run since
  // M59: app/dom/firstRun.test.tsx.
});

describe("item 18: no large empty band in the tall first run", () => {
  test("the grow spacer only pushes the foot down in the wide layout's fixed height", () => {
    const css = read("./ui/look.css") + read("./style.css") + read("./ui/black.css") + read("./ui/home.css");
    expect(css).toMatch(/\[data-layout="tall"\][^{]*\.fr-grow\s*\{[^}]*flex:\s*0/);
    // and the first run does not stretch to the window, so Home's shape can fit its words (card.tsx tellHeight).
    expect(css).toContain('.home[data-layout="tall"] .inner:has(> .onboarding.fr), .home[data-layout="tall"] .inner > .onboarding.fr { flex: 0 0 auto; }');
  });
});

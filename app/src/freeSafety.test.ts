// Must fix 20 (F25: every safety feature is on Free). A file of its own on purpose: the motion branch (M55) rewrote Home's
// chip row and its plan.test.ts still expects the Pro tag on Is it safe and on the main button. A merge that takes that
// side of card.tsx and plan.test.ts together would bring the tag back with every test still passing. This file has no
// counterpart on that branch, so it survives the merge and fails it.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
const lines = card.split("\n");

describe("Check before going live never carries the Pro tag", () => {
  test("the Is it safe chip has no Pro tag", () => {
    const safe = lines.filter((l) => l.includes("S.look.chipSafe"));
    expect(safe.length).toBeGreaterThan(0);
    for (const l of safe) expect(l, l.trim()).not.toContain("<ProTag");
  });
  test("Home's main button has no Pro tag, whatever it says", () => {
    const main = lines.filter((l) => l.includes("hero-main") && l.includes("heroMain"));
    expect(main.length).toBeGreaterThan(0);
    for (const l of main) expect(l, l.trim()).not.toContain("<ProTag");
    expect(card).not.toContain("shipTagged");
  });
  test("on Home the tag is drawn only on Put it online", () => {
    const tagged = lines.filter((l) => l.includes("<ProTag"));
    expect(tagged.length).toBe(1);
    expect(tagged[0]).toContain("S.onlineButton");
  });
});

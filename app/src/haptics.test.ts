// M66: the haptic switch (the plan, Part 2 "Open", frame 0, and Part 4: never on by default, only on the person's own
// actions, rule 16). A light tap on the trackpad as the notch opens under the person's own click or pointing. The shell
// plays it (haptic.rs); this is its setting, its place in Settings and its words.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { defOf, defaultOf } from "../../protocol/settings.ts";
import { PAGES, placeOf } from "./settingsPages.ts";
import { S } from "./strings.ts";

describe("the haptic switch", () => {
  test("is a setting the shell applies, off unless turned on", () => {
    expect(defOf("island.haptics")).toMatchObject({ section: "home", kind: "switch", default: false, scope: "app", applies: ["shell"], store: "settings", live: true });
    expect(defaultOf("island.haptics")).toBe(false);
  });
  test("lives with the other notch choices, in General's More options", () => {
    expect(placeOf("island.haptics")).toMatchObject({ page: "more", group: "more.general.notch", more: true, topic: "more.general.notch" });
    expect(PAGES.general.more.find((t) => t.id === "more.general.notch")!.items).toContain("island.haptics");
  });
  test("says what it does in plain words, and search finds it by the words people use", () => {
    const w = (S.set as Record<string, { label: string; help: string; also?: readonly string[] }>)["island.haptics"];
    expect(w.label).toBe("Tap the trackpad when the notch opens");
    for (const t of [w.label, w.help, (S.short as Record<string, string>)["island.haptics"]]) { expect(t).toBeTruthy(); expect(t).not.toContain("—"); }
    expect(w.also).toEqual(expect.arrayContaining(["haptic", "haptics", "vibrate", "feedback"]));
  });
  test("the shell reads it only when the notch opens under a click or pointing", () => {
    const rs = readFileSync(new URL("../src-tauri/src/haptic.rs", import.meta.url), "utf8");
    expect(rs).toContain('pub const KEY: &str = "island.haptics";');
  });
});

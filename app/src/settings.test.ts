// The settings page: plain words for sizes and permissions, and the delete everything steps.
import { describe, expect, test } from "bun:test";
import { DELETE_PHRASE, deletableLines, formatBytes, permissionRow, type Inventory } from "./settings.ts";

describe("sizes in plain words", () => {
  test("bytes, kilobytes, megabytes, gigabytes", () => {
    expect(formatBytes(0)).toBe("nothing");
    expect(formatBytes(900)).toBe("under 1 KB");
    expect(formatBytes(12 * 1024)).toBe("12 KB");
    expect(formatBytes(141 * 1024 * 1024)).toBe("141 MB");
    expect(formatBytes(2.4 * 1024 * 1024 * 1024)).toBe("2.4 GB");
  });
});

describe("permissions", () => {
  test("allowed needs no button; not allowed gets one; not asked yet says when it will be asked", () => {
    expect(permissionRow("screen_recording", "allowed")).toMatchObject({ state: "Allowed", button: false });
    expect(permissionRow("screen_recording", "not_allowed")).toMatchObject({ state: "Not allowed", button: true });
    expect(permissionRow("microphone", "not_asked")).toMatchObject({ state: "Not asked yet", button: false });
    expect(permissionRow("microphone", "not_allowed")).toMatchObject({ state: "Not allowed", button: true });
    expect(permissionRow("accessibility", "unknown")).toMatchObject({ button: false });
  });
  test("each says what it is for, in plain words", () => {
    for (const k of ["screen_recording", "accessibility", "microphone"] as const) {
      const r = permissionRow(k, "allowed");
      expect(r.label.length).toBeGreaterThan(3); expect(r.why.length).toBeGreaterThan(20); expect(r.why).not.toMatch(/TCC|entitlement|API/i);
    }
  });
});

describe("what Companion keeps, and deleting it", () => {
  const inv: Inventory = { items: [{ id: "history", label: "Your task history and spending record", bytes: 12288 }, { id: "speech", label: "The speech model for hold to talk", bytes: 141 * 1024 * 1024 }], keySaved: true, projectsWithNotes: 2 };
  test("every group is listed with its size, and a saved key is named", () => {
    expect(deletableLines(inv)).toEqual(["Your task history and spending record: 12 KB", "The speech model for hold to talk: 141 MB", "Your saved Claude key (in your Keychain)"]);
  });
  test("with no key saved there is no key line", () => expect(deletableLines({ ...inv, keySaved: false }).some((l) => /key/i.test(l))).toBe(false));
  test("the confirmation is exact words, so a stray call cannot delete anything", () => expect(DELETE_PHRASE).toBe("delete everything"));
});

import { numbersLines } from "./settings.ts";
describe("beta numbers in words", () => {
  test("counts and rates are shown plainly, and a missing rate says so", () => {
    const l = numbersLines({ enabled: true, totals: { session: 5, walk_started: 4, walk_done: 3 }, rates: { walkCompletion: 0.75, stepSuccess: null, proofPass: 0.5, anywhereShare: null, softRingCorrections: 2 } });
    expect(l[0]).toBe("Times you used Companion: 5");
    expect(l[2]).toBe("Lessons started: 4, finished: 3 (75%)");
    expect(l[3]).toContain("not enough yet");
    expect(l.at(-1)).toBe("Times you corrected a guess: 2");
  });
});

import { permissionLesson } from "./settings.ts";
import { readdirSync } from "node:fs";
describe("permission lessons", () => {
  test("each permission names a lesson that ships with the app", () => {
    const shipped = readdirSync(new URL("../../lessons", import.meta.url).pathname).map((f) => f.replace(/\.json$/, ""));
    for (const k of ["screen_recording", "accessibility", "microphone"] as const) expect(shipped).toContain(permissionLesson(k));
  });
});

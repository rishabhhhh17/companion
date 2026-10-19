import { describe, expect, test } from "bun:test";
import { autoCheckDue, canInstall, DAY_MS, installAllowed, isBusy, readyVersion, updateLine } from "./updates.ts";

describe("daily update check", () => {
  const now = 1_800_000_000_000;
  test("it is due once a day, never when off or not set up", () => {
    expect(autoCheckDue({ configured: true, enabled: true, lastMs: null, nowMs: now })).toBe(true);
    expect(autoCheckDue({ configured: true, enabled: true, lastMs: now - DAY_MS - 1, nowMs: now })).toBe(true);
    expect(autoCheckDue({ configured: true, enabled: true, lastMs: now - 1000, nowMs: now })).toBe(false);
    expect(autoCheckDue({ configured: true, enabled: false, lastMs: null, nowMs: now })).toBe(false);
    expect(autoCheckDue({ configured: false, enabled: true, lastMs: null, nowMs: now })).toBe(false);
  });
  test("a clock set far back or a junk value does not stop checking forever", () => {
    expect(autoCheckDue({ configured: true, enabled: true, lastMs: now + 10 * DAY_MS, nowMs: now })).toBe(true);
    expect(autoCheckDue({ configured: true, enabled: true, lastMs: Number.NaN, nowMs: now })).toBe(true);
  });
});

describe("update words", () => {
  test("each state is said plainly", () => {
    expect(updateLine({ stage: "idle" }, "0.1.0", false)).toContain("not set up");
    expect(updateLine({ stage: "none" }, "0.1.0", true)).toContain("newest");
    expect(updateLine({ stage: "found", version: "0.2.0", notes: "" }, "0.1.0", true)).toBe("Version 0.2.0 is ready. You have 0.1.0.");
    expect(updateLine({ stage: "failed", reason: "No internet." }, "0.1.0", true)).toBe("No internet.");
  });
  test("it never installs while something is running", () => {
    expect(canInstall(true)).toBe(false); expect(canInstall(false)).toBe(true);
  });
});

describe("busy means do not restart", () => {
  test("a task, a drive, an approval, a deploy or an install in progress all count", () => {
    expect(isBusy({ character: "working" })).toBe(true);
    expect(isBusy({ drive: { step: 1 } })).toBe(true);
    expect(isBusy({ approvals: [{}] })).toBe(true);
    expect(isBusy({ shipFlow: { stage: "deploying" } })).toBe(true);
    expect(isBusy({ install: { stage: "installing" } })).toBe(true);
    expect(isBusy({ practice: { stage: "fixing" } })).toBe(true);
  });
  test("resting states are not busy", () => {
    expect(isBusy({ character: "idle" })).toBe(false);
    expect(isBusy({ shipFlow: { stage: "live" } })).toBe(false);
    expect(isBusy({})).toBe(false);
  });
  // Found in review (19 Oct 2026): Home's notice asked canInstall(!isBusy(m)), which is isBusy(m) itself, so Install was
  // offered only while a task ran and the restart cut it off. The one guard every Install button asks is this one.
  test("Install is offered only when nothing runs, from the model itself", () => {
    expect(installAllowed({})).toBe(true);
    expect(installAllowed({ character: "idle" })).toBe(true);
    expect(installAllowed({ shipFlow: { stage: "live" } })).toBe(true);
    for (const busy of [{ character: "working" }, { character: "thinking" }, { character: "needsYou" }, { approvals: [{}] }, { shipFlow: { stage: "deploying" } }, { drive: { step: 1 } }, { practice: { stage: "fixing" } }]) {
      expect(installAllowed(busy)).toBe(false);
    }
  });
});

describe("the shell saying an update is ready", () => {
  test("only a plain version is taken; anything else means none", () => {
    expect(readyVersion({ version: "0.2.0" })).toBe("0.2.0");
    expect(readyVersion({ version: "1.0.0-beta.2+7" })).toBe("1.0.0-beta.2+7");
    for (const v of [null, undefined, {}, { version: "" }, { version: 2 }, { version: "<b>9</b>" }, { version: "x".repeat(41) }, "0.2.0"]) expect(readyVersion(v)).toBeNull();
  });
});

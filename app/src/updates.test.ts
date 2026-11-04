import { describe, expect, test } from "bun:test";
import { autoCheckDue, canInstall, DAY_MS, installAllowed, isBusy, readyVersion, updateLine, afterInstallFailed } from "./updates.ts";

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
    // M69: no empty "Version ." while the version is not known yet.
    expect(updateLine({ stage: "idle" }, "", false)).toBe("Updates are not set up in this build yet. The daily check starts once they are.");
    expect(updateLine({ stage: "none" }, "", true)).toBe("You have the newest version.");
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

describe("a task that ended on a question", () => {
  const asked = { character: "needsYou", task: { agent: "a" }, receipt: { asks: true }, agents: { a: "needsYou" }, approvals: [] } as never;
  test("nothing runs, so Install is allowed", () => {
    expect(isBusy(asked)).toBe(false);
    expect(installAllowed(asked)).toBe(true);
  });
  test("a waiting approval, plan or card on top of it still counts as busy", () => {
    expect(isBusy({ ...(asked as object), approvals: [{}] } as never)).toBe(true);
    expect(isBusy({ ...(asked as object), plan: {} } as never)).toBe(true);
    expect(isBusy({ ...(asked as object), agents: { a: "needsYou", b: "working" } } as never)).toBe(true);
    expect(isBusy({ ...(asked as object), receipt: { asks: true, undone: true } } as never)).toBe(true);
  });
});

describe("the shell saying an update is ready", () => {
  test("only a plain version is taken; anything else means none", () => {
    expect(readyVersion({ version: "0.2.0" })).toBe("0.2.0");
    expect(readyVersion({ version: "1.0.0-beta.2+7" })).toBe("1.0.0-beta.2+7");
    for (const v of [null, undefined, {}, { version: "" }, { version: 2 }, { version: "<b>9</b>" }, { version: "x".repeat(41) }, "0.2.0"]) expect(readyVersion(v)).toBeNull();
  });
});

describe("an install that failed", () => {
  const prev = { stage: "found", version: "0.2.0", notes: "n" } as const;
  test("the found update comes back, so Install shows again, with the reason beside it", () => {
    const r = afterInstallFailed(prev, "I could not reach the update address.");
    expect(r.update).toEqual(prev);
    expect(r.state).toEqual(prev);
    expect(r.note).toBe("I could not reach the update address.");
  });
  test("with nothing found before, the failure is shown as it was", () => {
    const r = afterInstallFailed(null, "x");
    expect(r.update).toBeNull();
    expect(r.state).toEqual({ stage: "failed", reason: "x" });
  });
  test("both pages put it back", async () => {
    const fs = await import("node:fs");
    for (const f of ["settingsPage.tsx", "card.tsx"]) expect(fs.readFileSync(new URL("./" + f, import.meta.url), "utf8")).toContain("afterInstallFailed(");
  });
});

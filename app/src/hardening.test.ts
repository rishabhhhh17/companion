import { describe, expect, test } from "bun:test";
import { formatUsd, initial, plainError, reduce, type Model } from "./model.ts";

const run = (events: Record<string, unknown>[], from: Model = initial()): Model => events.reduce<Model>((m, e) => reduce(m, e), from);

describe("the engine coming back", () => {
  test("a new hello after the engine stopped clears the stopped message and wakes the character", () => {
    const down = run([{ type: "app.runner_down", reason: "" }]);
    expect(down.runnerUp).toBe(false); expect(down.character).toBe("off"); expect(down.error).not.toBeNull();
    const up = run([{ type: "runner.hello" }], down);
    expect(up.runnerUp).toBe(true); expect(up.character).toBe("idle"); expect(up.error).toBeNull();
  });
  test("a restart is said in plain words, and a notice from the app is shown", () => {
    expect(run([{ type: "app.runner_restarted" }]).notice).toMatch(/restarted/i);
    expect(run([{ type: "app.notice", message: "Another app is using the keys." }]).notice).toBe("Another app is using the keys.");
  });
});

describe("stop everything leaves no stale card behind", () => {
  test("plans, questions, pauses and progress are cleared", () => {
    const busy = run([
      { type: "plan.ready", agent: "a", steps: [{ title: "x" }], estimateUsd: 0.3 },
      { type: "drive.step", index: 1, total: 2, title: "x", status: "running" },
      { type: "loop.stuck", index: 1, title: "x", failure: { label: "Tests", detail: "bad" }, options: [{ id: "stop", label: "Stop" }] },
      { type: "drive.paused", reason: "editor" },
    ]);
    const after = run([{ type: "app.stop_everything" }], busy);
    expect(after.plan).toBeNull(); expect(after.drive).toBeNull(); expect(after.stuck).toBeNull(); expect(after.paused).toBeNull();
  });
});

describe("only one decision at a time", () => {
  test("a stuck question replaces a pause, and a new plan replaces both", () => {
    const stuck = run([{ type: "drive.paused", reason: "editor" }, { type: "loop.stuck", index: 1, title: "x", failure: { label: "T", detail: "d" }, options: [{ id: "stop", label: "Stop" }] }]);
    expect(stuck.stuck).not.toBeNull(); expect(stuck.paused).toBeNull();
    const planned = run([{ type: "plan.ready", agent: "a", steps: [{ title: "y" }], estimateUsd: 0.1 }], stuck);
    expect(planned.stuck).toBeNull(); expect(planned.paused).toBeNull();
  });
  test("a stuck question with no options still offers a way out", () => {
    const m = run([{ type: "loop.stuck", index: 1, title: "x", failure: { label: "T", detail: "d" } }]);
    expect(m.stuck!.options.map((o) => o.id)).toEqual(["different", "stop"]);
  });
});

describe("plain wording", () => {
  test("money is never '1 cents' or 'free so far' when a number was expected", () => {
    expect(formatUsd(0.01)).toBe("1 cent");
    expect(formatUsd(0.02)).toBe("2 cents");
    expect(formatUsd(0.994)).toBe("99 cents");
    expect(formatUsd(0.996)).toBe("$1.00");
  });
  test("an unknown error says what to do next", () => {
    expect(plainError("engine error: boom")).toMatch(/try again/i);
  });
});

describe("reduced motion (rule 13)", () => {
  test("every looping or one off animation on the character is switched off when the Mac asks for less motion", async () => {
    const css = await Bun.file(new URL("./style.css", import.meta.url)).text();
    const block = /@media \(prefers-reduced-motion: reduce\)\s*\{([^}]*\{[^}]*\}[^}]*)\}/.exec(css)?.[1] ?? "";
    expect(block).toContain("[data-react]");
    expect(block).toContain("[data-motion]");
    expect(block).toContain("animation: none");
  });
  test("the page that draws rings and sketches also turns its pulse off", async () => {
    const html = await Bun.file(new URL("../overlay.html", import.meta.url)).text();
    expect(html).toMatch(/prefers-reduced-motion:reduce\)\{\.ring\{animation:none\}/);
  });
});

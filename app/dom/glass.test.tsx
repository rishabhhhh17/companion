// GLASS (the founder, 19 Nov 2026, direction B): Home's top strip and tabs in the glass material, rendered with the stand in
// app. Written from the GLASS review's findings before the fixes: one Settings button in the wide Home, one Places landmark,
// a real tablist with its panel, and a greeting that says the same as the menu bar about the same state.
import { describe, expect, test } from "bun:test";
import { S } from "../src/strings.ts";
import { _resetForTests, startSettings } from "../src/settingsStore.ts";
import { PROJECT, act, press, renderHome as renderAny, returning, runner, screen, type Setup } from "./render.tsx";

// card.tsx starts its settings once, when the module first loads, which may be before this test's answers are set up. Here
// the settings are read again with this test's answers first, as a fresh page would (the hover panel test does the same),
// so a picked material really applies.
async function renderHome(o: Setup) {
  returning(o);
  await act(async () => { _resetForTests(); startSettings(); await new Promise((r) => setTimeout(r, 20)); });
  return renderAny(o);
}

const working = [
  { type: "task.started", agent: "builder-1", project: PROJECT, prompt: "Make the button blue" },
  { type: "agent.state", agent: "builder-1", state: "working" },
  { type: "checkpoint.created", project: PROJECT, agent: "builder-1", checkpoint: "cp_0042", label: "Before: make the button blue", files: 3, skipped: [] },
];
const question = { type: "approval.request", approval: "ap_1", agent: "builder-1", checkpoint: "cp_0042", toolUseId: "toolu_1", risk: "irreversible", title: "Install a package", expiresAt: new Date(Date.now() + 1800_000).toISOString(), action: "npm install left-pad", undoable: false };

describe("GLASS: the wide Home's top", () => {
  test("one Settings button (the gear in the top strip), and one Places landmark (the tablist)", async () => {
    await renderHome({ settings: { "look.layout": "wide" } });
    await runner({ type: "tasks.list", project: PROJECT, tasks: [] });
    expect(document.querySelector(".home[data-side]")).not.toBeNull();
    expect(document.querySelectorAll(`#${CSS.escape("home-tab-settings")}`)).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: S.home.places.settings })).toHaveLength(1);
    expect(document.querySelectorAll(`[aria-label="${S.glass.tabsLabel}"]`)).toHaveLength(1);
    expect(screen.getByRole("tablist", { name: S.glass.tabsLabel })).toBeTruthy();
    // The side holds the recent work and is named for it.
    expect(screen.getByRole("navigation", { name: S.look.sideRecent })).toBeTruthy();
  });

  test("each tab controls the one panel, and the panel is labelled by the open tab", async () => {
    await renderHome({ settings: { "look.layout": "wide" } });
    await runner({ type: "tasks.list", project: PROJECT, tasks: [] });
    const tabs = screen.getAllByRole("tab");
    expect(tabs.length).toBeGreaterThanOrEqual(3);
    for (const t of tabs) {
      const id = t.getAttribute("aria-controls");
      expect(id, t.textContent ?? "").toBeTruthy();
      expect(document.getElementById(id!)?.getAttribute("role")).toBe("tabpanel");
    }
    const panel = screen.getByRole("tabpanel");
    const open = tabs.find((t) => t.getAttribute("aria-selected") === "true")!;
    expect(panel.getAttribute("aria-labelledby")).toBe(open.id);
    await press(S.home.places.did);
    const now = screen.getAllByRole("tab").find((t) => t.getAttribute("aria-selected") === "true")!;
    expect(now.textContent).toContain(S.home.places.did);
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(now.id);
  });

  test("the greeting says what the menu bar says: a question waiting wins over the work it holds up", async () => {
    await renderHome({ settings: { "look.layout": "wide" } });
    await runner({ type: "tasks.list", project: PROJECT, tasks: [] }, ...working, question);
    const greet = document.querySelector(".gl-greet")!;
    expect(greet.textContent).toContain(S.hello.questions(1));
    expect(greet.textContent).not.toContain("Working");
  });

  test("the greeting names the work by its own words, after a colon", async () => {
    await renderHome({ settings: { "look.layout": "wide" } });
    await runner({ type: "tasks.list", project: PROJECT, tasks: [] }, ...working);
    const greet = document.querySelector(".gl-greet")!;
    expect(greet.textContent).toMatch(/Working: /);
    expect(greet.getAttribute("title")).toBe(greet.textContent);   // short enough: nothing cut
  });
});

describe("GLASS: Before keeps the places as buttons", () => {
  test("under Before the places are buttons, with no tablist", async () => {
    await renderHome({ settings: { "look.layout": "wide", "look.material": "classic" } });
    await runner({ type: "tasks.list", project: PROJECT, tasks: [] });
    expect(document.querySelector(".gl-tabs")).toBeNull();
    expect(document.querySelector(".gl-top")).toBeNull();
    expect(screen.getAllByRole("button", { name: S.home.places.did }).length).toBeGreaterThan(0);
    expect(document.querySelectorAll(`#${CSS.escape("home-tab-settings")}`)).toHaveLength(1);
  });
});

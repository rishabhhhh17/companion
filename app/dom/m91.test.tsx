// M91, rendered: the notch panel's ring with the reading the real plan route gives (one real run on a Max plan, 14 Nov 2026):
// room left, the week named, the share used and the reset in its label. And a 5 hour window at 85% turns amber, so Run it
// asks first at the usual 80% mark.
import { describe, expect, test } from "bun:test";
import { IslandPanel } from "../src/islandPanel.tsx";
import { initial, reduce, type Model } from "../src/model.ts";
import { S } from "../src/strings.ts";
import { app, ev, press, renderHome, renderPage, runner, screen, type, PROJECT } from "./render.tsx";

const WEEK_RESET = new Date(Date.now() + 3 * 86_400_000).toISOString();
const FIVE_RESET = new Date(Date.now() + 2 * 3600_000).toISOString();
const real = { type: "usage.runway", state: "ok", source: "plan", usedPct: 46, resetsAt: WEEK_RESET, window: "seven_day" };
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, ev(e) as never), from);
const atRest = () => run([{ type: "auth.status", method: "api_key", source: "keychain" }, { type: "ui.folderShown", project: PROJECT }]);

describe("the ring with the real plan reading", () => {
  test("room left: grey, the week named, the share and the reset said", async () => {
    app.reset();
    await renderPage(<IslandPanel m={run([real], atRest())} line="" shown />);
    const ring = screen.getByRole("img", { name: /^The Claude week limit is 46% used\. It resets / });
    expect(ring.getAttribute("data-level")).toBe("ok");
    expect(ring.textContent).toBe(`${S.m91.over("week")}${S.m91.used(46)}`);
    expect(ring.querySelector("small")?.textContent).toBe("Week");
  });
  test("the 5 hour window at 85% while the plan still says allowed: amber", async () => {
    app.reset();
    await renderPage(<IslandPanel m={run([{ ...real, usedPct: 85, window: "five_hour", resetsAt: FIVE_RESET }], atRest())} line="" shown />);
    const ring = screen.getByRole("img", { name: /The Claude 5 hour limit is 85% used/ });
    expect(ring.getAttribute("data-level")).toBe("near");
  });
});

describe("Home's warning with the real plan reading", () => {
  const PROMPT = "Add a contact form to the home page.";
  async function handOffReady() {
    await renderHome({ answers: { ai_tools_find: { apps: [], programs: ["claude"], folders: [] } } });
    await type(screen.getAllByRole("textbox")[0]!, "add a contact form");
    await press("Have my AI do it");
    const req = (app.invoked("handoff_prompt")[0]!.args as { req: string }).req;
    await runner({ type: "assist.prompt.done", req, text: PROMPT, diff: [["=", PROMPT]], usdEstimate: 0, handback: "paste" });
  }
  test("46% of the week: Run it starts at once, no warning", async () => {
    app.reset();
    await handOffReady();
    await runner(real);
    await press("Run it");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(app.sent().filter((c) => c.type === "agent.start").length).toBe(1);
  });
  test("85% of the week, still allowed: Run it asks first, naming the week", async () => {
    app.reset();
    await handOffReady();
    await runner({ ...real, usedPct: 85 });
    await press("Run it");
    expect(screen.getByRole("alertdialog", { name: S.m91.warnTitle("week") })).toBeTruthy();
    expect(app.sent().filter((c) => c.type === "agent.start").length).toBe(0);
  });
});

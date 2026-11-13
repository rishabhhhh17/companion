// M84 review: the tall Home (look.layout tall, no side list).
import { describe, expect, test } from "bun:test";
import { PROJECT, act, renderHome, runner, settle } from "./render.tsx";
import { _resetForTests, startSettings } from "../src/settingsStore.ts";

// Settings are read as a page starts: card.tsx starts them as it is first imported, which can be before this test's
// answers are in place, so they are read again here, as a fresh page would, once the answers are set.
const tall = async () => { await renderHome({ settings: { "look.layout": "tall" } }); await act(async () => { _resetForTests(); startSettings(); }); await settle(); };
const tools = (on: boolean) => ({ type: "donesignal.state", project: PROJECT, tools: [...["done", "guard", "waiting"].map((hook) => ({ tool: "claude", hook, on, file: "x", adds: "y", creates: false })), ...["done", "guard"].map((hook) => ({ tool: "cursor", hook, on, file: "x", adds: "y", creates: false }))] });

describe("M84: the tall Home", () => {
  test("the tall Home has no side list, so its strip still says the AI tools", async () => {
    await tall();
    await runner({ type: "tasks.list", project: PROJECT, tasks: [] }, tools(true));
    expect(document.querySelector(".home")?.getAttribute("data-layout")).toBe("tall");
    expect(document.querySelector(".side-tool")).toBeNull();
    expect(document.querySelector('.now-strip [data-fact="tools"]')).not.toBeNull();
  });

  test("the tall Home draws no empty lead wrapper where today's line has nothing to say (Now, not at rest)", async () => {
    // M84 review: an empty div.view-lead was drawn whenever today's line returned nothing, adding a gap.
    await tall();
    await runner({ type: "tasks.list", project: PROJECT, tasks: [] }, tools(true),
      { type: "review.batch", project: PROJECT, batch: "rv_4f2a9c01de", files: [{ file: "src/a.ts", kind: "modified" }], count: 1, capped: false, secretFiles: [], auto: false });
    expect(document.querySelector(".home")?.getAttribute("data-layout")).toBe("tall");
    expect(document.querySelector(".today")).toBeNull();
    for (const lead of document.querySelectorAll(".view-lead")) expect(lead.childElementCount, lead.outerHTML.slice(0, 80)).toBeGreaterThan(0);
  });
});

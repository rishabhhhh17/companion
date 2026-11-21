// M107, Put it in on the review card (docs/milestones/M107-put-it-in.md), rendered and pressed. Beside Copy for my AI, for
// the tool that finished (or the one last picked here); never for a terminal tool; the text is exactly the send back text;
// the shell's answer is said in plain words, and a copy instead offers Show me where to paste. Nothing goes to the engine.
import { describe, expect, test } from "bun:test";
import { PROJECT, app, hasButton, press, renderHome, runner, screen, settle } from "./render.tsx";
import { S } from "../src/strings.ts";

const B = "rv_7c1d2e3f4a";
const SEND = "The review found a key written into src/pay.ts at line 2. Please move it into an environment variable.";
const batch = (by?: string) => ({ type: "review.batch", project: PROJECT, batch: B, files: [{ file: "src/pay.ts", kind: "modified" }], count: 1, capped: false, secretFiles: [], auto: true, ...(by ? { by } : {}) });
const result = (by?: string, sendBack = SEND) => ({ type: "review.result", project: PROJECT, batch: B, ok: true, rating: "worth_a_look", touches: ["payments"], summary: "The payment page now starts a checkout.", notes: [],
  reasons: [{ kind: "checks_failed", say: "The project's own checks did not pass." }], files: [{ file: "src/pay.ts", kind: "modified" }], count: 1, capped: false, secretFiles: [], checks: "failed", sendBack, lane: "none", usdEstimate: 0, ...(by ? { by } : {}) });
const puts = () => app.invoked("handoff_put_in").map((c) => c.args as { tool: string; text: string; looking: string });
const last = (t: string | null) => { try { if (t) localStorage.setItem(`companion.handoffTool:${PROJECT}`, t); else localStorage.removeItem(`companion.handoffTool:${PROJECT}`); } catch { /* storage may be unavailable */ } };

describe("Put it in on the review card", () => {
  test("Cursor finished: Put it in Cursor sits beside Copy for my AI, and the press passes exactly the send back text", async () => {
    last(null);
    await renderHome({ answers: { handoff_put_in: "typed" } });
    await runner(batch("cursor"), result("cursor"));
    expect(hasButton(S.review.sendBack)).toBe(true);
    expect(hasButton(S.m82.putIn("Cursor"))).toBe(true);
    expect(puts()).toEqual([]);
    await press(S.m82.putIn("Cursor"));
    expect(puts()).toEqual([{ tool: "cursor", text: SEND, looking: S.m82.putting("Cursor") }]);
    await settle(40);
    expect(screen.getByText(S.review.put.typed("Cursor"))).toBeTruthy();
    // Nothing is ever sent to the engine by this press: the person's own tool does the work, and they press send.
    expect(app.sent().filter((c) => c.type === "agent.start")).toEqual([]);
  });

  test("a terminal tool finished: no Put it in, even when Cursor was picked here before; Copy for my AI stays", async () => {
    for (const by of ["claude", "codex", "gemini"]) {
      last("cursor");
      await renderHome({ answers: { handoff_put_in: "typed" } });
      await runner(batch(by), result(by));
      expect(hasButton(S.review.sendBack)).toBe(true);
      expect(hasButton(S.m82.putIn("Cursor"))).toBe(false);
      expect(screen.queryAllByRole("button").some((b) => (b.textContent ?? "").startsWith("Put it in"))).toBe(false);
    }
    expect(puts()).toEqual([]);
  });

  test("no done signal: the tool last picked in this project, here Windsurf", async () => {
    last("windsurf");
    await renderHome({ answers: { handoff_put_in: "typed" } });
    await runner(batch(), result());
    expect(hasButton(S.m82.putIn("Windsurf"))).toBe(true);
  });

  test("the chat box was not found: the text is copied, said why, and Show me where to paste is offered", async () => {
    last(null);
    await renderHome({ answers: { handoff_put_in: "noBox" } });
    await runner(batch("copilot"), result("copilot"));
    await press(S.m82.putIn("VS Code (Copilot)"));
    await settle(40);
    expect(screen.getByText(S.review.put.noBox("VS Code (Copilot)"))).toBeTruthy();
    expect(hasButton(S.pasteHere.button)).toBe(true);
  });

  test("the shell refused the press: the page copies the text itself and says so", async () => {
    last(null);
    await renderHome();
    app.refuse("handoff_put_in", "not_card");
    await runner(batch("antigravity"), result("antigravity"));
    await press(S.m82.putIn("Antigravity"));
    await settle(40);
    expect(screen.getByText(S.review.put.failed("Antigravity"))).toBeTruthy();
    expect(app.invoked("copy_text").map((c) => (c.args as { text: string }).text)).toContain(SEND);
  });

  test("Stop everything during the press: nothing put in, said so, and no Show me where to paste", async () => {
    last(null);
    await renderHome({ answers: { handoff_put_in: "stopped" } });
    await runner(batch("cursor"), result("cursor"));
    await press(S.m82.putIn("Cursor"));
    await settle(40);
    expect(screen.getByText(S.review.put.stopped("Cursor"))).toBeTruthy();
    expect(hasButton(S.pasteHere.button)).toBe(false);
  });

  test("M107 review: once it is typed, a second press does not type the fix request again", async () => {
    last(null);
    await renderHome({ answers: { handoff_put_in: "typed" } });
    await runner(batch("cursor"), result("cursor"));
    await press(S.m82.putIn("Cursor"));
    await settle(40);
    expect(puts().length).toBe(1);
    const done = screen.getByRole("button", { name: S.review.putInDone("Cursor") });
    expect(done.getAttribute("aria-disabled")).toBe("true");
    done.click();
    await settle(40);
    done.click();
    await settle(40);
    expect(puts().length).toBe(1);
  });

  test("M107 review: when it was copied instead, the press stays live so the person can try again", async () => {
    last(null);
    await renderHome({ answers: { handoff_put_in: "notOpen" } });
    await runner(batch("cursor"), result("cursor"));
    await press(S.m82.putIn("Cursor"));
    await settle(40);
    await press(S.m82.putIn("Cursor"));
    await settle(40);
    expect(puts().length).toBe(2);
  });

  test("M107 review: the answer line comes after Walk me through it, never between two rows of presses", async () => {
    last(null);
    await renderHome({ answers: { handoff_put_in: "typed" } });
    await runner(batch("cursor"), result("cursor"));
    await press(S.m82.putIn("Cursor"));
    await settle(40);
    const line = screen.getByText(S.review.put.typed("Cursor"));
    const walk = document.querySelector(".rv-walk");
    expect(walk).toBeTruthy();
    // The line follows the walk row in the page's order (and so on screen and for a screen reader).
    expect(walk!.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(line.closest(".result-actions")).toBeNull();
  });
});

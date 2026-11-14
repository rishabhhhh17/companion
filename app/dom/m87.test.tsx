// M87: Why is live broken?, rendered on Home. The button sits in Go live (the Ready to go live? panel, where it reads Check
// my live setup since nothing may be live yet, and in the live site's panel as Why is live broken?); its press is the
// only thing that sends ship.whyLive; the panel fills in part by part; the live address box sends a typed address; Copy
// for my AI copies the message; Close closes it. The engine's answers are the protocol fixtures (m87e1-3).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { S } from "../src/strings.ts";
import { act, fireEvent, within } from "@testing-library/react";
import { app, PROJECT, press, renderHome, runner, screen, type } from "./render.tsx";

const fixture = (id: string) => ({ ...JSON.parse(readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").find((l) => l.includes(`"id":"${id}"`))!), project: PROJECT });
const GATES = { type: "ship.gates", project: PROJECT, canShip: true, gates: [{ id: "checked", label: "The work was checked", status: "passed", detail: "The checks passed on this exact version." }], blockedBy: [], needsYou: [], confirmed: [], allowedCount: 0 };
/** Presses a button inside one panel (Home has more than one Close). */
async function pressIn(region: HTMLElement, name: string) {
  const b = within(region).getByRole("button", { name });
  await act(async () => { fireEvent.click(b); await new Promise((r) => setTimeout(r, 60)); });
}
const whyLiveSent = () => app.sent().filter((c) => c?.type === "ship.whyLive");

describe("Why is live broken? on Home", () => {
  test("nothing runs until the press; then the panel fills in, and Copy for my AI copies the message", async () => {
    app.reset();
    await renderHome();
    await runner(GATES);
    expect(screen.getByRole("region", { name: S.shipTitle })).toBeTruthy();
    expect(whyLiveSent()).toEqual([]);
    await press(S.whyLive.askBefore);
    expect(whyLiveSent()).toEqual([expect.objectContaining({ type: "ship.whyLive", project: PROJECT })]);
    expect(whyLiveSent()[0].url).toBeUndefined();
    const panel = () => screen.getByRole("region", { name: S.whyLive.titleBefore });
    expect(panel().textContent).toContain(S.whyLive.running);
    // While it runs, the button is not offered again.
    expect(screen.queryAllByRole("button", { name: S.whyLive.askBefore }).length).toBe(0);
    await runner(fixture("m87e1"));
    expect(panel().querySelector('[data-part="env"]')!.getAttribute("data-state")).toBe("problem");
    expect(panel().querySelector('[data-part="stripe"]')!.getAttribute("data-state")).toBe("waiting");
    await runner(fixture("m87e2"));
    expect(panel().textContent).toContain(S.whyLive.problems(2));
    expect(panel().textContent).toContain("/dashboard");
    await press(S.whyLive.copy);
    const copied = String(app.invoked("copy_text").at(-1)?.args?.text ?? "");
    expect(copied.split("\n")[0]).toBe(S.whyLive.copyHead("shop"));
    expect(copied).toContain(S.whyLive.parts.stripe);
    expect(copied).toContain(S.whyLive.copyAsk);
    await pressIn(panel(), S.whyLive.close);
    expect(screen.queryByRole("region", { name: S.whyLive.titleBefore })).toBeNull();
  });
  test("with no live address known, the person types one and only a plain https address is sent", async () => {
    app.reset();
    await renderHome();
    await runner(GATES);
    await press(S.whyLive.askBefore);
    await runner({ type: "ship.whyLive", project: PROJECT, stage: "done", parts: [{ id: "env", state: "skipped", why: "no_cli" }, { id: "stripe", state: "skipped", why: "not_used" }, { id: "pages", state: "skipped", why: "no_address", names: ["/dashboard"] }, { id: "database", state: "skipped", why: "not_used" }] });
    expect(screen.getByText(/npm install -g vercel/)).toBeTruthy();
    const box = screen.getByLabelText(S.whyLive.addressLabel);
    await type(box, "shop.example.com");
    await press(S.whyLive.addressCheck);
    expect(screen.getByRole("alert").textContent).toBe(S.whyLive.addressBad);
    expect(whyLiveSent().length).toBe(1);
    await type(box, "https://shop.example.com/dashboard");
    await press(S.whyLive.addressCheck);
    expect(whyLiveSent().at(-1)).toMatchObject({ type: "ship.whyLive", project: PROJECT, url: "https://shop.example.com" });
  });
  test("Stop everything ends it on the page too", async () => {
    app.reset();
    await renderHome();
    await runner(GATES);
    await press(S.whyLive.askBefore);
    await runner(fixture("m87e1"));
    await runner({ type: "app.stop_everything" });
    const panel = screen.getByRole("region", { name: S.whyLive.titleBefore });
    expect(panel.textContent).toContain(S.whyLive.stopped);
    expect(panel.textContent).not.toContain(S.whyLive.running);
  });
  test("M87 review: the panel opens right below the button pressed, and its heading takes the focus", async () => {
    app.reset();
    await renderHome();
    await runner(GATES);
    await press(S.whyLive.askBefore);
    const gates = screen.getByRole("region", { name: S.shipTitle });
    const panel = screen.getByRole("region", { name: S.whyLive.titleBefore });
    // Right after the panel that held the button, not above it.
    expect(gates.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(gates.nextElementSibling).toBe(panel);
    expect(document.activeElement).toBe(panel.querySelector("h2"));
  });
  test("M87 review: on the live site's panel it reads Why is live broken?, and its answer opens below that panel", async () => {
    app.reset();
    await renderHome();
    await runner({ type: "ship.status", project: PROJECT, stage: "live", detail: "It is live.", productionUrl: "https://shop.example.com" });
    const online = screen.getByRole("status", { name: S.onlineTitle });
    expect(screen.queryAllByRole("button", { name: S.whyLive.askBefore }).length).toBe(0);
    await press(S.whyLive.ask);
    const panel = screen.getByRole("region", { name: S.whyLive.title });
    expect(online.nextElementSibling).toBe(panel);
  });
  test("M87 review: Close is there while it runs, and a helper restart ends the wait", async () => {
    app.reset();
    await renderHome();
    await runner(GATES);
    await press(S.whyLive.askBefore);
    const panel = () => screen.getByRole("region", { name: S.whyLive.titleBefore });
    expect(panel().textContent).toContain(S.whyLive.running);
    expect(within(panel()).getByRole("button", { name: S.whyLive.close })).toBeTruthy();
    await runner({ type: "app.runner_restarted" });
    expect(panel().textContent).toContain(S.whyLive.interrupted);
    expect(panel().getAttribute("aria-busy")).toBe("false");
    // A late answer from the old helper is not taken.
    await runner(fixture("m87e2"));
    expect(panel().textContent).toContain(S.whyLive.interrupted);
    await pressIn(panel(), S.whyLive.close);
    expect(screen.queryByRole("region", { name: S.whyLive.titleBefore })).toBeNull();
  });
  test("M87 review: an engine with no tools for it answers with a reason, and the page words it", async () => {
    app.reset();
    await renderHome();
    await runner(GATES);
    await press(S.whyLive.askBefore);
    await runner(fixture("m87e4"));
    expect(screen.getByRole("region", { name: S.whyLive.titleBefore }).textContent).toContain(S.whyLive.notSetUp);
  });
});

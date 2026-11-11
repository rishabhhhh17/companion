// M59: one helper that renders a page with the stand in app (setup.ts), as a person who has used Squibby before would
// see it: signed in with a key, a project folder chosen, Claude ready. Each test changes only what its flow needs.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { app } from "./setup.ts";

export { app };
export const PROJECT = "/Users/me/shop";

let n = 0;
const id = () => `t${++n}`;
/** One runner event, as the shell passes it on (runner-event). */
export const ev = (o: Record<string, unknown>) => ({ v: 1, id: id(), ...o });

/** Fires app events at the page, inside act, and lets the frame batch (useModel, 50 ms) and React settle. */
export async function emit(event: string, payload: unknown) {
  await act(async () => { app.fire(event, payload); await new Promise((r) => setTimeout(r, 70)); });
}
/** Fires runner events, in order. */
export async function runner(...events: Record<string, unknown>[]) {
  for (const e of events) await emit("runner-event", ev(e));
}
/** Lets pending promises, timers up to `ms` and React updates finish. */
export async function settle(ms = 30) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }

export type Setup = { project?: string; onboarded?: boolean; settings?: Record<string, unknown>; claude?: string; answers?: Record<string, unknown> };

/** The usual answers of a returning person's app. */
export function returning(o: Setup = {}) {
  const project = o.project ?? PROJECT;
  try { if (o.onboarded !== false) localStorage.setItem("companion.onboarded", "1"); else localStorage.removeItem("companion.onboarded"); } catch { /* storage may be unavailable */ }
  app.answer("get_project", project);
  app.answer("list_projects", project ? [project] : []);
  app.answer("claude_status", { state: o.claude ?? "ready" });
  app.answer("replay_events", [ev({ type: "runner.hello", runnerVersion: "0.0.1", sdk: "test" }), ev({ type: "auth.status", method: "api_key", source: "keychain" })]);
  app.answer("settings_get", { values: o.settings ?? {}, usual: {}, project, migrated: ["pageStorage.v1"], problems: [], changed: [] });
  for (const [k, v] of Object.entries(o.answers ?? {})) app.answer(k, v);
}

/** Renders a page (a component) with the stand in app and waits for its first commands to be answered. */
export async function renderPage(ui: ReactElement, o: Setup = {}) {
  returning(o);
  let r!: ReturnType<typeof render>;
  await act(async () => { r = render(ui); await new Promise((res) => setTimeout(res, 80)); });
  return r;
}

/** Home (card.tsx), the main page. */
export async function renderHome(o: Setup = {}) {
  const { Card } = await import("../src/card.tsx");
  return renderPage(<Card />, o);
}

/** Presses the first button with this accessible name, as a person would, and lets the page answer. */
export async function press(name: string | RegExp, ms = 60) {
  const b = screen.getAllByRole("button", { name })[0];
  await act(async () => { fireEvent.click(b); await new Promise((r) => setTimeout(r, ms)); });
  return b;
}
/** Types into a text box (fires the change React listens to). */
export async function type(el: HTMLElement, value: string) {
  await act(async () => { fireEvent.change(el, { target: { value } }); await new Promise((r) => setTimeout(r, 20)); });
}
/** The accessible names of every button on the page now. */
export const buttons = (): string[] => screen.queryAllByRole("button").map((b) => b.getAttribute("aria-label") || b.textContent || "");
export const hasButton = (name: string): boolean => buttons().includes(name);

export { act, fireEvent, screen, waitFor, within };

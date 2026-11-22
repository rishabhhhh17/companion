// M117, rendered: the Money and fines part in the check before going live, with the panel's existing rows, marks and
// buttons. Copy for my AI copies only; I set this up outside the code saves one memory line once and says it could not be
// seen; Check again asks for the check again. Every row and button has its own name for VoiceOver. The worst case (a long
// path, many findings, non Latin file names, every service at once) still draws, and nothing moves.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { MONEY_SERVICES, type MoneyReport } from "../../protocol/index.ts";
import { S } from "../src/strings.ts";
import { act, app, fireEvent, PROJECT, renderHome, runner, screen, within } from "./render.tsx";

const fx = (id: string) => ({ ...JSON.parse(readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").find((l) => l.includes(`"id":"${id}"`))!), project: PROJECT });
const part = () => screen.getByRole("group", { name: S.money.title });
async function pressIn(region: HTMLElement, name: string) {
  const b = within(region).getByRole("button", { name });
  await act(async () => { fireEvent.click(b); await new Promise((r) => setTimeout(r, 60)); });
}

describe("Money and fines in the check before going live", () => {
  test("the part draws under the gates with its family headings, marks and buttons; Put it online is still offered", async () => {
    app.reset();
    await renderHome();
    await runner(fx("m117e1"));
    const panel = screen.getByRole("region", { name: S.shipTitle });
    const p = within(panel).getByRole("group", { name: S.money.title });
    for (const fam of ["rate", "abuse", "spend", "fines"]) expect(p.textContent).toContain(S.money.family[fam]);
    expect(p.textContent).toContain(S.money.head.ai);
    expect(p.textContent).toContain(S.money.about);
    expect(p.textContent).toContain(S.money.told);
    expect(p.textContent).not.toContain(S.goLive.mark.ok);
    // Never a gate: the panel still offers Put it online.
    expect(within(panel).getAllByRole("button", { name: S.going.putOnline }).length).toBeGreaterThan(0);
    // Each row is named by its mark and head; each Copy for my AI by its row.
    expect(within(p).getByRole("group", { name: `${S.goLive.mark.look}: ${S.money.head.ai}` })).toBeTruthy();
    expect(within(p).getAllByRole("button", { name: `${S.money.copyForAi}: ${S.money.head.ai}` }).length).toBe(1);
  });
  test("Copy for my AI copies the fixed words with the place quoted; Copy this list copies the services", async () => {
    app.reset();
    await renderHome();
    await runner(fx("m117e1"));
    await pressIn(part(), `${S.money.copyForAi}: ${S.money.head.ai}`);
    const copied = String(app.invoked("copy_text").at(-1)?.args?.text ?? "");
    expect(copied.split("\n")[0]).toBe(S.money.copy.rate);
    expect(copied).toContain("> app/api/chat/route.ts, line 4, POST /api/chat, calls OpenAI");
    await pressIn(part(), `${S.money.copyList}: ${S.money.listTitle}`);
    expect(String(app.invoked("copy_text").at(-1)?.args?.text ?? "")).toContain(S.money.listTitle);
  });
  test("I set this up outside the code saves one memory line, once, and says it could not be seen", async () => {
    app.reset();
    await renderHome();
    await runner(fx("m117e1"));
    const name = `${S.money.toldButton}: ${S.money.head.ai}`;
    await pressIn(part(), name);
    const sent = app.sent().filter((c) => c?.type === "memory.add");
    expect(sent).toEqual([expect.objectContaining({ type: "memory.add", project: PROJECT, scope: "project", text: "Rate limit for app/api/chat/route.ts is set up outside the code (you told me).", source: S.money.toldSource })]);
    expect(part().textContent).toContain(S.money.toldSaved);
    expect(within(part()).queryAllByRole("button", { name })).toHaveLength(0);
  });
  test("Check again asks for the check before going live again, without running the project's checks", async () => {
    app.reset();
    await renderHome();
    await runner(fx("m117e1"));
    await pressIn(part(), `${S.money.checkAgain}: ${S.money.title}`);
    const c = app.sent().filter((x) => x?.type === "ship.check").at(-1);
    expect(c).toMatchObject({ type: "ship.check", project: PROJECT });
    expect(c?.runChecks).toBeFalsy();
  });
  test("off in Settings says so", async () => {
    app.reset();
    await renderHome();
    await runner(fx("m117e2"));
    expect(part().textContent).toContain(S.money.off);
  });
  test("the worst case still draws: a 200 character path, 50 findings, Japanese file names, every service", async () => {
    app.reset();
    await renderHome();
    const long = `app/${"very-long-folder/".repeat(11)}route.ts`.slice(0, 200);
    const findings = Array.from({ length: 50 }, (_, i) => (i % 3 === 0
      ? { kind: "paid_route_open", file: i === 0 ? long : `app/api/日本語${i}/route.ts`, line: i + 1, method: "POST", path: `/api/日本語${i}`.replace(/[^\x00-\x7f]/g, "x"), framework: "next_app", services: ["openai"] }
      : i % 3 === 1 ? { kind: "form_open", file: `app/フォーム${i}/page.tsx`, line: 3, form: "contact" } : { kind: "tracker_no_consent", file: `app/l${i}.tsx`, line: 1, trackers: ["google_analytics", "meta_pixel", "hotjar"] }));
    const money: MoneyReport = { findings: findings as never, paid: MONEY_SERVICES.slice(0, 30).map((service, i) => ({ service, file: `lib/サービス${i}.ts`, line: 1 })), unsure: [], seen: [], accounts: true, emails: true };
    await runner({ ...fx("m117e1"), money });
    const p = part();
    expect(p.textContent).toContain(long);
    expect(p.textContent).toContain("日本語3");
    expect(within(p).getAllByRole("button", { name: new RegExp(`^${S.money.copyForAi}: `) }).length).toBe(50);
    // No new motion: the part adds no animation of its own.
    expect(p.outerHTML).not.toMatch(/animation|transition/);
  });
});

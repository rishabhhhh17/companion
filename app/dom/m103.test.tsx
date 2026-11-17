// M103: a read of saved logins in the person's own AI tool, rendered: Now's notice for the open project, and History's rows
// with what happened and the reason under each. The command is drawn in code type and the row offers no button.
import { describe, expect, test } from "bun:test";
import { PROJECT, press, renderHome, runner, screen } from "./render.tsx";
import { S } from "../src/strings.ts";

const KEY = "security find-generic-password -s jules-cli -w";
const REASON = "This reads saved passwords from your Mac's Keychain. If you did not ask for that, your AI tool may be following hidden instructions.";
const at = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

describe("saved logins", () => {
  test("Now says it for the open project, with the tool, the reason and the next step on the notice itself", async () => {
    await renderHome();
    await runner({ type: "guard.asked", project: PROJECT, command: KEY, reason: REASON, kind: "login", outcome: "ran", tool: "codex" });
    const n = document.querySelector(".notice[data-kind='login']")!;
    expect(n).not.toBeNull();
    expect(n.querySelector("b")!.textContent).toBe(S.guard.login.notice.ran("Codex"));
    expect(n.querySelector("code")!.textContent).toBe(KEY);
    // The review: the why is right here, never only in History.
    expect(n.textContent).toContain(REASON);
    expect(n.textContent).toContain(S.guard.login.next.ran("Codex"));
  });

  test("See in History opens History at that row", async () => {
    await renderHome();
    await runner({ type: "guard.asked", project: PROJECT, command: KEY, reason: REASON, kind: "login", outcome: "asked", tool: "claude" });
    await runner({ type: "tasks.list", project: PROJECT, tasks: [], asked: [
      { id: 7, at: at(0), command: KEY, reason: REASON, by: "tool", kind: "login", outcome: "asked", tool: "claude" },
      { id: 6, at: at(5), command: "~/.netrc", reason: REASON, by: "tool", kind: "login", outcome: "ran" },
    ] });
    await press(S.guard.login.seeInHistory);
    const row = document.getElementById("asked-7")!;
    expect(row).not.toBeNull();
    expect(row.getAttribute("data-flash")).toBe("true");
    expect(document.getElementById("asked-6")!.getAttribute("data-flash")).toBeNull();
    expect(row.textContent).toContain("Claude Code");
  });

  test("History shows each with what happened and why, and no button to press", async () => {
    await renderHome();
    await press("History");
    await runner({ type: "tasks.list", project: PROJECT, tasks: [], asked: [
      { id: 1, at: at(3), command: "cat ~/.aws/credentials", reason: REASON.replace("saved passwords from your Mac's Keychain", "~/.aws/credentials, a file of saved logins or keys"), by: "tool", kind: "login", outcome: "ran" },
      { id: 2, at: at(2), command: KEY, reason: REASON, by: "tool", kind: "login", outcome: "asked" },
      { id: 3, at: at(1), command: "~/.netrc", reason: REASON.replace("saved passwords from your Mac's Keychain", "~/.netrc, a file of saved logins or keys"), by: "tool", kind: "login", outcome: "blocked" },
    ] });
    const rows = screen.getAllByText(S.guard.login.lead, { exact: false }).map((n) => n.closest("li")!);
    expect(rows.length).toBe(3);
    const text = rows.map((r) => r.textContent ?? "");
    expect(text[0]).toContain(S.guard.login.mark.blocked);
    expect(text[1]).toContain(S.guard.login.mark.asked);
    expect(text[2]).toContain(S.guard.login.mark.ran);
    expect(text[1]).toContain("Keychain");
    for (const r of rows) {
      expect(r.querySelector("code.hist-cmd")).not.toBeNull();
      expect(r.querySelector("button")).toBeNull();
    }
    // The review: the mark is in the row's own colour, so Stopped and Let through read apart without the icon.
    expect(rows.map((r) => r.querySelector(".ui-mrow-fact")!.getAttribute("data-c"))).toEqual(["red", "blue", "orange"]);
  });
});

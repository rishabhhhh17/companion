// M103: the pages' side of catching agents reaching for saved logins: the notch line, Now's notice, History's row, Today's
// line and the setting. Pure, no engine.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { islandLine, SAVED_LINE_MS } from "./home.ts";
import { askedLineOf, askedNoticeOf, askedNoticeParts, initial, reduce } from "./model.ts";
import { doneAsk } from "./doneSignal.ts";
import { todayLine } from "./notchPeek.ts";
import { askedRowLook, askedRowsOf } from "./safetyNet.ts";
import { S } from "./strings.ts";

const KEY = "security find-generic-password -s jules-cli -w";
const REASON = "This reads saved passwords from your Mac's Keychain. If you did not ask for that, your AI tool may be following hidden instructions.";
const login = (project: string, outcome: string, command = KEY, tool?: string) => ({ v: 1, id: "e", type: "guard.asked", project, command, reason: REASON, kind: "login", outcome, ...(tool ? { tool } : {}) }) as never;

describe("the model", () => {
  test("a login note keeps what happened, and Now's notice says it in its own words, only for the open project", () => {
    const here = { ...initial(), folder: "/p" };
    for (const outcome of ["asked", "ran", "blocked"] as const) {
      const m = reduce(here, login("/p", outcome));
      expect(m.guardAsked).toMatchObject({ project: "/p", command: KEY, login: outcome });
      // The M103 review: the reason is on the notice itself, with the next step, never only in History.
      expect(m.notice).toBe(`${S.guard.login.notice[outcome]()} ${KEY}. ${REASON} ${S.guard.login.next[outcome]()}`);
      expect(askedNoticeOf(m.guardAsked!)).toBe(m.notice!);
      expect(reduce(here, login("/elsewhere", outcome)).notice).toBeNull();
    }
    // A live system ask is unchanged.
    const live = reduce(here, { v: 1, id: "e", type: "guard.asked", project: "/p", command: "vercel --prod", reason: "r" } as never);
    expect(live.guardAsked?.login).toBeUndefined();
    expect(live.notice).toBe(S.guard.askedNotice("vercel --prod"));
  });
  test("an unknown kind or outcome is read as a plain ask, never as a login note it is not", () => {
    const m = reduce({ ...initial(), folder: "/p" }, { v: 1, id: "e", type: "guard.asked", project: "/p", command: KEY, reason: "r", kind: "login", outcome: "maybe" } as never);
    expect(m.guardAsked?.login).toBeUndefined();
  });
  test("the notch says it for a few seconds (any project); something that needs the person in Squibby comes first", () => {
    for (const outcome of ["asked", "ran", "blocked"] as const) {
      const m = reduce(initial(), login("/elsewhere", outcome));
      const at = m.guardAsked!.at;
      expect(islandLine(m, { now: at + 1000 })).toBe(S.guard.login.line[outcome]());
      expect(islandLine(m, { now: at + SAVED_LINE_MS + 1 })).not.toBe(S.guard.login.line[outcome]());
    }
    const m = reduce(initial(), login("/elsewhere", "ran"));
    const withCard = reduce(m, { v: 1, id: "e", type: "approval.request", approval: "ap_1", agent: "builder-1", checkpoint: "cp_1", toolUseId: "t", risk: "irreversible", title: "Delete it", expiresAt: "2099-01-01T00:00:00Z" } as never);
    expect(islandLine(withCard, { now: m.guardAsked!.at + 1000 })).not.toBe(S.guard.login.line.ran());
  });
  test("the review: the notice and the notch line name the AI tool when its hook says which", () => {
    const m = reduce({ ...initial(), folder: "/p" }, login("/p", "ran", "cat ~/.aws/credentials", "codex"));
    expect(m.guardAsked).toMatchObject({ tool: "codex", reason: REASON });
    expect(m.notice!.startsWith("Codex was let through to read saved logins: cat ~/.aws/credentials.")).toBe(true);
    expect(askedLineOf(m.guardAsked!)).toBe("Codex went for saved logins. See History.");
    const asked = reduce({ ...initial(), folder: "/p" }, login("/p", "asked", KEY, "claude"));
    expect(asked.notice).toContain("Answer it in Claude Code.");
    // An unknown tool is never named.
    const odd = reduce({ ...initial(), folder: "/p" }, login("/p", "asked", KEY, "evil"));
    expect(odd.guardAsked?.tool).toBeUndefined();
    expect(odd.notice!.startsWith("Your AI tool wants")).toBe(true);
    // The live ask of M85 names it too.
    const live = reduce({ ...initial(), folder: "/p" }, { v: 1, id: "e", type: "guard.asked", project: "/p", command: "vercel --prod", reason: "r", tool: "cursor" } as never);
    expect(live.notice!.startsWith("Cursor asked you first")).toBe(true);
  });
  test("the review: the notice's parts are what the page draws, and say only what is known", () => {
    const parts = askedNoticeParts({ command: KEY, login: "ran", reason: REASON, tool: "gemini" })!;
    expect(parts).toEqual({ lead: S.guard.login.notice.ran("Gemini CLI"), command: KEY, reason: REASON, next: S.guard.login.next.ran("Gemini CLI") });
    expect(askedNoticeParts({ command: "vercel --prod" })).toBeNull();
    // Never "read" as a fact: the hook fires before the tool runs.
    for (const w of [S.guard.login.notice.ran(), S.guard.login.line.ran(), S.guard.login.mark.ran, S.guard.login.today.ran("x")]) expect(w).not.toMatch(/\bread saved logins\.|\bIt ran\b|^Read saved logins/);
  });
});

describe("History and Today", () => {
  const rows = [
    { id: 1, at: "2026-11-17T10:00:00Z", command: "cat ~/.aws/credentials", reason: "r", by: "tool", kind: "login", outcome: "ran" },
    { id: 2, at: "2026-11-17T10:01:00Z", command: KEY, reason: "r", by: "tool", kind: "login", outcome: "asked" },
    { id: 3, at: "2026-11-17T10:02:00Z", command: "~/.netrc", reason: "r", by: "tool", kind: "login", outcome: "blocked" },
    { id: 4, at: "2026-11-17T10:03:00Z", command: "~/.netrc", reason: "r", by: "tool", kind: "login", outcome: "maybe" },
    { id: 5, at: "2026-11-17T10:04:00Z", command: "~/.netrc", reason: "r", by: "tool", outcome: "ran" },
  ];
  test("the page keeps a login row only of the known shape", () => {
    const kept = askedRowsOf(rows);
    expect(kept.map((r) => [r.id, r.kind, r.outcome])).toEqual([[1, "login", "ran"], [2, "login", "asked"], [3, "login", "blocked"], [4, undefined, undefined], [5, undefined, undefined]]);
  });
  test("the review: a row keeps a known AI tool, and its look names it", () => {
    const kept = askedRowsOf([{ ...rows[0], tool: "codex" }, { ...rows[1], tool: "evil" }]);
    expect(kept.map((r) => r.tool)).toEqual(["codex", undefined]);
    expect(askedRowLook(kept[0]).who).toBe("Codex");
    expect(askedRowLook(kept[1]).who).toBeNull();
  });
  test("each row says what happened in plain words, in its meaning's colour", () => {
    const [ran, asked, blocked] = askedRowsOf(rows).map(askedRowLook);
    expect(ran).toMatchObject({ lead: S.guard.login.lead, mark: S.guard.login.mark.ran, tone: "orange" });
    // The review: the M85 row from the person's own tool has the same short mark.
    expect(askedRowLook({ id: 9, at: "2026-11-17T10:00:00Z", command: "vercel --prod", reason: "r", by: "tool" }).mark).toBe(S.guard.login.mark.asked);
    expect(asked).toMatchObject({ lead: S.guard.login.lead, mark: S.guard.login.mark.asked, tone: "blue" });
    expect(blocked).toMatchObject({ lead: S.guard.login.lead, mark: S.guard.login.mark.blocked, tone: "red" });
    expect(`${ran.lead} ${ran.command}`).toBe(ran.title);
  });
  test("Today names a login read as one", () => {
    const now = Date.parse("2026-11-17T12:00:00Z");
    const m = reduce({ ...initial(), folder: "/p" }, { v: 1, id: "e", type: "tasks.list", project: "/p", tasks: [], asked: rows.slice(0, 3) } as never);
    const t = todayLine(m, now);
    expect(t.map((x) => x.words)).toEqual([S.guard.login.today.blocked("~/.netrc"), S.guard.login.today.asked(KEY), S.guard.login.today.ran("cat ~/.aws/credentials")]);
  });
  test("the shared fixture's rows are kept as they are", () => {
    const line = readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").find((l) => l.includes('"id":"m103e4"'))!;
    expect(askedRowsOf(JSON.parse(line).asked).map((r) => r.outcome)).toEqual(["ran", "asked", "blocked"]);
  });
});

describe("the words and the setting", () => {
  test("plain words, no em dashes, and never the word password in a line a passer by could read on the notch", () => {
    const os = ["asked", "ran", "blocked"] as const;
    const lines = os.flatMap((o) => [S.guard.login.line[o](), S.guard.login.line[o]("Codex")]);
    const all = [...lines, ...Object.values(S.guard.login.mark), S.guard.login.lead, S.guard.login.seeInHistory, ...os.flatMap((o) => [S.guard.login.notice[o](), S.guard.login.next[o]("Codex")])];
    for (const w of all) expect(w).not.toContain("—");
    for (const w of lines) expect(w.toLowerCase()).not.toContain("password");
  });
  test("the setting is one press away on Privacy, with a word for each choice, and search finds it", async () => {
    // The M103 review (changed on purpose): it was under More options, How fixes run; it is about your own AI tools.
    const { mainKeys, PAGES } = await import("./settingsPages.ts");
    expect(mainKeys("privacy")).toContain("safety.savedLogins");
    expect(PAGES.privacy.groups.find((g) => g.items.includes("safety.savedLogins"))!.id).toBe("privacy.tools");
    expect(S.setGroupTitles["privacy.tools"]).toBeTruthy();
    const s = S.set["safety.savedLogins"] as { label: string; options: Record<string, string> };
    expect(S.short["safety.savedLogins"]).toBeTruthy();
    expect(Object.keys(s.options)).toEqual(["ask", "block", "note", "off"]);
    const { searchSettingsFor } = await import("./settingsSearch.ts");
    expect(searchSettingsFor("keychain").some((r) => (r.hit as { key?: string }).key === "safety.savedLogins")).toBe(true);
    expect(searchSettingsFor("saved logins")[0]).toMatchObject({ hit: { key: "safety.savedLogins" } });
  });
  test("the review: the hook's yes card says what each tool hands over and does, and where the choice is", () => {
    const card = (tool: string) => doneAsk({ tool, hook: "guard", on: false, file: "f", adds: "{}", creates: true } as never).notes[0];
    // Tools that can ask: asked first, never blocked.
    for (const t of ["cursor", "copilot", "antigravity"]) { expect(card(t)).toContain("asks you first"); expect(card(t)).not.toMatch(/block/i); }
    // Tools that can block: told, and stopped only with Block.
    for (const t of ["codex", "gemini", "windsurf"]) { expect(card(t)).toMatch(/Block/); expect(card(t)).not.toContain("asks you first"); }
    // File reads are named only where the hook hands them over.
    for (const t of ["gemini", "antigravity", "copilot"]) expect(card(t)).toContain("file read");
    for (const t of ["codex", "cursor", "windsurf"]) expect(card(t)).not.toContain("file read");
    // Every guard card names the setting; Claude Code's too.
    for (const t of ["claude", "codex", "cursor", "copilot", "antigravity", "gemini", "windsurf"]) expect(card(t)).toContain(S.set["safety.savedLogins"].label);
  });
  test("the review: Update says what the new line does about saved logins", () => {
    const upd = (tool: string) => doneAsk({ tool, hook: "guard", on: true, stale: true, file: "f", adds: "{}", creates: false } as never).notes[0];
    expect(upd("claude")).toMatch(/saved passwords or login files/);
    for (const t of ["codex", "gemini", "windsurf"]) { expect(upd(t)).toMatch(/saved logins/); expect(upd(t)).toMatch(/Block/); expect(upd(t)).not.toContain("goes on as before"); }
  });
});

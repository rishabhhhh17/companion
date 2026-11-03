// Google in the engine (M21): the shell's accounts line, the tools a task is given, and the safety rules for them.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { googleConnected, googleDeps, googleNote, setGoogleAccounts } from "../src/google/state.ts";
import { evaluate } from "../src/safety.ts";
import { parseCommand } from "../../protocol/index.ts";
import { pumpLine } from "../src/pump.ts";
import { GOOGLE_TOOL_NAMES, GOOGLE_TAP_TOOLS } from "../src/google/tools.ts";

const ctx = { project: "/tmp/p" };
const call = (name: string) => evaluate({ tool: `mcp__google__${name}`, input: {} }, ctx as never);

describe("the shell's Google accounts line", () => {
  test("is a known command, and only well formed accounts are kept", () => {
    const line = JSON.stringify({ v: 1, id: "g1", type: "google.accounts", accounts: [{ label: "Work", email: "w@co.com", apps: ["gmail", "fax"], token: "ya29.T", expiresInSecs: 3600 }, { label: "", email: "x", apps: ["gmail"], token: "t" }, { label: "Nothing", email: "n@x", apps: [], token: "t" }] });
    const r = parseCommand(line);
    expect(r.ok).toBe(true);
    expect(setGoogleAccounts((r as { msg: { accounts: unknown } }).msg.accounts, 0)).toBe(1);
    expect(googleConnected()).toBe(true);
    const accts = googleDeps().accounts;
    expect(typeof accts === "function" ? accts() : accts).toEqual([{ label: "Work", email: "w@co.com", apps: ["gmail"] }]);
    expect(googleNote()).toContain("Work (gmail)");
    expect(googleNote()).not.toContain("ya29");
  });
  test("a token is used until a minute before it ends, and an unknown label is a plain no", async () => {
    setGoogleAccounts([{ label: "Work", email: "w@co.com", apps: ["calendar"], token: "ya29.T", expiresInSecs: 120 }], 0);
    expect(await googleDeps(() => 59_000).token("work")).toBe("ya29.T");
    await expect(googleDeps(() => 61_000).token("Work")).rejects.toThrow(/renewed/);
    await expect(googleDeps(() => 0).token("Home")).rejects.toThrow(/No Google account/);
    setGoogleAccounts([], 0);
    expect(googleConnected()).toBe(false);
    expect(googleNote()).toBe("");
  });
  test("a damaged line is never repeated back with its tokens, and tasks get the tools only when connected", () => {
    // Since M56 every line goes through pumpLine (pump.ts); the rule that hides a damaged accounts line lives there.
    const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
    expect(main).toContain("pumpLine(line, { takeKey, dispatch, say });");
    const pump = readFileSync(new URL("../src/pump.ts", import.meta.url), "utf8");
    expect(pump).toContain(`const shown = line.includes('"google.accounts"') ? "google.accounts" : label(line, 200);`);
    // And by behaviour: a damaged accounts line is said by its type only, never with its token.
    const said: Record<string, unknown>[] = [];
    pumpLine('{"v":1,"id":"g9","type":"google.accounts","accounts":[{"token":"ya29.SECRET"', { takeKey: () => {}, dispatch: () => {}, say: (e) => said.push(e) });
    pumpLine(JSON.stringify({ v: 1, id: "g8", type: "google.accounts", accounts: "ya29.SECRET" }), { takeKey: () => {}, dispatch: () => {}, say: (e) => said.push(e) });
    expect(said.length).toBe(2);
    for (const e of said) { expect(e.type).toBe("protocol.error"); expect(e.line).toBe("google.accounts"); expect(JSON.stringify(e)).not.toContain("ya29.SECRET"); }
    expect(main).toContain('if (cmd.type === "google.accounts") { setGoogleAccounts(cmd.accounts); return; }');
    const sdk = readFileSync(new URL("../src/sdkEngine.ts", import.meta.url), "utf8");
    expect(sdk).toContain("mcpServers: googleConnected() ? { [GOOGLE_SERVER]: googleServer(googleDeps()) } : {},");
  });
});

describe("the safety rules for the Google tools", () => {
  test("reading runs, a draft runs and cannot be undone by Squibby, and adding an event asks every time", () => {
    for (const n of ["gmail_search", "gmail_read", "calendar_list", "calendar_free", "drive_search", "drive_read"]) expect(call(n).decision, n).toBe("allow");
    expect(call("gmail_draft")).toMatchObject({ decision: "allow", undoable: false });
    expect(call("calendar_create")).toMatchObject({ decision: "ask", risk: "network", undoable: false });
    expect(call("gmail_send").decision).toBe("ask");   // not a tool Squibby has; anything unknown asks
  });
  test("every tool the module has is covered by a rule, and every tap tool asks", () => {
    for (const n of GOOGLE_TOOL_NAMES) expect(call(n).reason, n).not.toContain("unknown Google tool");
    for (const n of GOOGLE_TAP_TOOLS) expect(call(n).decision, n).toBe("ask");
  });
});

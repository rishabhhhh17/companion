// Key handling. Tests use a throwaway keychain file and fake keys only. The founder's
// real Keychain is never touched.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getApiKey, hasApiKey, resolveAuth, type KeychainRef } from "../src/keychain.ts";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";

const FAKE = "sk-ant-api03-FAKEFAKEFAKEFAKEFAKE0123456789";
let dir = "", ref: KeychainRef;
const sec = (...a: string[]) => Bun.spawnSync(["security", ...a]);

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "companion-keychain-")));
  const path = join(dir, "test.keychain-db");
  sec("create-keychain", "-p", "pw", path);
  sec("set-keychain-settings", path);
  sec("unlock-keychain", "-p", "pw", path);
  ref = { service: "companion-test", account: "anthropic", keychain: path };
});
afterEach(() => { sec("delete-keychain", join(dir, "test.keychain-db")); rmSync(dir, { recursive: true, force: true }); });
const put = (v: string) => sec("add-generic-password", "-s", ref.service, "-a", ref.account, "-w", v, "-U", ref.keychain!);

describe("reading the key from the Keychain", () => {
  test("returns the stored key", async () => {
    put(FAKE);
    expect(await getApiKey(ref)).toBe(FAKE);
  });
  test("no key stored means null, not an error", async () => {
    expect(await getApiKey(ref)).toBeNull();
    expect(await hasApiKey(ref)).toBe(false);
  });
  test("hasApiKey says yes without reading the secret", async () => {
    put(FAKE);
    expect(await hasApiKey(ref)).toBe(true);
  });
  test("a key with spaces or quotes around it is trimmed, an empty one counts as no key", async () => {
    put("  " + FAKE + "\n");
    expect(await getApiKey(ref)).toBe(FAKE);
    put(" ");
    expect(await getApiKey(ref)).toBeNull();
  });
  test("a shell metacharacter in the service name cannot run a command", async () => {
    const evil = { ...ref, service: "x; touch /tmp/companion-pwned" };
    expect(await getApiKey(evil)).toBeNull();
    expect(await Bun.file("/tmp/companion-pwned").exists()).toBe(false);
  });
});

describe("choosing how the agent signs in", () => {
  test("a stored key means the API key route", async () => {
    put(FAKE);
    const a = await resolveAuth(ref);
    expect(a).toEqual({ method: "api_key", source: "keychain", apiKey: FAKE });
  });
  test("no key means not connected, never a silent fallback to something else", async () => {
    expect(await resolveAuth(ref)).toEqual({ method: "none" });
  });
  test("what we report to the app never contains the key", async () => {
    put(FAKE);
    const a = await resolveAuth(ref);
    const { apiKey: _k, ...publicPart } = a as any;
    expect(JSON.stringify(publicPart)).not.toContain("sk-ant");
  });
});

describe("agent commands never see the key (the M1 test)", () => {
  test("a command that prints its environment shows no key, even with one in our own environment", async () => {
    process.env.ANTHROPIC_API_KEY = FAKE;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-FAKE-TOKEN";
    try {
      const project = realpathSync(mkdtempSync(join(tmpdir(), "companion-env-")));
      const events: Event[] = [];
      const runner = new AgentRunner({
        shadowRoot: realpathSync(mkdtempSync(join(tmpdir(), "companion-envs-"))),
        engine: new ScriptedEngine([{ tool: { name: "Bash", input: { command: "env > env-dump.txt; printenv ANTHROPIC_API_KEY >> env-dump.txt || true" } }, costUsd: 0 }]),
        log: new TaskLog(":memory:"), emit: (e) => events.push(e),
      });
      await runner.handle({ v: 1, id: "c", type: "agent.start", project, agent: "a", mode: "drive", prompt: "dump env", model: "m", budgetUsd: 1 });
      const dump = await Bun.file(join(project, "env-dump.txt")).text();
      expect(dump).not.toContain("FAKEFAKE");
      expect(dump).not.toContain("ANTHROPIC_API_KEY");
      expect(dump).not.toContain("FAKE-TOKEN");
      expect(dump).toContain("PATH=");
      rmSync(project, { recursive: true, force: true });
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    }
  });
});

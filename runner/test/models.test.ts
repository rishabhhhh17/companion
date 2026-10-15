// Model ids live in one place (T10: "keep model ids in config, not code"). The defaults are exactly what they were before
// they were moved; the fast and vision lanes can be switched for testing, like the agent's model already could.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { MODELS } from "../src/models.ts";
import { createLanes, readSettings } from "../src/engines.ts";

describe("the default models", () => {
  test("are the same ids as before, one per lane", () => {
    expect(MODELS).toEqual({
      agent: "claude-sonnet-5-5",
      diagnose: "claude-opus-5-5",
      review: "claude-opus-5-5",
      fast: "claude-haiku-4-5-20251001",
      vision: "claude-sonnet-5-5",
      aim: "claude-sonnet-5-5",
    });
  });
  test("no other runner file spells out a model id", () => {
    const dir = join(import.meta.dir, "../src");
    const files = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(join(d, e.name)) : e.name.endsWith(".ts") ? [join(d, e.name)] : []);
    const spelled = files(dir).filter((f) => !f.endsWith("/models.ts")).filter((f) => /["'`]claude-(haiku|sonnet|opus|fable)-[0-9]/.test(readFileSync(f, "utf8")));
    expect(spelled).toEqual([]);
  });
  test("the app's page commands use the same ids", async () => {
    const c = await import("../../app/src/commands.ts");
    expect(c.DEFAULT_MODEL).toBe(MODELS.agent);
    expect(c.DIAGNOSE_MODEL).toBe(MODELS.diagnose);
  });
});

describe("switching the small lanes' models for testing", () => {
  test("settings read COMPANION_FAST_MODEL and COMPANION_VISION_MODEL, and leave them unset otherwise", () => {
    const s = readSettings({ COMPANION_FAST_MODEL: "fast-x", COMPANION_VISION_MODEL: " vision-y " });
    expect(s.fastModel).toBe("fast-x");
    expect(s.visionModel).toBe("vision-y");
    const none = readSettings({ COMPANION_FAST_MODEL: "", COMPANION_VISION_MODEL: "  " });
    expect(none.fastModel).toBeUndefined();
    expect(none.visionModel).toBeUndefined();
  });

  // The plan route needs no Keychain, and the fake query never starts Claude.
  const run = async (env: Record<string, string>) => {
    const asked: string[] = [];
    const queryFn = (p: any) => { asked.push(p.options.model); return (async function* () { yield { type: "assistant", message: { content: [{ type: "text", text: '{"none":true}' }] } }; yield { type: "result", subtype: "success", total_cost_usd: 0 }; })(); };
    const lanes = createLanes({ ...readSettings({ COMPANION_ROUTE: "plan", COMPANION_CLAUDE_BIN: "/bin/ls", ...env }) }, { queryFn: queryFn as any, tmpDrive: { ensure: async () => "/tmp", wipe: async () => {} } });
    await lanes.fast.run({ text: "hi", raw: true }, () => {}, new AbortController().signal);
    await lanes.vision.locate({ image: { mediaType: "image/png", base64: "AAAA", w: 10, h: 10 }, question: "where", ocr: [] }, new AbortController().signal);
    return asked;
  };
  test("without a setting, each lane uses its default", async () => expect(await run({})).toEqual([MODELS.fast, MODELS.vision]));
  test("with the settings, each lane uses the one given", async () => expect(await run({ COMPANION_FAST_MODEL: "fast-x", COMPANION_VISION_MODEL: "vision-y" })).toEqual(["fast-x", "vision-y"]));
  test("the agent's own model setting does not change the small lanes", async () => expect(await run({ COMPANION_MODEL: "agent-z" })).toEqual([MODELS.fast, MODELS.vision]));
});

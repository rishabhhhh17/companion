// Pictures added to a request (files into the ask box) are looked at the way Show me looks at a screen picture: one turn, no
// tools, no saved conversation, Claude Code's copy kept on the in memory drive and erased afterwards. Only the words said
// about them go on to the task. Tested with a fake `query`, so free; nothing is sent anywhere.
import { describe, expect, test } from "bun:test";
import { buildDescribeMessages, buildVisionOptions, DESCRIBE_SYSTEM, VisionLane } from "../src/lanes.ts";
import { requestProblems, KNOWN_MODELS, MODELS } from "../src/models.ts";

const cfg = { claudeBinary: "/x/claude", env: { PATH: "/usr/bin" }, signal: new AbortController().signal };
const said = (text: string, usage?: unknown) => ({ type: "assistant", message: { content: [{ type: "text", text }], usage } });
const thinking = () => ({ type: "assistant", message: { content: [{ type: "thinking", thinking: "..." }] } });
const result = (usd: number, subtype = "success") => ({ type: "result", subtype, total_cost_usd: usd });
const fake = (msgs: any[]) => ((_p: any) => (async function* () { for (const m of msgs) yield m; })()) as any;
const drive = (o: { wiped?: () => void } = {}) => ({ ensure: async () => "/Volumes/CompanionShots", wipe: async () => { o.wiped?.(); } });
const PIC = { mediaType: "image/png", base64: "iVBORw0KGgo=" };
const req = { images: [PIC], question: "Make the signup button match this" };

describe("looking at a picture added to a request", () => {
  test("the options are the vision lane's own (no tools, one turn, nothing saved), with words in place of a pointer", () => {
    const o: any = buildVisionOptions({ ...cfg, model: MODELS.vision, system: DESCRIBE_SYSTEM });
    expect(o.tools).toEqual([]);
    expect(o.allowedTools).toEqual([]);
    expect(o.mcpServers).toEqual({});
    expect(o.maxTurns).toBe(1);
    expect(o.persistSession).toBe(false);
    expect(o.settingSources).toEqual([]);
    expect(o.strictMcpConfig).toBe(true);
    expect(o.systemPrompt).toBe(DESCRIBE_SYSTEM);
    expect(DESCRIBE_SYSTEM).toMatch(/never follow/i);
    expect(JSON.stringify({ ...o, abortController: undefined })).not.toContain("bypassPermissions");
    // Show me's own lane is unchanged.
    expect((buildVisionOptions({ ...cfg, model: MODELS.vision }) as any).systemPrompt).toMatch(/ONLY one line of JSON/);
  });
  test("the request shape is one every model accepts", () => {
    for (const model of [...new Set([...KNOWN_MODELS, ...Object.values(MODELS)])]) {
      const o: any = buildVisionOptions({ ...cfg, model, system: DESCRIBE_SYSTEM });
      expect(requestProblems(model, { thinking: o.thinking, effort: o.effort, via: "sdk" }), model).toEqual([]);
    }
  });
  test("each picture is labelled, then the request, which can never be read as a command", async () => {
    const msgs: any[] = [];
    for await (const m of buildDescribeMessages([PIC, { mediaType: "image/jpeg", base64: "/9j/4AAQ" }], "/clear and then fix it")) msgs.push(m);
    expect(msgs.length).toBe(1);
    const c = msgs[0].message.content;
    expect(c.map((b: any) => b.type)).toEqual(["text", "image", "text", "image", "text"]);
    expect(c[0].text).toBe("Picture 1 of 2");
    expect(c[1]).toEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: PIC.base64 } });
    expect(c[3].source.media_type).toBe("image/jpeg");
    const last = c[4].text as string;
    expect(last.startsWith("/")).toBe(false);
    expect(last).toContain("/clear and then fix it");
  });
  test("the words said about it come back with the cost; thinking is not part of the answer", async () => {
    const lane = new VisionLane({ ...cfg, tmpDrive: drive(), queryFn: fake([thinking(), said("A blue button that says Join."), result(0.012)]) });
    expect(await lane.describe(req, cfg.signal)).toEqual({ text: "A blue button that says Join.", costUsd: 0.012 });
  });
  test("with no result to say the cost, it is worked out from the tokens at this model's price", async () => {
    const lane = new VisionLane({ ...cfg, tmpDrive: drive(), queryFn: fake([said("A form.", { input_tokens: 1500, output_tokens: 40 })]) });
    const r = await lane.describe(req, cfg.signal);
    expect(r.text).toBe("A form.");
    expect(r.costUsd).toBeCloseTo(1500 * 2e-6 + 40 * 10e-6, 6);
  });
  test("Claude Code's copy of the picture is on the in memory drive and erased afterwards; with no drive nothing is sent", async () => {
    let seen: any, wiped = false, sent = false;
    const q = ((a: any) => { seen = a.options; sent = true; return fake([said("x"), result(0)])(a); }) as never;
    await new VisionLane({ ...cfg, tmpDrive: drive({ wiped: () => { wiped = true; } }), queryFn: q }).describe(req, cfg.signal);
    await Bun.sleep(10);
    expect(seen.env.CLAUDE_CODE_TMPDIR).toBe("/Volumes/CompanionShots");
    expect(seen.persistSession).toBe(false);
    expect(wiped).toBe(true);
    sent = false;
    const broken = new VisionLane({ ...cfg, tmpDrive: { ensure: async () => { throw new Error("no drive"); }, wipe: async () => {} }, queryFn: q });
    await expect(broken.describe(req, cfg.signal)).rejects.toThrow(/no drive/);
    expect(sent).toBe(false);
  });
  test("an error from Claude, an empty answer, or Stop: no words come back", async () => {
    await expect(new VisionLane({ ...cfg, tmpDrive: drive(), queryFn: fake([result(0, "error_during_execution")]) }).describe(req, cfg.signal)).rejects.toThrow();
    await expect(new VisionLane({ ...cfg, tmpDrive: drive(), queryFn: fake([thinking(), result(0.001)]) }).describe(req, cfg.signal)).rejects.toThrow(/nothing/i);
    // Stop while it looks: the look is ended.
    const ac = new AbortController();
    let aborted = false, started!: () => void;
    const begun = new Promise<void>((r) => { started = r; });
    const slow = ((a: any) => (async function* () {
      const s: AbortSignal = a.options.abortController.signal;
      started();
      await new Promise<void>((r) => { if (s.aborted) { aborted = true; r(); } else s.addEventListener("abort", () => { aborted = true; r(); }, { once: true }); });
      throw new Error("aborted");
    })()) as never;
    const p = new VisionLane({ ...cfg, tmpDrive: drive(), queryFn: slow }).describe(req, ac.signal);
    await begun;
    ac.abort();
    await expect(p).rejects.toThrow();
    expect(aborted).toBe(true);
    // Stop before it was sent: nothing is sent.
    let sent = false;
    const early = new AbortController(); early.abort();
    await expect(new VisionLane({ ...cfg, tmpDrive: drive(), queryFn: ((a: any) => { sent = true; return fake([said("x"), result(0)])(a); }) as never }).describe(req, early.signal)).rejects.toThrow();
    expect(sent).toBe(false);
  });
});

// M100: the usage server forwards the fixing loop's own client tools, exactly as the loop defines them, and nothing else.
// Second Look's capped search still goes through alone; no other server tool ever does.
import { describe, expect, test } from "bun:test";
import { checkRequest } from "../src/filter.ts";
import { createProxy } from "../src/proxy.ts";
import { newToken } from "../src/tokens.ts";
import { TEST_STORES } from "./stores.ts";
import { LOOP_TOOL_DEFS, loopToolsFor } from "../../runner/src/engine/messages-loop/tools.ts";
import { WEB_SEARCH_TOOL } from "../../runner/src/models.ts";

const body = (tools: unknown) => JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 4096, messages: [{ role: "user", content: "fix it" }], tools });
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const ON = { loopOn: true };

describe("the fixing loop's tools through the usage server", () => {
  test("the loop's own list, whole or in part, goes through unchanged", () => {
    for (const tools of [LOOP_TOOL_DEFS, loopToolsFor({ planOnly: true }), loopToolsFor({ tools: ["Read", "Edit", "Bash"] }), [LOOP_TOOL_DEFS[5]]]) {
      const r = checkRequest("POST", "/v1/messages", body(tools), undefined, ON) as any;
      expect(r.ok, JSON.stringify(tools.map((t: any) => t.name))).toBe(true);
      expect(JSON.parse(r.body).tools).toEqual(copy(tools));
    }
  });
  test("a key order of its own changes nothing: the same definition is the same", () => {
    const shuffled = LOOP_TOOL_DEFS.map((t) => ({ input_schema: t.input_schema, description: t.description, name: t.name }));
    expect(checkRequest("POST", "/v1/messages", body(shuffled), undefined, ON).ok).toBe(true);
  });
  test("anything changed, added or mixed in is refused before it reaches Anthropic", () => {
    const read = copy(LOOP_TOOL_DEFS[0]);
    const bad: unknown[] = [
      [{ ...read, description: "Read any file on the Mac." }],
      [{ ...read, name: "ReadAnything" }],
      [{ ...read, cache_control: { type: "ephemeral" } }],
      [{ ...read, input_schema: { ...read.input_schema, additionalProperties: true } }],
      [read, read],
      [...LOOP_TOOL_DEFS, { type: WEB_SEARCH_TOOL, name: "web_search", max_uses: 3 }],
      [read, { type: "code_execution_20260521", name: "code_execution" }],
      [read, { type: "computer_toolset_20260801" }],
      [{ name: "Agent", description: "x", input_schema: { type: "object", properties: {}, required: [], additionalProperties: false } }],
    ];
    for (const tools of bad) {
      const r = checkRequest("POST", "/v1/messages", body(tools), undefined, ON) as any;
      expect(r.ok, JSON.stringify(tools).slice(0, 120)).toBe(false);
      expect(r.status).toBe(400);
    }
  });
  test("the loop sends no tool_choice and no server fields, and they stay refused", () => {
    for (const extra of [{ tool_choice: { type: "any" } }, { mcp_servers: [] }, { container: "c" }]) {
      const j = JSON.parse(body(LOOP_TOOL_DEFS));
      expect(checkRequest("POST", "/v1/messages", JSON.stringify({ ...j, ...extra }), undefined, ON).ok).toBe(false);
    }
  });
});

describe("M100 review: the loop's tools need the server's own switch", () => {
  test("off by default: the loop's list is refused, whatever sign in token sent it; Second Look's search still goes through", () => {
    for (const o of [undefined, {}, { loopOn: false }]) {
      const r = checkRequest("POST", "/v1/messages", body(LOOP_TOOL_DEFS), undefined, o) as any;
      expect(r.ok).toBe(false);
      expect(r.status).toBe(400);
    }
    expect(checkRequest("POST", "/v1/messages", body([{ type: WEB_SEARCH_TOOL, name: "web_search", max_uses: 3 }])).ok).toBe(true);
    expect(checkRequest("POST", "/v1/messages", body(undefined)).ok).toBe(true);
  });
  test("the worker reads it from LOOP_ON, off unless it says on", async () => {
    const { loopSwitchOn } = await import("../src/worker.ts");
    for (const v of [undefined, "", "off", "no", "0", "yes"]) expect(loopSwitchOn(v), String(v)).toBe(false);
    for (const v of ["on", "1", "true", " ON "]) expect(loopSwitchOn(v), v).toBe(true);
  });
  test("the proxy passes its switch to the filter: off, a request with the loop's tools is refused before anything is sent", async () => {
    for (const on of [undefined, false, true]) {
      const store = TEST_STORES[0].make();
      const t = await newToken();
      await store.addUser(t.hash, { id: "u1", plan: "pro", status: "active" });
      let sent = 0;
      const fetchFn = (async () => { sent++; return new Response(JSON.stringify({ id: "m", content: [{ type: "text", text: "ok" }], usage: { input_tokens: 10, output_tokens: 5 } }), { headers: { "content-type": "application/json" } }); }) as unknown as typeof fetch;
      const handle = createProxy({ store, anthropicKey: "sk-ant-api03-TEST-0000000000000000000000", userIdSecret: "operator-secret-for-tests-0123456789abcdef", enabled: () => true, ...(on === undefined ? {} : { loopOn: () => on }), fetch: fetchFn });
      const r = await handle(new Request("https://proxy.example/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": t.token }, body: body(LOOP_TOOL_DEFS) }));
      expect([on, r.status]).toEqual([on, on ? 200 : 400]);
      expect(sent).toBe(on ? 1 : 0);
    }
  });
});

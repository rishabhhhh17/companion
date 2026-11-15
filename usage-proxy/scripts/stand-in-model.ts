// A stand in for the Messages API, on this Mac only (M99), for checking `wrangler dev` without a real key or a real model.
// Usage: bun scripts/stand-in-model.ts [port]   (default 8788). It answers every POST like the Messages API, with made up
// usage, and GET /seen says how many requests came and whether each carried the stand in key. It keeps no request text.
const port = Number(process.argv[2] ?? 8788);
const seen: { path: string; key: string | null }[] = [];
Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/seen") return Response.json(seen);
    await req.arrayBuffer();   // read and dropped
    seen.push({ path: url.pathname, key: req.headers.get("x-api-key") });
    return Response.json({ id: "msg_stand_in", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [{ type: "text", text: "A stand in answer." }], stop_reason: "end_turn", usage: { input_tokens: 1000, output_tokens: 200 } });
  },
});
console.log(`The stand in model is listening on http://127.0.0.1:${port}.`);

// Checks that the price list opens and shows prices the way people read them.
const test = require("node:test");
const assert = require("node:assert");
const { createServer } = require("../server.js");

test("the price list shows each price in dollars", async () => {
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/`);
  const html = await res.text();
  server.close();
  assert.strictEqual(res.status, 200);
  assert.ok(html.includes("Fern: $12.50"), "The price list should say Fern: $12.50");
});

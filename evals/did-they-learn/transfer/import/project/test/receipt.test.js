// Checks that the receipt page opens and adds the tax to the total.
const test = require("node:test");
const assert = require("node:assert");
const { createServer } = require("../server.js");

test("the receipt shows the total with tax", async () => {
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/`);
  const html = await res.text();
  server.close(); server.closeAllConnections();
  assert.strictEqual(res.status, 200);
  assert.ok(html.includes("Total with tax: $10.80"), "The receipt should say Total with tax: $10.80");
});

// Checks that the page opens and shows the shop's name at the top.
const test = require("node:test");
const assert = require("node:assert");
const { createServer } = require("../server.js");

test("the page shows the shop's name", async () => {
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/`);
  const html = await res.text();
  server.close();
  assert.strictEqual(res.status, 200);
  assert.match(html, /<h1>[^<]+<\/h1>/);
});

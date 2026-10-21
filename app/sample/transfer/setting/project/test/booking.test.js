// Checks that the booking page opens and tells people which address their request goes to.
const test = require("node:test");
const assert = require("node:assert");
const { createServer } = require("../server.js");

test("the booking page says where requests go", async () => {
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/`);
  const html = await res.text();
  server.close(); server.closeAllConnections();
  assert.strictEqual(res.status, 200);
  assert.match(html, /Requests go to [^<\s]+@[^<\s]+/, "The page should say which email address requests go to");
});

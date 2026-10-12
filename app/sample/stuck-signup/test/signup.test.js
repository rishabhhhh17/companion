// Checks that pressing Join really reaches the server. The test does what the page does: it sends the email to the
// address the page's code uses.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { createServer } = require("../server.js");

test("joining the list works", async () => {
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const code = fs.readFileSync(path.join(__dirname, "..", "public", "signup.js"), "utf8");
  const address = /fetch\("([^"]+)"/.exec(code)[1];
  const res = await fetch(`http://127.0.0.1:${port}${address}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "sam@example.com" }) });
  server.close();
  assert.strictEqual(res.status, 200, `Pressing Join sends the email to ${address}, which answered ${res.status}`);
});

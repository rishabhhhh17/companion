// Checks that pressing Send on the contact page really delivers the message. The test does what a browser does: it
// sends the form to the address written in the page's form.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { createServer, messages } = require("../server.js");

test("sending a message works", async () => {
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const html = fs.readFileSync(path.join(__dirname, "..", "site", "contact.html"), "utf8");
  const form = /<form\b[^>]*>/i.exec(html);
  const action = form ? (/\baction="([^"]*)"/i.exec(form[0]) || [])[1] || "/" : "/";
  const before = messages.length;
  const res = await fetch(`http://127.0.0.1:${port}${action}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ name: "Sam", message: "Is the blue vase back in stock?" }).toString() });
  server.close(); server.closeAllConnections();
  assert.ok(form, "The contact page should still have its form");
  assert.strictEqual(res.status, 200, `Pressing Send posts the message to ${action}, which answered ${res.status}`);
  assert.strictEqual(messages.length, before + 1, `Pressing Send posts the message to ${action}, but no message arrived`);
});

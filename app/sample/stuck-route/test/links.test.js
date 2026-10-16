// Checks that every link on the home page opens a real page. The test follows the links the way a visitor would.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { createServer } = require("../server.js");

test("every link on the home page opens a page", async () => {
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const broken = [];
  for (const [, href, words] of html.matchAll(/<a href="(\/[^"]*)">([^<]*)<\/a>/g)) {
    const res = await fetch(`http://127.0.0.1:${port}${href}`);
    if (res.status !== 200) broken.push(`The link ${words} goes to ${href}, which answered ${res.status}`);
  }
  server.close();
  assert.deepStrictEqual(broken, [], broken.join(". "));
});

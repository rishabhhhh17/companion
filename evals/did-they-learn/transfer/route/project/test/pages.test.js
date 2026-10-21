// Checks the whole site the way a visitor would: start at the home page, follow every link on every page, and make sure
// each one opens a real page. The links people need must still be there.
const test = require("node:test");
const assert = require("node:assert");
const { createServer } = require("../server.js");

test("every link on the site opens a page", async () => {
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const seen = new Map(), todo = ["/"], broken = [], words = new Set();
  while (todo.length) {
    const at = todo.shift();
    if (seen.has(at)) continue;
    const res = await fetch(`http://127.0.0.1:${port}${at}`);
    const html = await res.text();
    seen.set(at, html);
    for (const [, href, text] of html.matchAll(/<a href="(\/[^"]*)">([^<]*)<\/a>/g)) {
      words.add(text);
      const opens = await fetch(`http://127.0.0.1:${port}${href}`);
      if (opens.status !== 200) broken.push(`On ${at}, the link ${text} goes to ${href}, which answered ${opens.status}`);
      else todo.push(href);
    }
  }
  server.close(); server.closeAllConnections();
  assert.deepStrictEqual(broken, [], broken.join(". "));
  for (const w of ["See the menu", "Opening hours", "Back home"]) assert.ok(words.has(w), `The site should still have its link ${w}`);
  assert.ok([...seen.values()].some((h) => h.includes("<h1>Opening hours</h1>")), "The Opening hours link should open the opening hours page");
});

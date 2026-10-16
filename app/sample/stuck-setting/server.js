// A tiny server for the practice shop page. No packages needed.
const http = require("node:http");
const { shopName } = require("./settings.js");

const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function page() {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escape(shopName)}</title>
<style>body{font:16px -apple-system,sans-serif;max-width:420px;margin:60px auto;padding:0 20px}</style></head>
<body>
  <h1>${escape(shopName)}</h1>
  <p>Fresh plants, delivered on Fridays.</p>
</body>
</html>`;
}

function createServer() {
  return http.createServer((req, res) => {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(page());
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  });
}

module.exports = { createServer };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, "127.0.0.1", () => console.log(`Shop page on http://127.0.0.1:${port}`));
}

// A tiny server for the order receipt page. No packages needed.
const http = require("node:http");
const { receiptLines } = require("./lib/receipt");
const { TAX_PERCENT } = require("./lib/tax");

const order = [
  { name: "Notebook", cents: 600 },
  { name: "Pen", cents: 400 },
];

function page() {
  const rows = receiptLines(order).map((l) => `<li>${l}</li>`).join("\n    ");
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Your receipt</title>
<style>body{font:16px -apple-system,sans-serif;max-width:420px;margin:60px auto;padding:0 20px}</style></head>
<body>
  <h1>Your receipt</h1>
  <ul>
    ${rows}
  </ul>
  <p>Prices include ${TAX_PERCENT}% sales tax in the total.</p>
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
  createServer().listen(port, "127.0.0.1", () => console.log(`Receipt page on http://127.0.0.1:${port}`));
}

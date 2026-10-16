// A tiny server for the practice price list. No packages needed.
const http = require("node:http");
const { formatPrice } = require("./lib/format-price");

const plants = [
  { name: "Fern", cents: 1250 },
  { name: "Cactus", cents: 800 },
  { name: "Monstera", cents: 3400 },
];

function page() {
  const rows = plants.map((p) => `<li>${p.name}: ${formatPrice(p.cents)}</li>`).join("\n    ");
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Price list</title>
<style>body{font:16px -apple-system,sans-serif;max-width:420px;margin:60px auto;padding:0 20px}</style></head>
<body>
  <h1>Price list</h1>
  <ul>
    ${rows}
  </ul>
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
  createServer().listen(port, "127.0.0.1", () => console.log(`Price list on http://127.0.0.1:${port}`));
}

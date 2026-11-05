// A tiny server for the practice shop. No packages needed.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { canTakePayments } = require("./pay.js");

function createServer() {
  return http.createServer((req, res) => {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(fs.readFileSync(path.join(__dirname, "index.html")));
    }
    if (req.method === "GET" && req.url === "/api/checkout") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ready: canTakePayments() }));
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  });
}

module.exports = { createServer };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, "127.0.0.1", () => console.log(`Shop on http://127.0.0.1:${port}`));
}

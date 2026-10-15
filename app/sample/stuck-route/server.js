// A tiny server for the practice site. Each address it knows is listed here. No packages needed.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const pages = {
  "/": "index.html",
  "/pricing": "pricing.html",
};

function createServer() {
  return http.createServer((req, res) => {
    const file = req.method === "GET" ? pages[req.url] : undefined;
    if (file) {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(fs.readFileSync(path.join(__dirname, file)));
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  });
}

module.exports = { createServer };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, "127.0.0.1", () => console.log(`Site on http://127.0.0.1:${port}`));
}

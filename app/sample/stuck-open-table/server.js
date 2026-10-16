// A tiny server for the practice notes page. No packages needed. The database lives in Supabase; its tables are made by
// the files in supabase/migrations.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

function createServer() {
  return http.createServer((req, res) => {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(fs.readFileSync(path.join(__dirname, "index.html")));
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  });
}

module.exports = { createServer };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, "127.0.0.1", () => console.log(`Notes page on http://127.0.0.1:${port}`));
}

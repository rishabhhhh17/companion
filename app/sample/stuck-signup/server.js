// A tiny server for the practice signup page. No packages needed.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const signups = [];

function createServer() {
  return http.createServer((req, res) => {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(fs.readFileSync(path.join(__dirname, "index.html")));
    }
    if (req.method === "GET" && req.url === "/signup.js") {
      res.writeHead(200, { "content-type": "text/javascript" });
      return res.end(fs.readFileSync(path.join(__dirname, "public", "signup.js")));
    }
    // Where new signups arrive.
    if (req.method === "POST" && req.url === "/api/register") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        let email = "";
        try { email = String(JSON.parse(body).email || "").trim(); } catch { /* not JSON */ }
        if (!email.includes("@")) { res.writeHead(400, { "content-type": "application/json" }); return res.end(JSON.stringify({ ok: false })); }
        signups.push(email);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, count: signups.length }));
      });
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  });
}

module.exports = { createServer };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, "127.0.0.1", () => console.log(`Signup page on http://127.0.0.1:${port}`));
}

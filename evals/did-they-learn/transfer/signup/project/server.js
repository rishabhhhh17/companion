// A tiny server for the contact page. No packages needed.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const messages = [];

function thanks(name) {
  const safe = name.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Sent</title>
<style>body{font:16px -apple-system,sans-serif;max-width:420px;margin:60px auto;padding:0 20px}</style></head>
<body>
  <h1>Thanks${safe ? `, ${safe}` : ""}</h1>
  <p>Your message was sent. We will write back soon.</p>
  <p><a href="/">Back</a></p>
</body>
</html>`;
}

function createServer() {
  return http.createServer((req, res) => {
    if (req.method === "GET" && (req.url === "/" || req.url === "/contact.html")) {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(fs.readFileSync(path.join(__dirname, "site", "contact.html")));
    }
    // Messages from the contact form arrive here.
    if (req.method === "POST" && req.url === "/api/messages") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const form = new URLSearchParams(body);
        const name = String(form.get("name") || "").trim();
        const message = String(form.get("message") || "").trim();
        if (!message) { res.writeHead(400, { "content-type": "text/plain" }); return res.end("Please write a message."); }
        messages.push({ name, message });
        res.writeHead(200, { "content-type": "text/html" });
        res.end(thanks(name));
      });
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  });
}

module.exports = { createServer, messages };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, "127.0.0.1", () => console.log(`Contact page on http://127.0.0.1:${port}`));
}

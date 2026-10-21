// A tiny server for the cafe site. Every address the site answers is in the list below, with the file it shows.
// No packages needed.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const addresses = {
  "/": "pages/home.html",
  "/menu": "pages/menu.html",
  "/opening-hours": "pages/opening-hours.html",
};

function createServer() {
  return http.createServer((req, res) => {
    const file = req.method === "GET" ? addresses[req.url] : undefined;
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
  createServer().listen(port, "127.0.0.1", () => console.log(`Cafe site on http://127.0.0.1:${port}`));
}

// The page's settings. They live in a file named .env.local in this folder, one NAME=value per line, never in the code.
// This reads that file itself, so no packages are needed.
const fs = require("node:fs");
const path = require("node:path");

for (const file of [".env.local", ".env"]) {
  let text = "";
  try { text = fs.readFileSync(path.join(__dirname, file), "utf8"); } catch { continue; }
  for (const line of text.split("\n")) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const shopName = process.env.SHOP_NAME;
if (!shopName) throw new Error("SHOP_NAME is not set. Add it to .env.local in this folder.");

module.exports = { shopName };

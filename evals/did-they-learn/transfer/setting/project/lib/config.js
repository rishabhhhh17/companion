// What the booking page needs to know before it starts. Values like these are settings: they are kept in a file named
// .env.local in the project's main folder (the folder with package.json), one NAME=value per line, never in the code.
// This reads that file itself, so no packages are needed.
const fs = require("node:fs");
const path = require("node:path");

const main = path.join(__dirname, "..");
for (const file of [".env.local", ".env"]) {
  let text = "";
  try { text = fs.readFileSync(path.join(main, file), "utf8"); } catch { continue; }
  for (const line of text.split("\n")) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const replyTo = process.env.BOOKING_EMAIL || "";
if (!replyTo.includes("@")) throw new Error("Missing setting BOOKING_EMAIL: the email address that booking requests go to.");

module.exports = { replyTo };

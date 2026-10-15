// A stand in for Playwright's installer, for the runner's own process tests only. It prints what Playwright 1.64 prints for
// `install chromium-headless-shell` (the browser's download, then FFmpeg's, which Playwright adds to every browser install),
// lays out a finished browser the way Playwright does, and never touches the network.
// How it behaves is set by a file in the browsers folder (".stub-mode": "slow" or "ffmpeg-fails"); it writes its own
// process number to ".stub-pid" there, so a test can check it is gone.
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "";
// Never anywhere but a test's own temporary browsers folder (main.test.ts makes them with this name).
if (!root || !existsSync(root) || !basename(realpathSync(root)).startsWith("companion-main-browsers-")) { console.error("refusing: the browsers folder is not a test's temporary folder"); process.exit(2); }
if (process.argv.slice(2).join(" ") !== "install chromium-headless-shell") { console.error("refusing: unexpected arguments"); process.exit(2); }

const mode = existsSync(join(root, ".stub-mode")) ? readFileSync(join(root, ".stub-mode"), "utf8").trim() : "";
writeFileSync(join(root, ".stub-pid"), String(process.pid));
const step = mode === "slow" ? 2000 : 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const bar = (p: number, size: string) => { const row = Math.floor(p / 10); return `|${"■".repeat(row * 8)}${" ".repeat((10 - row) * 8)}| ${String(p).padStart(3)}% of ${size}`; };

console.log("Downloading Chrome Headless Shell 156.0.8078.4 (playwright chromium-headless-shell v1248) from https://cdn.playwright.dev/builds/cft/156.0.8078.4/mac-arm64/chrome-headless-shell-mac-arm64.zip");
for (let p = 0; p <= 100; p += 10) { console.log(bar(p, "89.6 MiB")); await sleep(step); }
const dir = join(root, "chromium_headless_shell-1248");
mkdirSync(join(dir, "chrome-headless-shell-mac-arm64"), { recursive: true });
writeFileSync(join(dir, "chrome-headless-shell-mac-arm64", "chrome-headless-shell"), "");
writeFileSync(join(dir, "INSTALLATION_COMPLETE"), "");
console.log(`Chrome Headless Shell 156.0.8078.4 (playwright chromium-headless-shell v1248) downloaded to ${dir}`);

console.log("Downloading FFmpeg (playwright ffmpeg v1013) from https://cdn.playwright.dev/dbazure/download/playwright/builds/ffmpeg/1013/ffmpeg-mac-arm64.zip");
for (let p = 0; p <= (mode === "ffmpeg-fails" ? 40 : 100); p += 10) { console.log(bar(p, "1.1 MiB")); await sleep(step); }
if (mode === "ffmpeg-fails") { console.error("Error: Failed to download FFmpeg (playwright ffmpeg v1013), caused by\nError: Download failure, code=1"); process.exit(1); }
mkdirSync(join(root, "ffmpeg-1013"), { recursive: true });
writeFileSync(join(root, "ffmpeg-1013", "INSTALLATION_COMPLETE"), "");
console.log(`FFmpeg (playwright ffmpeg v1013) downloaded to ${join(root, "ffmpeg-1013")}`);

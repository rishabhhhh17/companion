// Writes Flowflow's pose pictures (public/characters/water/*.png) from the orb's geometry (src/orbArt.ts), in Ocean's
// colours; the pages turn them to the chosen water. Change the drawing in orbArt.ts and run this again, never edit the
// pictures by hand. Developer use only: it draws each picture in a headless Chromium (playwright-core from the runner's
// packages, and the browser the app keeps for proof checks), at the pictures' exact size, see through.
//   bun app/scripts/make-orb-poses.ts            (from the repo root)
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { POSES } from "../src/characters.ts";
import { POSE_CANVAS, poseSvg } from "../src/orbArt.ts";

const app = join(import.meta.dir, "..");
const req = createRequire(join(app, "..", "runner", "package.json"));
const { chromium } = req("playwright-core") as typeof import("playwright-core");

/** The headless browser the app installs for proof checks (any version folder). */
function browserPath(): string {
  const root = join(homedir(), "Library", "Application Support", "Companion", "browsers");
  const dir = existsSync(root) ? readdirSync(root).filter((d) => d.startsWith("chromium_headless_shell-")).sort().pop() : undefined;
  const exe = dir && join(root, dir, "chrome-headless-shell-mac-arm64", "chrome-headless-shell");
  if (!exe || !existsSync(exe)) throw new Error(`No headless browser under ${root}. Run a proof check in the app once, or install one with playwright.`);
  return exe;
}

const out = join(app, "public", "characters", "water");
const browser = await chromium.launch({ executablePath: browserPath() });
try {
  const page = await browser.newPage({ viewport: { width: POSE_CANVAS.w, height: POSE_CANVAS.h }, deviceScaleFactor: 1 });
  for (const p of POSES) {
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${poseSvg(p)}</body></html>`);
    await page.locator("svg").screenshot({ path: join(out, `${p}.png`), omitBackground: true });
    console.log(`${p}.png`);
  }
} finally {
  await browser.close();
}

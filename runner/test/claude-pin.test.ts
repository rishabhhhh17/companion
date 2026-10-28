// The build the app installs at first run (M22, app/src-tauri/src/claude_install.rs) must be exactly the one the runner is
// pinned to and tested with: the same version as the SDK pin, and the lockfile's own sha512 for its platform package.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const pin = JSON.parse(read("../../protocol/claude-pin.json")) as { package: string; version: string; integrity: string; team: string; identifier: string };

describe("the Claude build installed at first run", () => {
  test("is the runner's pinned SDK version and the lockfile's exact hash", () => {
    const sdk = (JSON.parse(read("../package.json")) as { dependencies: Record<string, string> }).dependencies["@anthropic-ai/claude-agent-sdk"];
    expect(pin.version).toBe(sdk);
    const lock = read("../bun.lock");
    const line = lock.split("\n").find((l) => l.includes(`"${pin.package}": [`));
    expect(line, "the platform package is in the lockfile").toBeTruthy();
    expect(line!).toContain(`"${pin.package}@${pin.version}"`);
    expect(line!).toContain(`"${pin.integrity}"`);
  });
  test("is signed by Anthropic's own team, and never shipped inside the app", () => {
    expect(pin.team).toBe("Q6L2SF6YDW");
    expect(pin.identifier).toBe("com.anthropic.claude-code");
    expect(read("../../app/scripts/stage-engine.sh")).toContain('rm -rf "$OUT/runner/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64"');
    expect(read("../../app/scripts/build-app.sh")).toContain('INSIDE="$(find "$APP" -type f -name claude | head -1)"');
  });
});

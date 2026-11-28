// F29 (28 Nov 2026): on Squibby's server the engine says "managed" once the shell has handed it a Squibby sign in token,
// so Home stops saying fixing is off after the person signs in; with no token, or a Claude key, it says "none".
import { describe, expect, test, afterEach } from "bun:test";
import { currentAuth, readSettings } from "../src/engines.ts";
import { heldKey } from "../src/keychain.ts";

const managed = () => readSettings({ COMPANION_ROUTE: "managed", COMPANION_MANAGED_BASE: "https://api.getsquibby.com", COMPANION_KEY_SOURCE: "app" });
const prev = process.env.COMPANION_KEY_SOURCE;
afterEach(() => { heldKey.set(null); process.env.COMPANION_KEY_SOURCE = prev; });

describe("managed sign in", () => {
  test("a Squibby token held: managed; nothing held or a Claude key: none", async () => {
    process.env.COMPANION_KEY_SOURCE = "app";
    heldKey.set(null);
    expect(await currentAuth(managed())).toEqual({ method: "none" });
    heldKey.set("sk-ant-api03-not-ours");
    expect(await currentAuth(managed())).toEqual({ method: "none" });
    heldKey.set("cmp_" + "a".repeat(30));
    expect(await currentAuth(managed())).toEqual({ method: "managed" });
  });
});

// A room change (M66 fix 11): the colours change at once; only the old room's light fades out on top, by opacity.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { roomWas } from "./roomLight.tsx";

const look = readFileSync(new URL("./ui/look.css", import.meta.url), "utf8");

describe("a room change", () => {
  test("the light of the room just left is drawn again only when the room really changed", () => {
    expect(roomWas("flow", "guide")).toBe("flow");
    expect(roomWas("flow", "flow")).toBeNull();
    expect(roomWas(undefined, "flow")).toBeNull();
    expect(roomWas("flow", undefined)).toBeNull();
  });
  test("no colour moves frame by frame: the old light fades by opacity on --dur-3", () => {
    expect(look).not.toMatch(/transition:[^;]*--el-/);
    expect(look).toContain(".room.room-was { z-index: 0; animation: room-was-out var(--dur-3) var(--ease-out) both; }");
    expect(look).toContain("@keyframes room-was-out { from { opacity: var(--room-show); } to { opacity: 0; } }");
    expect(readFileSync(new URL("./card.tsx", import.meta.url), "utf8")).toContain("<RoomLight element={room} />");
  });
});

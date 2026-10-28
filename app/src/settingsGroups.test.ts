import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { GROUP_ORDER, groupOf, groupPlaces } from "./settingsGroups.ts";

const reg = JSON.parse(readFileSync(new URL("../../protocol/settings.json", import.meta.url), "utf8")) as { sections: string[] };
const FIXED = ["permissions", "key", "practice", "made", "kept", "acknowledgements", "logs"].map((f) => `fixed:${f}`);

describe("the Settings side list in groups", () => {
  test("every section of the registry and every fixed part has a group, and none is left to More by accident", () => {
    for (const id of [...reg.sections, ...FIXED]) expect(GROUP_ORDER, id).toContain(groupOf(id));
    expect(reg.sections.filter((id) => groupOf(id) === "more")).toEqual([]);
  });
  test("each part shows exactly once, in its order, and a part nobody listed still shows under More", () => {
    const places = [...reg.sections, ...FIXED, "brandNew"].map((id) => ({ id }));
    const out = groupPlaces(places);
    const seen = out.flatMap((g) => g.places.map((p) => p.id));
    expect(seen.sort()).toEqual(places.map((p) => p.id).sort());
    expect(out.find((g) => g.group === "more")!.places.map((p) => p.id)).toContain("brandNew");
    expect(out[0].group).toBe("companion");
    expect(out[0].places[0].id).toBe("home");
  });
  test("an empty group is left out", () => {
    expect(groupPlaces([{ id: "home" }]).map((g) => g.group)).toEqual(["companion"]);
  });
});

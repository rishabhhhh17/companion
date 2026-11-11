// M46 (F28): rest. The shell says when the character holds still (a call with Quiet during calls on, or Low Power Mode
// with Rest in Low Power Mode on); every live Flowflow takes it, and the one on the edge also rests while tucked away.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { restFrom } from "./useRest.ts";

const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

describe("rest reaches every live Flowflow", () => {
  test("only a plain yes is rest: the event's { rest: true } or the command's true", () => {
    expect(restFrom(true)).toBe(true);
    expect(restFrom({ rest: true })).toBe(true);
    for (const no of [false, null, undefined, "true", 1, { rest: "yes" }, { rest: 1 }, {}]) expect(restFrom(no)).toBe(false);
  });
  test("each page asks once as it starts, then listens; it hears nothing but the yes or no", () => {
    const hook = read("./useRest.ts");
    expect(hook).toContain('invoke("flowflow_rest")');
    expect(hook).toContain('listen("flowflow-rest"');
    const main = read("../src-tauri/src/main.rs");
    expect(main).toContain("fn flowflow_rest() -> bool");
    expect(main).toContain('app.emit("flowflow-rest", json!({ "rest": rest }))');
  });
  test("the edge (dock), the notch and its panel (FlowMini), and Settings and the first run (HomeCharacter) all take it", () => {
    for (const f of ["./dock.tsx", "./flowflowMini.tsx", "./homeCharacter.tsx"]) expect(read(f), f).toContain("useRest()");
    expect(read("./dock.tsx")).toContain('resting={shellRest || peek.pose === "hidden"}');
    expect(read("./flowflowMini.tsx")).toContain("resting={resting}");
    expect(read("./homeCharacter.tsx")).toContain("resting={resting}");
    const view = read("./flowflow/view.tsx");
    expect(view).toContain("ctl.current?.setResting(!!resting)");
    expect(view).toContain("ctl.current?.setLiveliness(liveliness ?? \"still\")");
  });
  test("every live Flowflow takes How lively; the notch's small one works at its own steady pace", () => {
    for (const f of ["./dock.tsx", "./flowflowMini.tsx"]) expect(read(f), f).toMatch(/livelinessOf\(useSetting\("character\.lively"\)\)/);
    // M59 (the rules of hooks lint): Home's character reads the setting on every render first, then takes How lively from it.
    expect(read("./homeCharacter.tsx")).toContain('const livelySetting = useSetting("character.lively");');
    expect(read("./homeCharacter.tsx")).toContain("livelinessOf(livelySetting)");
    expect(read("./flowflowMini.tsx")).toContain("liveliness={mode} resting={resting} small");
    expect(read("./dock.tsx")).not.toContain("livelyOf");
    // The dock forwards the pointer to the eyes only in Lively.
    expect(read("./dock.tsx")).toContain('if (livelyNow.current !== "lively") return;');
  });
});

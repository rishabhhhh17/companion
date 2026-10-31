// F28, the launch cut, the engine's side: one product at launch (Fix it, with proof, a receipt and Undo). The side tools
// start off and each is turned on again in Settings; nothing is deleted. A tool with a switch of its own (Second Look,
// Type by voice, Draw it) is refused while that switch or its group's is off. Installs before a check usually ask (M49).
// protocol/fixtures/launch-cut.json is read by the shell and the pages too, so all three agree.
import { describe, expect, test } from "bun:test";
import fixture from "../../protocol/fixtures/launch-cut.json";
import { defOf } from "../../protocol/settings.ts";
import { GROUPS, OFF_LINE, TOOLS, offNow, refusal, switchesOf } from "../src/groups.ts";
import { RunnerSettings } from "../src/settings.ts";
import { checkSettings, installMode, USUAL_CHECK } from "../src/proof/options.ts";

const usualOff = (k: string): unknown => defOf(k)?.default;

describe("the launch cut's usual values", () => {
  test("the registry's usual values are the fixture's, so the shell, the engine and the pages agree", () => {
    for (const [k, v] of Object.entries(fixture.usual)) expect(defOf(k)?.default, k).toEqual(v);
  });
  test("the side tools start off and the hero stays on", () => {
    const off = offNow(usualOff);
    expect(off).toContain("files");
    for (const id of fixture.toolsOff) {
      const t = TOOLS.find((x) => x.id === id)!;
      expect(switchesOf(t).some((sw) => usualOff(sw) === false), id).toBe(true);
    }
    for (const id of fixture.toolsOn) {
      const t = TOOLS.find((x) => x.id === id)!;
      expect(switchesOf(t).some((sw) => usualOff(sw) === false), id).toBe(false);
    }
  });
  test("with nothing applied the engine reads the same usual values", () => {
    const s = new RunnerSettings();
    for (const [k, v] of Object.entries(fixture.usual)) if (defOf(k)?.applies.includes("runner")) expect(s.get(k), k).toEqual(v);
  });
  test("a check usually asks before it installs packages, and a value it cannot read asks too", () => {
    expect(USUAL_CHECK.install).toBe("ask");
    expect(checkSettings(() => undefined).install).toBe("ask");
    expect(checkSettings((k) => (k === "check.install" ? "always" : undefined)).install).toBe("ask");
    expect(checkSettings((k) => (k === "check.install" ? "auto" : undefined)).install).toBe("auto");
    expect(installMode("ask", [])).toBe("ask");
  });
});

describe("a tool with a switch of its own", () => {
  const own = TOOLS.filter((t) => t.switch);
  test("Second Look, Type by voice and Draw it, each with its own switch, each a registry switch", () => {
    expect(own.map((t) => [t.id, t.switch])).toEqual([["drawIt", "drawIt.on"], ["dictate", "talk.dictate"], ["secondLook", "secondLook.on"]]);
    for (const t of own) expect(defOf(t.switch!)?.kind, t.id).toBe("switch");
  });
  test("its own switch off refuses its commands and nothing else; its group off refuses them too", () => {
    for (const t of own) {
      const mineOff = (k: string): unknown => (k === t.switch ? false : true);
      const groupSwitch = GROUPS.find((g) => g.id === t.group)!.switch!;
      const groupOff = (k: string): unknown => (k === groupSwitch ? false : true);
      for (const r of t.runner) {
        expect(refusal(mineOff, { type: r }), `${t.id}: ${r}`).toBe((t.stays ?? []).includes(r) ? null : OFF_LINE);
        expect(refusal(groupOff, { type: r }), `${t.id}: ${r}`).toBe((t.stays ?? []).includes(r) ? null : OFF_LINE);
        expect(refusal(() => true, { type: r }), `${t.id}: ${r}`).toBeNull();
      }
      for (const other of TOOLS.filter((o) => o.switch !== t.switch)) for (const r of other.runner) expect(refusal(mineOff, { type: r }), `${t.id} off: ${r}`).toBeNull();
    }
  });
  test("what is switched off names the tools whose own switch is off, after the groups", () => {
    expect(offNow((k) => (k === "voice.on" || k === "drawIt.on" ? false : true))).toEqual(["voice", "drawIt"]);
    expect(offNow(() => true)).toEqual([]);
  });
});

describe("Prompt help split out of Voice", () => {
  test("talking off leaves Prompt help, the error explainer and Second Look alone; Prompt help off refuses them", () => {
    const voiceOff = (k: string): unknown => (k === "voice.on" ? false : true);
    const promptOff = (k: string): unknown => (k === "prompt.on" ? false : true);
    for (const type of ["assist.prompt", "error.explain", "secondlook.check"]) {
      expect(refusal(voiceOff, { type }), type).toBeNull();
      expect(refusal(promptOff, { type }), type).toBe(OFF_LINE);
    }
    expect(defOf("prompt.on")).toMatchObject({ kind: "switch", default: true, section: "groups" });
  });
});

describe("an install from before the cut (the shell's settings.rs launch_cut)", () => {
  // The engine never migrates anything: it applies the values the shell sends. For every case, a tool the person relied on
  // and the shell kept on is not refused here, and one that now starts off is.
  test("what the shell keeps on, the engine lets through; what it leaves off, the engine refuses", () => {
    const commandOf: Record<string, string> = { "secondLook.on": "secondlook.check", "drawIt.on": "diagram.ask", "watch.on": "" };
    for (const c of fixture.cutMigration) {
      const read = (k: string): unknown => (k in c.values ? (c.values as Record<string, boolean>)[k] : defOf(k)?.default);
      for (const [k, on] of Object.entries(c.values as Record<string, boolean>)) {
        expect(defOf(k)?.default, k).toBe(false);
        const cmd = commandOf[k];
        if (!cmd) continue;
        expect(refusal(read, { type: cmd }) === null, `${c.name}: ${k}`).toBe(on);
      }
    }
  });
});

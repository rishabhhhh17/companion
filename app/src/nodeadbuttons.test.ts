// M15 wave 2, "nothing broken": every button under Home's ask box does something a person can see. These read card.tsx and
// the shell, since the buttons themselves need a real Mac to press.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { S } from "./strings.ts";
import { shellSource } from "../dom/sourceText.ts";

const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
const main = shellSource();
const errhelp = readFileSync(new URL("../src-tauri/src/errhelp.rs", import.meta.url), "utf8");
const fnBody = (src: string, name: string) => { const a = src.indexOf(name); return a < 0 ? "" : src.slice(a, src.indexOf("\n  };\n", a)); };

describe("the buttons under the ask box", () => {
  test("Start with an empty box puts the cursor in the box and says what to do", () => {
    expect(S.typeFirst).toBe("Type what you want done first.");
    const submit = fnBody(card, "const submit = () => {");
    expect(submit).toContain('if (route === "needWords") { needWords(S.typeFirst); return; }');
    expect(card).toContain("const needWords = (line: string) => { setAskHint(line); box.current?.focus(); };");
  });
  test("Show me with an empty box is a gentle line, never the amber error panel", () => {
    expect(card).toContain("else { pressed(); needWords(S.showMeHint); }");
    expect(card).not.toContain('dispatch({ type: "app.showme", stage: "error", message: S.showMeHint })');
  });
  test("the line can be closed, and typing clears it", () => {
    expect(card).toContain("{askHint && <div className=\"line muted\" role=\"status\">{askHint} <Button size=\"sm\" onClick={() => { setAskHint(null); box.current?.focus(); }}>{S.ehClose}</Button></div>}");
    expect(card).toContain("setVoiceHint(null); setAskHint(null);");
  });
  test("Explain an error explains the words in the box; with none it says how, in a line that can be closed", () => {
    const ex = fnBody(card, "const explainFromBox = () => {");
    expect(ex).toContain('invoke("eh_typed", { text: q })');
    expect(ex).toContain('needWords(keyHint("explain", S.explainChipHint, keys, S.explainChipHintNoKeys))');
    expect(card).not.toContain('dispatch({ type: "app.notice", message: keyHint("explain", S.errKeyHint, keys) })');
    // The shell sends it down the explain keys' own engine path, only from Home, and never reads another app for it.
    expect(main).toContain("fn eh_typed(app: AppHandle, window: tauri::WebviewWindow, text: String)");
    expect(main).toMatch(/fn eh_typed[^\n]*\n\s*if window\.label\(\) != "card"/);
    expect(main).toMatch(/[ ,]eh_typed,/);
    const typed = errhelp.slice(errhelp.indexOf("pub fn typed("), errhelp.indexOf("pub fn dismiss("));
    expect(typed).toContain("errorsel::command(&req, errorsel::ASK_BOX, &t, &crate::current_project())");
    for (const read of ["ax::", "read_selection", "focused"]) expect(typed).not.toContain(read);
  });
  test("the microphone in the ask box says how to talk; a click never opens the microphone (rule 5)", () => {
    // M69 (the YC benchmark spec 3.1): a microphone in the ask box's row. Its press only puts the hold to talk keys in words
    // under the box (and its tooltip says them too): nothing is sent, nothing is invoked, the microphone stays shut.
    const micAt = card.split("\n").find((l) => l.includes('className="ask-mic"'))!;
    expect(micAt).toContain('{groups.on("talk") && keys.using.talk && <Button kind="icon" className="ask-mic" label={S.look.micLabel} title={talkKeysLine(keys)} onClick={() => setAskHint(S.look.micHint(chordLabel(keys.using.talk!)))}><Icon name="mic" size={16} /></Button>}');
    for (const no of ["send(", "invoke(", "voice", "listen"]) expect(micAt).not.toContain(no);
    expect(S.look.micHint("Option Space")).toBe("Hold Option Space to talk. The microphone only listens while you hold them.");
    expect(card).not.toContain("S.look.howToTalk");
  });
});

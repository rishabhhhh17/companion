// Spoken answers that fit (M11, everyday apps): with "Say steps short, one at a time" (talk.shortSteps) on and Speak to me
// on, each step of a Show me answer or a lesson is said as its instruction when its ring lands, paced with the rings
// (sequence.ts). Only a sentence of explanation after the instruction is ever left out: never inside a sentence, never a
// warning, a key, a question or another thing to do. Off (the usual value), every line is said exactly as before.
// Nothing here plays a sound.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { lineFor, shortLine, wordsToSay } from "./speech.ts";
import { leadMs, lineMs, planSteps, startTimes } from "./sequence.ts";
import { defOf } from "../../protocol/settings.ts";
import { S } from "./strings.ts";
import { KEYS_START } from "./keys.ts";

const walk = (o: Record<string, unknown> = {}) => ({ id: "w1", index: 0, variant: "main", stage: "step", say: "Click Rules at the top of the Settings window. Rules sort your mail for you as it arrives.", ...o }) as never;

describe("one short line", () => {
  test("the instruction only, when what follows it is only explanation", () => {
    expect(shortLine("Click Rules at the top of the Settings window. Rules sort your mail for you as it arrives.")).toBe("Click Rules at the top of the Settings window.");
    expect(shortLine("Choose Download as zip. Big projects can take a moment.")).toBe("Choose Download as zip.");
    expect(shortLine("Then click OK. A window opens.")).toBe("Then click OK.");
  });
  test("never cut inside a sentence: a long one, or one with commas, is said whole", () => {
    const long = "Set the condition to From contains, then type the sender's address in the box on the right of the window that opens";
    expect(shortLine(long)).toBe(long);
    const chord = "Go to your project: type cd, a space, drag your project folder into the Terminal window, and press Return.";
    expect(shortLine(chord)).toBe(chord);
    const none = "Press and hold the small round button at the very top left corner of the photo window until the list of tools opens up";
    expect(shortLine(none)).toBe(none);
  });
  test("a key chord is never split, and a step that also warns is said whole", () => {
    expect(shortLine("Press Control, Option, Command and F in Companion. It finds the same place.")).toBe("Press Control, Option, Command and F in Companion.");
    const warned = "Press Control, Option, Command and F in Companion to find the same place in your project. If Provisioning Integrations failed, do not press Skip.";
    expect(shortLine(warned)).toBe(warned);
  });
  test("a later sentence that is a step of its own, a warning, a question or a key is never left out", () => {
    for (const t of [
      "Open the Mail menu! Then choose Settings.",
      "Copy the page's web address. In Companion, choose Open from a link and paste it.",
      "Type a short name for the project in the Repository name box. Use letters, numbers and dashes.",
      "Paste the value in the Value box. If it is a password or secret key, make it a Secret so it cannot be read again after saving. Do not paste it anywhere else.",
      "Choose who can see it. Private means only you (and people you invite); Public means anyone on the internet. If unsure, choose Private.",
      "Press Publish in the top right of the editor, next to Share. Nothing goes live until you press Publish again in the window that opens.",
      "Press Return. It shows no progress while it downloads, so wait for the prompt to come back.",
      "Click Next. Is the box ticked?",
      "Click Done. Then press Return.",
      "Click OK. Mail asks whether to apply it to messages you already have.",
    ]) expect(shortLine(t), t).toBe(t);
  });
  test("a step that does not begin with what to do is said whole: a condition, a place, a fact or a question first", () => {
    for (const t of [
      "Changes only reach new deployments. Open the Deployments tab.",
      "Your browser saves a zip file. Open your Downloads folder and double click the zip to unpack it.",
      "No connection yet? Press Add connection. Only a workspace owner or admin can; ask them if you cannot.",
      "The first time, it asks you to log in. Follow the prompts in your browser.",
      "On that page, find Deployment Details and open the Building section to show the build logs.",
      "When it says Your website is live, use the copy link or visit site button, and check the page loads.",
      "If there is no Building section, the error is shown on the page itself. Read it there.",
    ]) expect(shortLine(t), t).toBe(t);
  });
  test("a dot inside a command is not the end of a sentence", () => {
    expect(shortLine('Run git add . (with the dot), then git commit -m "First version". This saves your files in git.')).toBe('Run git add . (with the dot), then git commit -m "First version".');
  });
  test("short lines, versions and numbers stay as they are", () => {
    expect(shortLine("Click Save")).toBe("Click Save");
    expect(shortLine("Choose version 2.5 from the list.")).toBe("Choose version 2.5 from the list.");
    expect(shortLine("  ")).toBe("");
  });
});

// Every step the app ships (lessons/) and the five everyday test lessons, run through what is really said with the setting
// on. Whatever is left out must be only explanation: the step's action, its keys, its warnings and the words of what the
// ring looks for stay.
describe("every lesson step, said short", () => {
  type Step = { id: string; say: string; find: string; instead?: { say: string; find: string } };
  const dirs = [new URL("../../lessons/", import.meta.url), new URL("../../runner/test/fixtures/everyday-lessons/", import.meta.url)];
  const lessons = dirs.flatMap((d) => readdirSync(d).filter((n) => n.endsWith(".json")).map((n) => JSON.parse(readFileSync(new URL(n, d), "utf8")) as { id: string; steps: Step[] }));
  const all = lessons.flatMap((l) => l.steps.flatMap((s) => [{ at: `${l.id}/${s.id}`, say: s.say, find: s.find }, ...(s.instead ? [{ at: `${l.id}/${s.id}/instead`, say: s.instead.say, find: s.instead.find }] : [])]));
  const said = (say: string) => {
    const line = lineFor({ walk: walk({ say }), showme: null }, KEYS_START, undefined, true)!;
    return { full: line.text, short: wordsToSay(line, { say: true, whole: false }) };
  };
  // Written here, apart from speech.ts, so the check does not share the code it checks.
  const WARN = /\b(do not|don't|never|only|live|public|private|secret|password|key|keys|if unsure|confirm|must|not|no)\b/i;
  const KEY = /\b(Command|Control|Option|Shift|Return|Enter|Escape|Esc|Tab|Space)\b/;
  const VERB = /^(?:then |now |next )?(click|double|press|open|choose|select|pick|type|paste|copy|drag|scroll|go|run|sign|look|find|refresh|leave|keep|use|turn|switch|set|save|close|wait|check|read|add|make|follow|visit|share|rename|connect|create|try|ask)\b/i;
  const STOP = new Set(["the", "your", "with", "that", "this", "from", "list", "into", "where", "there", "which", "next", "what", "them", "near", "after", "before", "about"]);
  test("there are steps to check", () => { expect(lessons.length).toBeGreaterThanOrEqual(17); expect(all.length).toBeGreaterThan(80); });
  test("a short line is the step's opening sentences, never a piece of one", () => {
    for (const s of all) { const { full, short } = said(s.say); expect(full.startsWith(short), s.at).toBe(true); expect(short === full || /[.!?]$/.test(short), s.at).toBe(true); }
  });
  test("what is left out holds no key, no warning, no question and nothing to do", () => {
    for (const s of all) {
      const { full, short } = said(s.say);
      const dropped = full.slice(short.length).trim();
      if (!dropped) continue;
      expect(dropped, s.at).not.toMatch(KEY);
      expect(dropped, s.at).not.toMatch(WARN);
      expect(dropped, s.at).not.toContain("?");
      for (const sentence of dropped.split(/(?<=[.!?])\s+/)) expect(sentence, s.at).not.toMatch(VERB);
    }
  });
  test("the step's action and the words of what its ring looks for stay", () => {
    for (const s of all) {
      const { full, short } = said(s.say);
      if (short !== full) expect(short, s.at).toMatch(VERB);
      const words = s.find.split(/[^A-Za-z]+/).filter((w) => w.length >= 4 && !STOP.has(w.toLowerCase()) && full.includes(w));
      for (const w of words) expect(short, `${s.at}: ${w}`).toContain(w);
    }
  });
  test("the steps the reviewers heard cut wrongly are said whole", () => {
    const whole = ["vercel-failed-deploy/ask", "vercel-failed-deploy/logs", "lovable-publish/confirm/instead", "lovable-publish/open-link", "vercel-add-env-var/redeploy-tab",
      "vercel-add-env-var/value", "vercel-add-env-var/redeploy", "bolt-download/zip", "lovable-github/connect/instead", "claude-code-install/cd", "claude-code-install/paste",
      "github-new-repo/visibility", "github-new-repo/ignore", "github-new-repo/commit", "lovable-github/link"];
    for (const at of whole) { const s = all.find((x) => x.at === at); expect(s, at).toBeTruthy(); expect(said(s!.say).short, at).toBe(said(s!.say).full); }
  });
  test("it still shortens where only explanation follows", () => {
    const at = (id: string) => said(all.find((x) => x.at === id)!.say).short;
    expect(at("replit-download/download")).toBe("Choose Download as zip.");
    expect(at("cursor-install/signin")).toBe("Sign in with your Cursor account when it asks.");
    // Most lesson steps are one sentence already, or carry a warning or a second action, so they are said whole.
    expect(all.filter((s) => said(s.say).short !== said(s.say).full).map((s) => s.at).sort()).toEqual(["claude-code-install/first-question", "cursor-install/signin", "lovable-github/view", "replit-download/download"]);
  });
});

describe("what is said, with the setting", () => {
  test("in the registry: a switch, off, read by the pages, with its words", () => {
    expect(defOf("talk.shortSteps")).toMatchObject({ kind: "switch", default: false, applies: ["pages"], section: "talking" });
    expect(S.set["talk.shortSteps"].label).toBeTruthy();
  });
  test("its help promises no word count (a long instruction is said whole) and says when it is used", () => {
    const help = S.set["talk.shortSteps"].help;
    expect(help).not.toMatch(/\d+ words/);
    expect(help).toMatch(/Speak to me/);
    expect(help).toMatch(/Answer out loud/);
  });
  test("off (the usual value): a lesson step and a Show me step are said whole, as before, with no short line", () => {
    expect(lineFor({ walk: walk(), showme: null })).toEqual({ key: "walk:w1:0:main", text: "Click Rules at the top of the Settings window. Rules sort your mail for you as it arrives." });
    expect(lineFor({ walk: walk(), showme: null }, undefined, undefined, false)?.short).toBeUndefined();
    expect(lineFor({ walk: null, showme: { stage: "pointing", message: "Click Rules. It is at the top.", req: "r" } })?.text).toBe("Click Rules. It is at the top.");
  });
  test("on: the whole step and its short line, under the same key, so it is still said once", () => {
    const on = lineFor({ walk: walk(), showme: null }, undefined, undefined, true)!;
    expect(on).toEqual({ key: "walk:w1:0:main", text: "Click Rules at the top of the Settings window. Rules sort your mail for you as it arrives.", short: "Click Rules at the top of the Settings window." });
    expect(lineFor({ walk: null, showme: { stage: "pointing", message: "Click Rules. It is at the top.", req: "r" } }, undefined, undefined, true)).toMatchObject({ text: "Click Rules. It is at the top.", short: "Click Rules." });
    expect(lineFor({ walk: null, showme: { stage: "pointing_roughly", message: "Click Rules. It is at the top.", req: "r" } }, undefined, undefined, true)).toMatchObject({ text: "I think it is here. Click Rules. It is at the top.", short: "I think it is here. Click Rules." });
    // Nothing to leave out: no short line at all.
    expect(lineFor({ walk: null, showme: { stage: "pointing", message: "Click Rules.", req: "r" } }, undefined, undefined, true)?.short).toBeUndefined();
  });
  test("on: after a pause the step is short and the question is still asked", () => {
    expect(lineFor({ walk: walk({ stage: "already" }), showme: null }, undefined, undefined, true)?.short).toBe(`Click Rules at the top of the Settings window. ${S.lessonAlready}`);
  });
  test("on: help, errors and the end of a lesson are never cut, since they say what to do next", () => {
    const note = "I could not tell that this worked. I will not point at it again. What to look for: the Rules tab.";
    expect(lineFor({ walk: walk({ stage: "help", note }), showme: null }, undefined, undefined, true)).toEqual({ key: "walk:w1:0:help", text: note });
    expect(lineFor({ walk: null, showme: { stage: "error", message: "Could not find it. Try again.", req: "r" } }, undefined, undefined, true)?.short).toBeUndefined();
  });
  test("each step waits for its ring: the line is said when its pointer lands, as before", () => {
    expect(lineFor({ walk: null, showme: { stage: "pointing", message: "Then click OK. A window opens.", req: "r", step: 2, of: 3 } }, undefined, "normal", true)).toMatchObject({ short: "Then click OK.", delayMs: leadMs("normal") });
  });
  test("the short line is said only by Speak to me; an answer said whole (Answer out loud, asked by voice) is said all of it", () => {
    const line = { key: "show:r:pointing", text: "Click Rules. It is at the top.", short: "Click Rules." };
    expect(wordsToSay(line, { say: true, whole: false })).toBe("Click Rules.");
    expect(wordsToSay(line, { say: true, whole: true })).toBe("Click Rules. It is at the top.");
    expect(wordsToSay({ key: "k", text: "Click Rules." }, { say: true, whole: false })).toBe("Click Rules.");
  });
});

describe("paced with the rings", () => {
  const t = (caption: string, x: number) => ({ x, y: 10, targetText: "", confidence: 0.9, caption });
  const steps = planSteps([t("Open the Mail menu at the top left. It is next to the Apple menu.", 10), t("Choose Settings. A window opens.", 200), t("Click Rules.", 400)]);
  test("a short line always fits in its step's time, so the next ring never cuts it off", () => {
    for (const pace of ["slower", "normal", "faster"]) for (const speed of [0.5, 1, 1.5]) for (const s of steps) {
      expect(lineMs(shortLine(s.text), true, speed, pace)).toBeLessThanOrEqual(lineMs(s.text, true, speed, pace));
    }
  });
  test("the steps still come one after another", () => {
    const at = startTimes(steps, true);
    expect(at[0]).toBe(0);
    expect(at[1]).toBeGreaterThan(at[0]);
    expect(at[2]).toBeGreaterThan(at[1]);
  });
  test("the card reads the setting, decides whether to speak first, then picks the short or the whole words", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain('const spoken = lineFor({ walk: m.walk, showme: m.showme }, keys, setting("point.pace"), setting("talk.shortSteps"));');
    // What is said goes through speakWhen first: nothing is said unless Speak to me (or Answer out loud) says so.
    expect(card.indexOf("speakWhen({ speech: speechOn()")).toBeGreaterThan(card.indexOf("const spoken = lineFor("));
    // And the words come from that decision: the whole answer when it is said whole, never the cut one.
    expect(card).toContain("const text = wordsToSay(spoken, when);");
    expect(card).not.toMatch(/sayIt\(spoken\.text/);
  });
});

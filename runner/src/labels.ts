// The plain label a person sees for a task (What I did, Where was I, the undo point's name). It is what the task was for, in
// the person's own words or the step's name, never the engine's instructions to the model (first Mac session, findings F and
// G), and never text read from another app: a fix for a selected error is named by the app's display name only.
import { FOUND_INTRO } from "./fixfound.ts";
import { NO_UNASKED_DETAILS_STEP, STEP_INSTRUCTION } from "./drive.ts";
import { label as clipLabel } from "./redact.ts";
import { STALE_ERROR_RULE } from "./staleerror.ts";

/** The label of any task the person asked to keep off the record (nothing about it is kept). */
export const OFF_RECORD_LABEL = "Off the record task";
const ERROR_FIX_LABEL = /^Fix for an error you selected in [\w .+-]{1,40}$/;
/** Off the record tasks are never named in Where was I or the recap, under either label. */
export const isOffRecordLabel = (label: string): boolean => label === OFF_RECORD_LABEL || ERROR_FIX_LABEL.test(label);

/** Sentences Squibby adds for the model. They stay in the prompt and are never part of a label. */
const ENGINE_WORDS = [NO_UNASKED_DETAILS_STEP, STALE_ERROR_RULE, STEP_INSTRUCTION];

/** The label for a task: the words it was asked in, minus every sentence the engine added, with secrets hidden, short. */
export function taskLabel(text: string, max = 120): string {
  let t = String(text ?? "");
  if (t.startsWith(FOUND_INTRO)) {
    // A fix for a check Squibby ran itself: named by the check that failed.
    const failed = /Failed check:\s*(.+)/.exec(t)?.[1];
    if (failed) return clipLabel(`Fix the failing check: ${failed}`, max);
  }
  for (const w of ENGINE_WORDS) t = t.split(w).join(" ");
  return clipLabel(t, max);
}

// The apps people select an error in, by their identifier. Anything else shows the last part of its identifier when that
// reads as a name, and otherwise "another app": the identifier comes from the Mac, but the label never trusts it.
const KNOWN_APPS: Record<string, string> = {
  "com.apple.Terminal": "Terminal", "com.googlecode.iterm2": "iTerm", "dev.warp.Warp-Stable": "Warp", "net.kovidgoyal.kitty": "kitty",
  "com.mitchellh.ghostty": "Ghostty", "com.github.wez.wezterm": "WezTerm", "org.alacritty": "Alacritty",
  "com.apple.TextEdit": "TextEdit", "com.apple.dt.Xcode": "Xcode", "com.apple.Notes": "Notes", "com.apple.Safari": "Safari",
  "com.microsoft.VSCode": "VS Code", "com.todesktop.230313mzl4w4u92": "Cursor", "com.google.Chrome": "Chrome",
  "org.mozilla.firefox": "Firefox", "company.thebrowser.Browser": "Arc", "com.tinyspeck.slackmacgap": "Slack",
  "com.apple.mail": "Mail", "com.apple.MobileSMS": "Messages", "notion.id": "Notion", "md.obsidian": "Obsidian",
};
const GENERIC = new Set(["app", "main", "stable", "desktop", "mac", "macos", "beta", "release"]);
export function appDisplayName(bundleId: string): string {
  const id = String(bundleId ?? "");
  if (Object.hasOwn(KNOWN_APPS, id)) return KNOWN_APPS[id];
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(id)) return "another app";
  const last = id.split(".").filter(Boolean).at(-1) ?? "";
  return last.length >= 2 && last.length <= 30 && /^[A-Za-z][A-Za-z0-9_-]*$/.test(last) && !GENERIC.has(last.toLowerCase()) && id.includes(".") && !id.endsWith(".") ? last : "another app";
}

/** The label of a fix started from an explained error. Only the app's display name, never the selected text. */
export const errorFixLabel = (app?: string): string => `Fix for an error you selected in ${app || "another app"}`;

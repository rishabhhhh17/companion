// The everyday tutor (M11, everyday apps; F17: the engine works on any app on screen). When the app in front is not a
// coding or app building tool, Show me how and anywhere mode answer as a tutor for that app, in plain steps, never talking
// about projects or code. Only with "Teach everyday apps in their own words" (showme.everydayTutor) on; off, nothing here
// changes what is asked. The shell names the app in front by its id only, read on the key press (as Prompt help does); the
// model is only ever told a name from the list below, never the id.
import { TERMINALS } from "./prompthelp.ts";

export type AppKind = "coding" | "browser" | "everyday" | "unknown";
/** everyday: a desktop app that is not a coding tool. browser: a web browser, where the page decides. */
export type Tutor = { kind: "everyday" | "browser"; app?: string };

// Editors and the AI tools a builder uses. Kept beside the terminals Prompt help knows (prompthelp.ts TERMINALS); the
// shell's own list for Take the wheel (wheel.rs) is the editors' source.
const EDITORS = new Set([
  "com.microsoft.VSCode", "com.microsoft.VSCodeInsiders", "com.todesktop.230313mzl4w4u92", "com.apple.dt.Xcode", "dev.zed.Zed",
  "dev.zed.Zed-Preview", "com.panic.Nova", "com.sublimetext.4", "com.sublimetext.3", "com.github.atom", "org.vim.MacVim",
  "com.exafunction.windsurf", "com.visualstudio.code.oss", "io.alacritty",
]);
const EDITOR_PREFIXES = ["com.jetbrains."];
const AI_AND_DEV = new Set([
  "com.anthropic.claudefordesktop", "com.openai.chat", "com.openai.codex", "com.google.gemini", "com.github.GitHubClient",
  "com.docker.docker", "com.postmanlabs.mac", "com.tinyapp.TablePlus", "com.sequel-ace.sequel-ace",
]);
const BROWSERS = new Set([
  "com.apple.Safari", "com.apple.SafariTechnologyPreview", "com.google.Chrome", "com.google.Chrome.canary", "company.thebrowser.Browser",
  "company.thebrowser.dia", "org.mozilla.firefox", "com.microsoft.edgemac", "com.brave.Browser", "com.operasoftware.Opera",
  "com.vivaldi.Vivaldi", "com.kagi.kagimacOS",
]);
const OURS = "dev.companion.app";
// Names said to the model. Only these words ever reach it, so an app id can never carry other words.
const NAMES: Record<string, string> = {
  "com.apple.mail": "Mail", "com.apple.finder": "Finder", "com.apple.systempreferences": "System Settings", "com.apple.iCal": "Calendar",
  "com.apple.iWork.Numbers": "Numbers", "com.apple.iWork.Pages": "Pages", "com.apple.iWork.Keynote": "Keynote", "com.apple.Notes": "Notes",
  "com.apple.reminders": "Reminders", "com.apple.Preview": "Preview", "com.apple.Photos": "Photos", "com.apple.MobileSMS": "Messages",
  "com.microsoft.Excel": "Excel", "com.microsoft.Word": "Word", "com.microsoft.Powerpoint": "PowerPoint", "com.microsoft.Outlook": "Outlook",
  "com.figma.Desktop": "Figma", "com.adobe.Photoshop": "Photoshop", "com.adobe.illustrator": "Illustrator", "com.tinyspeck.slackmacgap": "Slack",
  "us.zoom.xos": "Zoom", "notion.id": "Notion", "com.spotify.client": "Spotify",
};

/** An app id as the shell sends it: letters, digits, dots, dashes and underscores, no leading dot, no two dots in a row
 *  (the same shape settings keep, T16 `item.shape` appId). */
const isAppId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(v) && !v.includes("..");

export function appKind(id: unknown): AppKind {
  if (!isAppId(id) || id === OURS) return "unknown";
  if (TERMINALS.has(id) || EDITORS.has(id) || EDITOR_PREFIXES.some((p) => id.startsWith(p)) || AI_AND_DEV.has(id)) return "coding";
  if (BROWSERS.has(id)) return "browser";
  return "everyday";
}

/** The tutor for this app, or null for the usual answer: the setting off (the usual value), a coding or app building
 *  tool, or no app known. */
export function tutorFor(id: unknown, setting: unknown): Tutor | null {
  if (setting !== true) return null;
  const kind = appKind(id);
  if (kind === "everyday") { const app = NAMES[id as string]; return app ? { kind, app } : { kind }; }
  if (kind === "browser") return { kind };
  return null;
}

/** The one sentence that names what the tutor never talks about. */
export const NEVER_LINE = "Never talk about projects, code, terminals or deploying: the person is using an everyday app, not building one.";
/** Caption examples for the tutor, in place of the usual ones. */
export const TUTOR_EXAMPLE = '"Click Share"';

/** What is added to the pointing prompt. A name not on the list is never used (a Tutor built by hand cannot add words). */
export function tutorLines(t: Tutor): string {
  if (t.kind === "browser") {
    return "The app in front is a web browser. If the page is an everyday web app (mail, documents, spreadsheets, slides, calendars, photos, shopping or a site's settings), answer as a patient tutor for that web app: each caption is one plain step in the page's own words, and never talk about projects or code. Otherwise answer as usual.";
  }
  const name = t.app && Object.values(NAMES).includes(t.app) ? t.app : "";
  const app = name || "the app in front";
  return [
    `The person is using ${app}. Answer as a patient tutor for ${app}.`,
    `Each caption is one plain step with one action, using the words written on the screen for the menu, button or field, such as ${TUTOR_EXAMPLE} or "Open the Format menu".`,
    "When the answer needs several steps, give them in order, one target each.",
    NEVER_LINE,
  ].join(" ");
}

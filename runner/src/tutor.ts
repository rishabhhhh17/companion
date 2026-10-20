// The everyday tutor (M11, everyday apps; F17: the engine works on any app on screen). When the app in front is an everyday
// app Companion knows by name, Show me how and anywhere mode answer as a tutor for that app, in plain steps, never talking
// about projects or code. In a web browser, or an app it does not know, the model decides from the screen, and tools for
// building, hosting or code get the usual answer. Only with "Teach everyday apps in their own words" (showme.everydayTutor) on; off, nothing here
// changes what is asked. The shell names the app in front by its id only, read on the key press (as Prompt help does); the
// model is only ever told a name from the list below, never the id.
import { TERMINALS } from "./prompthelp.ts";

export type AppKind = "coding" | "browser" | "everyday" | "other" | "unknown";
/** everyday: an everyday desktop app Companion knows by name (NAMES below). browser: a web browser, where the page decides.
 *  other: an app Companion does not know, which could as well be a builder's tool, so the screen decides. */
export type Tutor = { kind: "everyday" | "browser" | "other"; app?: string };

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
  // App building for phones, more editors, git apps, and terminals Prompt help does not treat as a coding agent's.
  "com.google.android.studio", "com.apple.iphonesimulator", "com.apple.dt.Instruments", "com.apple.FileMerge", "com.barebones.bbedit",
  "com.macromates.TextMate", "com.coteditor.CotEditor", "org.gnu.Emacs", "com.torusknot.SourceTreeNotMAS", "com.fournova.Tower3",
  "com.fournova.Tower2", "com.DanPristupov.Fork", "com.axosoft.gitkraken", "org.tabby", "com.termius-dmg.mac", "dev.commandline.waveterm",
  "com.raphaelamorim.rio", "dev.kdrag0n.MacVirt",
]);
const BROWSERS = new Set([
  "com.apple.Safari", "com.apple.SafariTechnologyPreview", "com.google.Chrome", "com.google.Chrome.canary", "com.google.Chrome.beta",
  "com.google.Chrome.dev", "org.chromium.Chromium", "company.thebrowser.Browser", "company.thebrowser.dia", "org.mozilla.firefox",
  "org.mozilla.firefoxdeveloperedition", "org.mozilla.nightly", "com.microsoft.edgemac", "com.microsoft.edgemac.Beta", "com.microsoft.edgemac.Dev",
  "com.microsoft.edgemac.Canary", "com.brave.Browser", "com.brave.Browser.beta", "com.brave.Browser.nightly", "com.operasoftware.Opera",
  "com.operasoftware.OperaGX", "com.vivaldi.Vivaldi", "com.kagi.kagimacOS", "app.zen-browser.zen", "com.duckduckgo.macos.browser",
  "org.torproject.torbrowser", "net.waterfox.waterfox", "io.gitlab.librewolf-community",
]);
// A web app added to the Dock from Safari, or installed from a Chromium browser, is a page in that browser.
const BROWSER_PREFIXES = ["com.apple.Safari.WebApp.", "com.google.Chrome.app.", "com.microsoft.edgemac.app.", "com.brave.Browser.app."];
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
  if (BROWSERS.has(id) || BROWSER_PREFIXES.some((p) => id.startsWith(p))) return "browser";
  // Only an app Companion knows by name is taken to be everyday. Any other could be a builder's tool it has not heard of,
  // so it must never be told the person is not building anything.
  return Object.hasOwn(NAMES, id) ? "everyday" : "other";
}

/** The tutor for this app, or null for the usual answer: the setting off (the usual value), a coding or app building
 *  tool, or no app known. */
export function tutorFor(id: unknown, setting: unknown): Tutor | null {
  if (setting !== true) return null;
  const kind = appKind(id);
  if (kind === "everyday") return { kind, app: NAMES[id as string] };
  if (kind === "browser" || kind === "other") return { kind };
  return null;
}

/** The one sentence that names what the tutor never talks about. */
export const NEVER_LINE = "Never talk about projects, code, terminals or deploying: the person is using an everyday app, not building one.";
/** Caption examples for the tutor, in place of the usual ones. */
export const TUTOR_EXAMPLE = '"Click Share"';

/** The tools whose pages and windows are always answered as usual, settings pages included: the shipped lessons run there. */
const BUILDERS = "tools for building, hosting, databases or code (such as Lovable, Vercel, Supabase, GitHub, Replit or Bolt)";

/** What is added to the pointing prompt. A name not on the list is never used (a Tutor built by hand cannot add words). */
export function tutorLines(t: Tutor): string {
  if (t.kind === "browser") {
    return `The app in front is a web browser. Pages of ${BUILDERS}, their settings pages included, are answered as usual. If the page is an everyday web app (mail, documents, spreadsheets, slides, calendars, photos or shopping), answer as a patient tutor for that web app: each caption is one plain step in the page's own words, and never talk about projects or code. Otherwise answer as usual.`;
  }
  const name = t.kind === "everyday" && t.app && Object.values(NAMES).includes(t.app) ? t.app : "";
  // An app Companion does not know by name: the screen decides, as in a browser, and nothing says the person is not building.
  if (!name) {
    return `The app in front is not known by name, so decide from the screen. If it is an everyday app (mail, documents, spreadsheets, slides, calendars, files, photos, a design or photo editor, or a system setting), answer as a patient tutor for it: each caption is one plain step with one action, in the words written on the screen, and never talk about projects or code. If it is one of the ${BUILDERS}, answer as usual.`;
  }
  const app = name;
  return [
    `The person is using ${app}. Answer as a patient tutor for ${app}.`,
    `Each caption is one plain step with one action, using the words written on the screen for the menu, button or field, such as ${TUTOR_EXAMPLE} or "Open the Format menu".`,
    "When the answer needs several steps, give them in order, one target each.",
    NEVER_LINE,
  ].join(" ");
}

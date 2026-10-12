// Settings page helpers: plain words only, so they can be tested without a screen.
export type Inventory = { items: { id: string; label: string; bytes: number }[]; keySaved: boolean; projectsWithNotes: number };
export type PermissionKind = "screen_recording" | "accessibility" | "microphone";
export type PermissionState = "allowed" | "not_allowed" | "not_asked" | "unknown";

/** The exact words the app is given to delete everything. A different string deletes nothing. */
export const DELETE_PHRASE = "delete everything";

export function formatBytes(n: number): string {
  if (n <= 0) return "nothing";
  if (n < 1024) return "under 1 KB";
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 * 1024 * 1024) return `${Math.round(n / (1024 * 1024))} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const ROWS: Record<PermissionKind, { label: string; why: string }> = {
  screen_recording: { label: "Screen Recording", why: "Lets Companion look at your screen once when you press its key, so it can point at what is wrong. Asked the first time you use that." },
  accessibility: { label: "Accessibility", why: "Lets Companion find the exact button or line you need and, if you ask, click it for you. Asked the first time you use that." },
  microphone: { label: "Microphone", why: "Lets you hold the talk keys and speak. It listens only while you hold them. Asked the first time you use that." },
};
export function permissionRow(kind: PermissionKind, s: PermissionState): { label: string; why: string; state: string; button: boolean } {
  const state = s === "allowed" ? "Allowed" : s === "not_allowed" ? "Not allowed" : s === "not_asked" ? "Not asked yet" : "Not checked yet";
  return { ...ROWS[kind], state, button: s === "not_allowed" };
}

export function deletableLines(inv: Inventory): string[] {
  return [...inv.items.map((i) => `${i.label}: ${formatBytes(i.bytes)}`), ...(inv.keySaved ? ["Your saved Claude key (in your Keychain)"] : [])];
}

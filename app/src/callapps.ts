// Apps that count as a call (calls.apps in Settings, the registry T16): the seven call apps the shell knows
// (presentation.rs CALL_APPS), each on or off, and up to twenty more added with Add the app in front. Only bundle ids are
// kept and compared (rule 7). The list stays in one order (the built in ones in the shell's order, then the added ones as
// they were added), so turning one off and on again puts it back exactly as it was. Plain code, tested in
// pointtalk.test.ts; settingsPage.tsx only draws it.
import { S } from "./strings.ts";

export const BUILT_IN_CALL_APPS: readonly { id: string; name: string }[] = ["us.zoom.xos", "com.microsoft.teams2", "com.microsoft.teams", "com.apple.FaceTime", "Cisco-Systems.Spark", "com.webex.meetingmanager", "com.skype.skype"]
  .map((id) => ({ id, name: S.callApps.names[id] ?? id }));
export const MAX_ADDED_CALL_APPS = 20;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const builtIn = (id: string) => BUILT_IN_CALL_APPS.some((b) => same(b.id, id));
const tidy = (on: string[], added: string[]) => [...BUILT_IN_CALL_APPS.map((b) => b.id).filter((id) => on.some((x) => same(x, id))), ...added];

/** Turns one built in call app on or off. */
export function toggleCallApp(list: readonly string[], id: string, on: boolean): string[] {
  const keep = list.filter((x) => builtIn(x) && !same(x, id));
  return tidy(on ? [...keep, id] : keep, list.filter((x) => !builtIn(x)));
}

/** Adds the app in front (its id only). Never twice, never Companion itself, at most twenty added. */
export function addCallApp(list: readonly string[], id: string): { ok: true; list: string[] } | { ok: false; why: "already" | "ownApp" | "full" } {
  if (!id || id.startsWith("dev.companion")) return { ok: false, why: "ownApp" };
  if (list.some((x) => same(x, id)) || builtIn(id)) return builtIn(id) && !list.some((x) => same(x, id)) ? { ok: true, list: toggleCallApp(list, id, true) } : { ok: false, why: "already" };
  const added = list.filter((x) => !builtIn(x));
  if (added.length >= MAX_ADDED_CALL_APPS) return { ok: false, why: "full" };
  return { ok: true, list: [...list, id] };
}

/** What the control shows: each built in app with whether it is on, and each added app with its name. */
export function callAppRows(list: readonly string[], names: Record<string, string>): { builtIn: { id: string; name: string; on: boolean }[]; added: { id: string; name: string }[] } {
  return {
    builtIn: BUILT_IN_CALL_APPS.map((b) => ({ ...b, on: list.some((x) => same(x, b.id)) })),
    added: list.filter((x) => !builtIn(x)).map((id) => ({ id, name: names[id] || id })),
  };
}

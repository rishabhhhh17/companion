// Links on Home: which addresses get an Open button, and the site name shown on it. The same rules as the Mac side
// (share.rs web_link), which checks again before anything is opened: http or https only, a real site name, no name or
// password before the site, no spaces or hidden characters. A look alike site name from another alphabet is shown by its
// real (punycode) name, the name the browser will really go to.
export type WebLink = { url: string; host: string };

// Right to left overrides, zero width spaces, a soft hyphen: they change how text looks without showing.
const HIDDEN = /[­​-‏‪-‮⁠-⁩﻿]/;
// eslint-disable-next-line no-control-regex
const SPACE_OR_CONTROL = /[\s\u0000-\u001f\u007f-\u009f]/;

export function webLink(s: unknown): WebLink | null {
  if (typeof s !== "string" || s.length >= 2048) return null;
  if (!(s.startsWith("https://") || s.startsWith("http://"))) return null;
  if (SPACE_OR_CONTROL.test(s) || HIDDEN.test(s)) return null;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if ((u.protocol !== "https:" && u.protocol !== "http:") || u.username || u.password || !u.hostname) return null;
  return { url: u.href, host: u.hostname };
}

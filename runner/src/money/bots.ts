// M117 step 4: abuse protection. Public sign up, contact, waitlist and comment forms, and sign in routes that check a
// password or a code, with no bot check and no limit. Hosted forms are their service's job and are never flagged; sign in
// services with protection of their own (Clerk, Auth0, Supabase Auth, Firebase Auth) are said as guidance to check it is on,
// never as a pass. Pure: no file is opened here.
import type { MoneyAuth, MoneyForm } from "../../../protocol/index.ts";
import type { Code, Route } from "./routes.ts";
import { lineAt, LEFT_OUT, PAGE, reachable } from "./text.ts";

const BOT_CHECK = /@marsidev\/react-turnstile|react-turnstile|\bcf-turnstile\b|challenges\.cloudflare\.com\/turnstile|turnstile\/v0\/siteverify|\bsiteverify\b|@hcaptcha\/|\bh-captcha\b|\bhcaptcha\b|react-google-recaptcha|\bgrecaptcha\b|recaptcha\/api\.js|recaptcha\/api\/siteverify|\bbotid\/(?:client|server)|\bcheckBotId\s*\(|\bdetectBot\b|\bprotectSignup\b|@friendlycaptcha\/|friendly-challenge|\baltcha\b|\bTurnstile\b|\bReCAPTCHA\b|\bHCaptcha\b/i;
const HOSTED = /formspree\.io|\bdata-netlify\b|\bnetlify(?:=|\s|>)|netlify-honeypot|tally\.so|typeform\.com|docs\.google\.com\/forms|forms\.gle\/|usebasin\.com|getform\.io|formsubmit\.co|web3forms\.com|jotform\.com/i;
const FORM = /<form\b|<Form\b|\bonSubmit\s*=|\buse:enhance\b|\bhandleSubmit\s*\(|\buseForm\s*\(/;
const EMAIL_FIELD = /type\s*=\s*\{?\s*["'](?:email|password)["']|name\s*=\s*\{?\s*["'](?:email|password|e-mail)["']|autoComplete\s*=\s*\{?\s*["'](?:email|new-password|current-password)["']|autocomplete\s*=\s*["'](?:email|new-password|current-password)["']/i;
const KINDS: [MoneyForm, RegExp][] = [
  ["signup", /sign-?up|register|join|create-?account|get-?started/i],
  ["waitlist", /wait-?list|subscribe|newsletter|early-?access|notify-?me/i],
  ["contact", /contact|feedback|support|enquir|inquir|get-?in-?touch/i],
  ["comment", /comment|review|guestbook/i],
];
// Sign in UIs and calls of a service that handles the sign in itself.
const AUTH_UI: [MoneyAuth, RegExp][] = [
  ["clerk", /@clerk\/|<SignUp\b|<SignIn\b/],
  ["auth0", /@auth0\//],
  ["supabase_auth", /@supabase\/auth-ui-|\bsupabase\.auth\.(?:signUp|signInWithPassword|signInWithOtp|signInWithOAuth|resetPasswordForEmail)\b|\.auth\.(?:signUp|signInWithPassword|signInWithOtp)\s*\(/],
  ["firebase_auth", /firebase\/auth|\b(?:createUserWithEmailAndPassword|signInWithEmailAndPassword|sendSignInLinkToEmail)\b/],
  ["better_auth", /\bbetter-auth\b|\bauthClient\.signUp\b|\bauthClient\.signIn\b/],
];
const PASSWORDISH = /\b(?:bcrypt|bcryptjs|argon2|scrypt|verifyPassword|comparePassword|checkPassword|hashPassword|verifyOtp|verifyCode|CredentialsProvider|Credentials\s*\(|password)\b/i;
const AUTH_PATH = /(?:^|\/)(?:login|log-in|signin|sign-in|signup|sign-up|register|auth|password|reset|forgot|otp|magic-link|verify)(?:\/|$|\.)/i;

const PASSWORD_FIELD = /type\s*=\s*\{?\s*["']password["']|autoComplete\s*=\s*\{?\s*["'](?:new|current)-password["']|autocomplete\s*=\s*["'](?:new|current)-password["']/i;
// A page that reads the signed in person's session, or sits in a folder only they reach.
const SESSION_READ = /\bauth\s*\(\s*\)|\bgetServerSession\s*\(|\bcurrentUser\s*\(|\bredirect\s*\(\s*["'`]\/(?:login|log-in|signin|sign-in)\b|\buseSession\s*\(|\buseUser\s*\(|\bgetUser\s*\(\s*\)|\brequireAuth\b|\bwithPageAuthRequired\b/;
const SIGNED_IN_PAGE = /(?:^|\/)\(?(?:settings|account|dashboard|admin)\)?\//i;
/** Is there a page form with a password field anywhere (a sign up or a sign in of the app's own)? */
export function passwordFormIn(code: Code): boolean {
  return Object.entries(code).some(([f, t]) => PAGE.test(f) && !LEFT_OUT.test(f) && FORM.test(t) && PASSWORD_FIELD.test(t));
}

export type Form = { file: string; line: number; form: MoneyForm; posts?: string };
/** The page forms that collect an email or a password, or are named for sign up, a waitlist, contact or comments. Hosted
 *  forms are left out (their service handles them). */
export function formsIn(code: Code): Form[] {
  const out: Form[] = [];
  for (const [f, t] of Object.entries(code)) {
    if (!PAGE.test(f) || LEFT_OUT.test(f) || !FORM.test(t) || HOSTED.test(t)) continue;
    // A sign in service's own form (Clerk's SignUp, Supabase's Auth UI) is that service's job: guidance, never a finding.
    if (/<SignUp\b|<SignIn\b|@supabase\/auth-ui-/.test(t)) continue;
    const posts = /\baction\s*=\s*\{?\s*["'`](\/[^"'`\s${}]*)["'`]/.exec(t)?.[1] ?? /\bfetch\s*\(\s*["'`](\/[^"'`\s${}]*)["'`]\s*,\s*\{[^}]{0,200}method\s*:\s*["']POST["']/is.exec(t)?.[1]
      ?? /\b(?:axios|ky|ofetch|\$fetch)\.post\s*\(\s*["'`](\/[^"'`\s${}]*)["'`]/.exec(t)?.[1];
    // A sign in form (not a sign up) is about tries, checked on its route (authRoutesIn), not here.
    if (/(?:^|\/)(?:log-?in|sign-?in)(?:\/|\.|$)/i.test(f) && !/sign-?up|register/i.test(f)) continue;
    const named = KINDS.find(([, re]) => re.test(f) || (posts ? re.test(posts) : false));
    const field = EMAIL_FIELD.test(t);
    if (!named && !field) continue;
    const form: MoneyForm = named ? named[0] : PASSWORD_FIELD.test(t) ? "signup" : "other";
    // An email form on a page only the signed in reach (settings, an account page) is not public.
    if (form === "other" && (SIGNED_IN_PAGE.test(f) || SESSION_READ.test(t))) continue;
    const at = FORM.exec(t)!;
    out.push({ file: f, line: lineAt(t, at.index), form, ...(posts ? { posts } : {}) });
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

/** Is there a bot check on this file or a project file it imports (two steps)? */
export function botChecked(file: string, code: (f: string) => string | undefined): boolean {
  return reachable(file, code).some((f) => { const t = code(f); return t !== undefined && BOT_CHECK.test(t); });
}

/** The sign in services the project uses, with the first file each is in. */
export function authServicesIn(code: Code): { auth: MoneyAuth; file: string }[] {
  const out: { auth: MoneyAuth; file: string }[] = [];
  for (const [auth, re] of AUTH_UI) {
    const f = Object.keys(code).sort().find((x) => !LEFT_OUT.test(x) && re.test(code[x]));
    if (f) out.push({ auth, file: f });
  }
  return out;
}
/** Is the project's Supabase Auth captcha turned on in supabase/config.toml? Only that file counts; the live project's own
 *  setting cannot be seen. */
export function supabaseCaptchaOn(raw: Code): boolean {
  const t = raw["supabase/config.toml"];
  if (!t) return false;
  const sec = /^\[auth\.captcha\]\s*$([\s\S]*?)(?=^\[|$(?![\s\S]))/m.exec(t);
  return !!sec && /^\s*enabled\s*=\s*true\b/m.test(sec[1]);
}

/** Sign in routes that check a password or a code: their path says sign in, and the route (or what it imports) handles a
 *  password; or it calls a password check. Routes that only hand the sign in to a service (Supabase, Firebase, Clerk,
 *  Better Auth) are that service's job. */
export function authRoutesIn(routes: Route[], code: (f: string) => string | undefined): Route[] {
  return routes.filter((r) => {
    if (r.method === "GET") return false;
    const reach = reachable(r.file, code).map((f) => code(f) ?? "").join("\n");
    const own = code(r.file) ?? "";
    const pathSays = AUTH_PATH.test(r.path ?? "") || AUTH_PATH.test(r.file);
    if (!PASSWORDISH.test(reach)) return false;
    if (!pathSays && !/\b(?:bcrypt|argon2|verifyPassword|comparePassword|checkPassword)\b/.test(own)) return false;
    // A handler of a sign in service that limits its own sign in.
    if (/\bbetter-auth\b|toNextJsHandler|\bsupabase\.auth\.|\bauth\.api\.sign/.test(reach) && !/\b(?:bcrypt|argon2|verifyPassword|comparePassword)\b/.test(reach)) return false;
    return true;
  });
}

/** The services a project's sign up hands its bot protection to. */
export const AUTH_OWN_PROTECTION: readonly MoneyAuth[] = ["clerk", "auth0", "supabase_auth", "firebase_auth"];

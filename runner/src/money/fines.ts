// M117 step 6: the basics that can get an app fined. Accounts or collected emails with no privacy policy page found;
// trackers that set cookies with no cookie consent found; accounts with no way found to delete the account and its data.
// Every finding says "could not find", never "you have none", and every sentence about it ends with the not legal advice
// line (strings.ts). Pure: no file is opened here.
import type { MoneyCookieless, MoneyTracker } from "../../../protocol/index.ts";
import type { Code } from "./routes.ts";
import { depsOf, lineAt, LEFT_OUT } from "./text.ts";

const ACCOUNTS = /\bnext-auth\b|["']@auth\/|["']@clerk\/|\bsupabase\.auth\.(?:signUp|signInWith\w+)|\.auth\.signUp\s*\(|["']@supabase\/(?:ssr|auth-helpers-[\w-]+|auth-ui-react)["']|["']firebase\/auth["']|["']better-auth|["']lucia["']|["']@lucia-auth\/|["']passport["']|["']@kinde-oss\/|["']@auth0\/|\bflask_login\b|\bfastapi_users\b|\bdjango\.contrib\.auth\b|["']@stackframe\/|["']@workos-inc\/authkit/;
const ACCOUNT_DEPS = /^(?:next-auth|@auth\/.+|@clerk\/.+|@supabase\/(?:ssr|auth-helpers-.+|auth-ui-react)|better-auth|lucia|passport|@kinde-oss\/.+|@auth0\/.+|flask-login|fastapi-users|@stackframe\/.+|@workos-inc\/authkit-.+)$/;
const MAILING = /["']@mailchimp\/|["']convertkit|["']@kit\/|\bresend\.contacts\.create\b|\baudiences\.create\b|["']loops["']|["']@loops\/|\bbeehiiv\b|["']@sendgrid\/client["'][\s\S]{0,400}marketing\/contacts/;

/** Does the project have sign in accounts? (By its sign in package or a sign up call.) */
export function accountsOf(code: Code, raw: Code): boolean {
  for (const n of depsOf(raw).keys()) if (ACCOUNT_DEPS.test(n)) return true;
  return Object.entries(code).some(([f, t]) => !LEFT_OUT.test(f) && ACCOUNTS.test(t));
}
/** Does the project add people to a mailing list (a newsletter service)? */
export const mailingListOf = (code: Code): boolean => Object.entries(code).some(([f, t]) => !LEFT_OUT.test(f) && MAILING.test(t));

const PRIVACY_NAME = /(?:^|\/)(?:privacy|privacy-policy|privacypolicy|privacy_policy|datenschutz|datenschutzerklaerung|politique-de-confidentialite|confidentialite|privacidad|politica-de-privacidad|politica-de-privacidade|privacybeleid|informativa-privacy)(?:\/|\.|$)/i;
const PRIVACY_LINK = /href\s*=\s*\{?\s*["'`][^"'`]*(?:privacy|datenschutz|confidentialite|privacidad)[^"'`]*["'`]|termly\.io|iubenda\.com|getterms\.io|termsfeed\.com|>\s*Privacy(?:\s+Policy)?\s*</i;
// A page file: a page (jsx, tsx, vue, svelte, astro, html), a Markdown page, a framework's page file, or a file in a page
// folder. A code helper named privacy (lib/privacy.ts) is not a page.
const PAGE_FILE = /\.(?:[jt]sx|vue|svelte|astro|html?|mdx?)$|(?:^|\/)\+?page\.[\w.]+$|(?:^|\/)(?:pages|routes|public)\//i;
const privacyFile = (f: string) => PRIVACY_NAME.test(f) && PAGE_FILE.test(f);
/** Where a privacy policy page is: a page named so in any page folder, a privacy.html or .md, a link to one, or a hosted
 *  policy. Null when none is found. */
export function privacyPageOf(code: Code): { file: string; line?: number } | null {
  const files = Object.keys(code).sort();
  const page = files.find((f) => privacyFile(f) && !/(^|\/)(node_modules|tests?|__tests__)\//.test(f));
  if (page) return { file: page };
  for (const f of files) { if (LEFT_OUT.test(f)) continue; const m = PRIVACY_LINK.exec(code[f]); if (m) return { file: f, line: lineAt(code[f], m.index) }; }
  return null;
}
/** A privacy page that asks people to email to have their data deleted. */
export function deleteByEmailOf(code: Code): boolean {
  return Object.keys(code).some((f) => privacyFile(f) && /\b(?:delet\w*|eras\w*|remov\w*)\b[^.\n]{0,120}\b(?:e-?mail|contact us|write to us)\b|\b(?:e-?mail|contact us|write to us)\b[^.\n]{0,120}\b(?:delet\w*|eras\w*|remov\w*)\b/i.test(code[f]));
}

const TRACKERS: [MoneyTracker, RegExp][] = [
  ["google_analytics", /\bgtag\s*\(|googletagmanager\.com|@next\/third-parties\/google|<GoogleAnalytics\b|<GoogleTagManager\b|["']react-ga4?["']|["']nuxt-gtag["']|["']vue-gtag(?:-next)?["']|@analytics\/google-analytics|google-analytics\.com\/analytics\.js/],
  ["google_ads", /googleadservices\.com|googlesyndication\.com|["']AW-\d+/],
  ["meta_pixel", /\bfbq\s*\(|connect\.facebook\.net|["']react-facebook-pixel["']|["']@meta\/pixel/],
  ["posthog", /["']posthog-js(?:\/react)?["']|\bi\.posthog\.com\/static\/array\.js/],
  ["mixpanel", /["']mixpanel-browser["']|cdn\.mxpnl\.com/],
  ["hotjar", /["']@hotjar\/browser["']|static\.hotjar\.com|["']react-hotjar["']/],
  ["segment", /["']@segment\/analytics-next["']|cdn\.segment\.com|["']@segment\/analytics\.js/],
  ["amplitude", /["']@amplitude\/(?:analytics-browser|unified|analytics-react-native)["']|["']amplitude-js["']|cdn\.amplitude\.com/],
  ["heap", /cdn\.heapanalytics\.com|heap-api\.com|\bheap\.load\s*\(/],
  ["clarity", /clarity\.ms\/tag|["']@microsoft\/clarity["']/],
  ["linkedin", /snap\.licdn\.com|_linkedin_partner_id/],
  ["tiktok", /analytics\.tiktok\.com|\bttq\.load\s*\(/],
  ["chat_widget", /widget\.intercom\.io|["']@intercom\/messenger-js-sdk["']|["']react-use-intercom["']|client\.crisp\.chat|["']crisp-sdk-web["']|embed\.tawk\.to|js\.driftt\.com/],
];
const COOKIELESS: [MoneyCookieless, RegExp][] = [
  ["plausible", /plausible\.io\/js|["']next-plausible["']|["']plausible-tracker["']|["']@plausible-analytics\//],
  ["fathom", /["']fathom-client["']|cdn\.usefathom\.com|["']@fathom-analytics\//],
  ["simple_analytics", /simpleanalyticscdn\.com|["']@simpleanalytics\//],
  ["umami", /\bumami\b[\s\S]{0,200}data-website-id|data-website-id[\s\S]{0,200}\bumami\b|["']@umami\//],
  ["vercel_analytics", /["']@vercel\/analytics(?:\/[\w-]+)?["']/],
  ["cloudflare_analytics", /static\.cloudflareinsights\.com\/beacon/],
  ["pirsch", /api\.pirsch\.io|["']pirsch-sdk["']/],
];
// PostHog set to keep nothing in cookies does not need a yes for cookies.
const POSTHOG_NO_COOKIES = /\bpersistence\s*:\s*["']memory["']|\bcookieless_mode\s*:|\bdisable_persistence\s*:\s*true/;

/** The trackers that set cookies, each once with its first place, and the cookieless ones by name. */
export function trackersOf(code: Code): { trackers: { tracker: MoneyTracker; file: string; line: number }[]; cookieless: MoneyCookieless[] } {
  const trackers: { tracker: MoneyTracker; file: string; line: number }[] = [];
  const cookieless = new Set<MoneyCookieless>();
  const files = Object.keys(code).filter((f) => !LEFT_OUT.test(f) && !/(^|\/)package\.json$/.test(f)).sort();
  const noCookies = files.some((f) => POSTHOG_NO_COOKIES.test(code[f]));
  for (const [id, re] of TRACKERS) {
    if (id === "posthog" && noCookies) continue;
    for (const f of files) { const m = re.exec(code[f]); if (m) { trackers.push({ tracker: id, file: f, line: lineAt(code[f], m.index) }); break; } }
  }
  for (const [id, re] of COOKIELESS) if (files.some((f) => re.test(code[f]))) cookieless.add(id);
  return { trackers, cookieless: [...cookieless] };
}

const CONSENT_TOOLS = /["']vanilla-cookieconsent["']|["']react-cookie-consent["']|["']@c15t\/|["']c15t["']|consent\.cookiebot\.com|\bCookiebot\b|cdn-cookieyes\.com|\bcookieyes\b|cdn\.cookielaw\.org|\bOneTrust\b|cmp\.osano\.com|\bosano\b|app\.termly\.io\/(?:embed|resource-blocker)|\biubenda\b|\bklaro\b|\busercentrics\b|\bdidomi\b|["']@consent-manager\/|["']cookieconsent["']|["']react-cookie-banner["']|["']@porscheofficial\/cookie-consent-banner-react["']/i;
const CONSENT_DEPS = /^(?:vanilla-cookieconsent|react-cookie-consent|@c15t\/.+|c15t|cookieconsent|@cookiehub\/.+|react-cookie-banner|klaro|@usercentrics\/.+|@didomi\/.+|@iubenda\/.+|@osano\/.+)$/;
const CONSENT_MODE = /\bgtag\s*\(\s*["']consent["']\s*,\s*["']default["']|\bopt_out_capturing_by_default\s*:\s*true|\bopt_out_tracking_by_default\s*:\s*true/;
// A tracker started only after a consent check written in code (an if, && or ? on a setting): the setting's name says
// consent, accepted or allowed, and cookies, analytics or tracking (termsConsent is about something else).
const CHECKED = /\bif\s*\(\s*!?\s*\(?\s*([\w.$]+)|([\w.$]+)\s*(?:&&|\?(?![.?]))|&&\s*!?\s*\(?\s*([\w.$]+)/g;
const isConsentName = (n: string) => /consent|accept|allow|opt_?in/i.test(n) && /cookie|analytic|tracking|tracker/i.test(n);

/** Is there cookie consent for the whole project: a consent tool, Google's Consent Mode default, or a tracker set to wait
 *  for an opt in? */
export function consentOf(code: Code, raw: Code): boolean {
  for (const n of depsOf(raw).keys()) if (CONSENT_DEPS.test(n)) return true;
  return Object.entries(code).some(([f, t]) => !LEFT_OUT.test(f) && (CONSENT_TOOLS.test(t) || CONSENT_MODE.test(t)));
}
/** Is a tracker started only after a cookie consent check in its own file? */
export function codedConsentIn(text: string): boolean {
  for (const m of text.matchAll(CHECKED)) { const n = m[1] ?? m[2] ?? m[3]; if (n && isConsentName(n)) return true; }
  return false;
}

const DELETE_WAYS = /<UserProfile\b|<AccountView\b|\busers\.deleteUser\s*\(|\bauth\.admin\.deleteUser\s*\(|\bdeleteUser\s*\(|\buser\.delete\s*\(\s*\)|\bcurrentUser\.delete\s*\(|\busers\.delete\s*\(|\bmanagement\.users\.delete\b|\bdeleteAccount\b|\bdelete_account\b|\bdeleteMyAccount\b|\bcloseAccount\b|\bdelete_user\b|\bprisma\.(?:user|users|account|profile)\.delete(?:Many)?\s*\(|\bDELETE\s+FROM\s+["'`]?(?:public\.)?(?:users|profiles|accounts)\b|\bdb\.delete\s*\(\s*(?:users|user|profiles|accounts)\b|\.from\s*\(\s*["'](?:users|profiles|accounts)["']\s*\)\s*\.delete\s*\(|\bdeleteUser\s*:\s*\{\s*enabled\s*:\s*true|\bUser\.objects\.filter\([^)]*\)\.delete\(|\buser\.delete\(\)/;
const DELETE_PATH = /(?:^|\/)(?:delete-account|delete_account|deleteAccount|close-account|account-delete|delete-user|delete-me)(?:\/|\.|$)/i;
/** Where a way to delete an account is: a sign in service's account page that has it, a delete call, or a route named so. */
export function deleteAccountOf(code: Code): { file: string; line?: number } | null {
  const files = Object.keys(code).filter((f) => !LEFT_OUT.test(f)).sort();
  const path = files.find((f) => DELETE_PATH.test(f));
  if (path) return { file: path };
  for (const f of files) { const m = DELETE_WAYS.exec(code[f]); if (m) return { file: f, line: lineAt(code[f], m.index) }; }
  return null;
}

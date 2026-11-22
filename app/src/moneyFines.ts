// M117, money and fines before you go live: the rows the go live panel and the report show, and the Copy for my AI text,
// made on the page from the engine's ids, files, lines, methods and route paths (protocol/money.ts) and the fixed words in
// strings.ts. Nothing here is a pass: the most a row says is None seen, with how much was read, drawn in the Not checked
// colour. Copy for my AI is fixed words with only the places filled in, each place cleaned to one line and quoted, so a
// file name can never carry an instruction. No model, no network, no file read. Pure.
import { isMoneyOff, MONEY_FAMILIES, MONEY_FAMILY_OF, MONEY_TOLD_KINDS, moneyToldLine, type MoneyFamily, type MoneyFinding, type MoneyPart, type MoneyReport, type MoneyToldKind } from "../../protocol/index.ts";
import { S } from "./strings.ts";

export type MoneyMark = "look" | "unsure" | "skip" | "noneSeen" | "notNeeded";
export type MoneyRow = {
  key: string; family: MoneyFamily; mark: MoneyMark; head: string; lines: string[];
  /** Copy for my AI, for a finding; Copy this list, for the spending list. */
  copy?: string; copyList?: string;
  /** "I set this up outside the code" may be pressed for this row (a route or a form), with what it saves. */
  told?: { kind: MoneyToldKind; file: string; line: string };
  /** The person already said so: the row says they did, and that it could not be seen. */
  toldSaid?: boolean;
  /** Also listed under What was not checked. */
  notChecked?: boolean;
};
export type MoneyView = { off: boolean; rows: MoneyRow[]; findings: number; about: string[] };

const M = S.money;
const name = (xs: readonly string[], words: Record<string, string>) => M.list([...new Set(xs)].map((x) => words[x] ?? x));
const sendFamily = (services: readonly string[]): "email" | "sms" | "both" => {
  const sms = services.some((s) => ["twilio", "sns", "vonage", "plivo"].includes(s)), email = services.some((s) => !["twilio", "sns", "vonage", "plivo"].includes(s));
  return sms && email ? "both" : sms ? "sms" : "email";
};
const AI = new Set(["openai", "anthropic", "google_ai", "replicate", "groq", "mistral", "cohere", "together", "fal", "huggingface", "deepgram", "assemblyai", "elevenlabs", "openrouter", "other_ai"]);
const isAi = (f: MoneyFinding) => (f.services ?? []).some((s) => AI.has(s));

/** A place from the project as it may stand in a line: one line, no code marks, no control characters, short. */
export function cleanPlace(s: string): string {
  const t = Array.from(s.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/[`<>]/g, "").replace(/\s+/g, " ").trim());
  return t.length > 200 ? `${t.slice(0, 199).join("")}…` : t.join("");
}
const whereOf = (f: MoneyFinding) => (f.file ? M.where(cleanPlace(f.file), f.line) : "");
const routeOf = (f: MoneyFinding) => (f.path ? M.route(f.method, cleanPlace(f.path)) : "");

/** The head and the why of one finding. */
export function findingWords(f: MoneyFinding, r: Pick<MoneyReport, "accounts" | "emails">): { head: string; why: string } {
  const services = f.services ?? [];
  switch (f.kind) {
    case "paid_route_open":
      return isAi(f) ? { head: M.head.ai, why: M.why.ai(name(services.filter((s) => AI.has(s)), M.service)) } : { head: M.head.send(M.sendWhat[sendFamily(services)]), why: M.why.send(name(services, M.service)) };
    case "heavy_route_open": return { head: M.head.heavy, why: M.why.heavy };
    case "form_open": return { head: M.head.form(M.form[f.form ?? "other"]), why: services.length ? M.why.formSends(name(services, M.service)) : M.why.form };
    case "auth_open": return { head: M.head.auth, why: M.why.auth };
    case "no_privacy_page": return { head: M.head.privacy, why: M.why.privacy(M.collects[collects(r)]) };
    case "tracker_no_consent": return { head: M.head.tracker(name(f.trackers ?? [], M.tracker)), why: M.why.tracker };
    case "no_delete_account": return { head: M.head.deleteAccount, why: M.why.deleteAccount };
  }
}
const collects = (r: Pick<MoneyReport, "accounts" | "emails">): "accounts" | "emails" | "both" => (r.accounts && r.emails ? "both" : r.accounts ? "accounts" : "emails");

/** Copy for my AI for one finding: fixed words, the finding's place quoted, the framework's hint by its id, and the same
 *  three closing lines every time. */
export function moneyCopy(f: MoneyFinding, r: Pick<MoneyReport, "accounts" | "emails">): string {
  const C = M.copy;
  const place = (x: MoneyFinding) => `> ${C.place(whereOf(x), routeOf(x), x.services?.length && (x.kind === "paid_route_open" || x.kind === "heavy_route_open") ? C.calls(name(x.services, M.service)) : "")}`;
  const hint = f.framework && C.hint[f.framework] ? [`${C.hintLead} ${C.hint[f.framework]}.`] : [];
  let body: string[];
  switch (f.kind) {
    case "paid_route_open": body = [C.rate, C.quoted, place(f), C.rateAsk, ...hint]; break;
    case "heavy_route_open": body = [C.heavy, C.quoted, place(f), C.rateAsk, ...hint]; break;
    case "form_open": case "auth_open": body = [C.abuse, C.quoted, place(f), C.abuseAsk]; break;
    case "no_privacy_page": body = [C.privacy(M.collects[collects(r)]), C.privacyAsk]; break;
    case "tracker_no_consent": body = [C.tracker(name(f.trackers ?? [], M.tracker)), C.quoted, place(f), C.trackerAsk]; break;
    case "no_delete_account": body = [C.deleteAccount, C.deleteAsk]; break;
  }
  return [...body, "", ...C.end].join("\n");
}

/** The spending list, for the person's own notes. */
export function paidListText(r: MoneyReport): string {
  return [M.listTitle, ...r.paid.map((p) => `- ${M.paidAt(M.service[p.service] ?? p.service, M.where(cleanPlace(p.file), p.line), M.whereToLook[p.service] ?? M.whereElse)}`), "", M.paidWhy].join("\n");
}

const unsureWords = (u: MoneyReport["unsure"][number]) => M.unsureHead(M.family[u.family].toLowerCase(), (M.unsureWhy[u.why] as (x?: unknown) => string)(u.why === "unknown_framework" ? u.name : u.count));

/** Every row of the part, by family, in a fixed order: rate, abuse, spend, fines. */
export function moneyView(part: MoneyPart | null | undefined): MoneyView {
  if (!part) return { off: true, rows: [], findings: 0, about: [] };
  if (isMoneyOff(part)) return { off: true, rows: [{ key: "off", family: "rate", mark: "skip", head: M.off, lines: [], notChecked: true }], findings: 0, about: [] };
  const r = part;
  const rows: MoneyRow[] = [];
  const seen = (fam: MoneyFamily) => r.seen.find((x) => x.family === fam);
  const fws = (fam: MoneyFamily) => M.list([...new Set((seen(fam)?.frameworks ?? []).map((f) => M.framework[f] ?? f))]);
  for (const fam of MONEY_FAMILIES) {
    const mine = r.findings.filter((f) => MONEY_FAMILY_OF[f.kind] === fam);
    for (const [i, f] of mine.entries()) {
      const w = findingWords(f, r);
      const lines = [whereOf(f) + (routeOf(f) ? ` (${routeOf(f)})` : ""), w.why].filter(Boolean);
      if (fam === "rate") lines.push(M.dashboard);
      if (f.kind === "tracker_no_consent" && (f.trackers ?? []).includes("google_analytics")) lines.push(M.gtm);
      if (f.told) lines.push(M.told);
      const toldKind = (MONEY_TOLD_KINDS as readonly string[]).includes(f.kind) ? (f.kind as MoneyToldKind) : null;
      const line = toldKind && f.file ? moneyToldLine(toldKind, f.file) : null;
      rows.push({ key: `${f.kind}:${f.file ?? ""}:${f.line ?? 0}:${i}`, family: fam, mark: "look", head: w.head, lines, copy: moneyCopy(f, r), ...(line && toldKind && !f.told ? { told: { kind: toldKind, file: f.file!, line } } : {}), ...(f.told ? { toldSaid: true } : {}) });
    }
    if (fam === "abuse") for (const g of r.guides ?? []) rows.push({ key: `guide:${g.auth}`, family: fam, mark: "skip", head: M.guide[g.auth], lines: [M.where(cleanPlace(g.file)), M.guideLine] });
    if (fam === "spend" && r.paid.length) {
      rows.push({ key: "paid", family: fam, mark: "skip", head: M.paidHead(name(r.paid.map((p) => p.service), M.service)), lines: [...r.paid.map((p) => M.paidAt(M.service[p.service] ?? p.service, M.where(cleanPlace(p.file), p.line), M.whereToLook[p.service] ?? M.whereElse)), M.paidWhy], copyList: paidListText(r) });
    }
    if (fam === "fines") {
      // Not needed only when everything was read (a part that could not be checked may hold the accounts), and never beside
      // a tracker finding: trackers collect personal data of their own.
      if (!r.accounts && !r.emails && !r.unsure.some((u) => u.family === "fines") && !r.findings.some((f) => f.kind === "tracker_no_consent")) rows.push({ key: "notNeeded", family: fam, mark: "notNeeded", head: M.notNeeded, lines: [] });
      if (r.deleteByEmail) rows.push({ key: "deleteByEmail", family: fam, mark: "noneSeen", head: M.deleteByEmail, lines: [M.notLegal] });
      if (r.cookieless?.length) rows.push({ key: "cookieless", family: fam, mark: "noneSeen", head: M.cookieless(name(r.cookieless, M.cookielessName)), lines: [] });
    }
    const unsure = r.unsure.filter((u) => u.family === fam);
    for (const [i, u] of unsure.entries()) rows.push({ key: `unsure:${fam}:${u.why}:${i}`, family: fam, mark: "unsure", head: unsureWords(u), lines: [M.unsureLine], notChecked: true });
    const said = rows.some((x) => x.family === fam && (x.mark === "look" || x.key === "paid" || x.key === "notNeeded" || x.key.startsWith("guide:")));
    if (!said && !unsure.some((u) => u.why === "check_failed")) {
      const s = seen(fam);
      const what = fam === "rate" ? (s?.routes ? M.seenRoutes(s.routes, s.files, fws("rate")) : M.noRoutes) : fam === "abuse" ? M.seenForms(s?.files ?? 0, s?.routes ?? 0) : M.seenFiles(s?.files ?? 0);
      rows.push({ key: `none:${fam}`, family: fam, mark: "noneSeen", head: fam === "spend" ? M.noPaid(s?.files ?? 0) : M.noneSeen(what), lines: [M.noneSeenLine] });
    }
  }
  return { off: false, rows, findings: r.findings.length, about: [M.about, M.followed] };
}

/** The family heading of a row (the panel and the report group by it). */
export const familyTitle = (f: MoneyFamily): string => M.family[f];

// What memory may hold. Health, money, relationships, moods, secrets and contact details are never saved (rule 15).
// This is code, not a promise: every line goes through here before it is written, from every source.
import { redact } from "../redact.ts";

export type Screen = { ok: true } | { ok: false; reason: string };
export const MAX_LINE = 300;

const HEALTH = /\b(health|medical|medication|medicine|diagnos\w*|illness|disease|depress\w*|anxiety|anxious|therap\w*|psychiatr\w*|doctor|hospital|clinic|pregnan\w*|cancer|diabet\w*|disorder|adhd|autis\w*|symptom\w*|surgery|disabilit\w*|chronic|panic|insomnia|migraine|injur\w*|sick|ill)\b/i;
const MONEY = /\b(salary|salaries|income|earns?|earning\w*|debt|loan|mortgage|bank(?:\s+account)?|credit\s+card|savings?|saving\s+for|paycheck|payslip|net\s+worth|bankrupt\w*|tax\s+return|rent|my\s+budget|can't\s+afford|cannot\s+afford|broke)\b/i;
const RELATIONSHIP = /\b(wife|husband|spouse|girlfriend|boyfriend|partner's|fianc\w+|divorc\w*|dating|married|marriage|breakup|break-up|my\s+(?:mom|mum|dad|mother|father|son|daughter|brother|sister|kids?|children|family|ex)|his\s+(?:wife|girlfriend|kids?)|her\s+(?:husband|boyfriend|kids?)|kids?|children|family|lives\s+with|ex-?\s?(?:wife|husband|girlfriend|boyfriend|partner))\b/i;
const MOOD = /\b(mood|moody|stress\w*|anxious|depress\w*|sad|angry|upset|overwhelm\w*|frustrat\w*|burn(?:ed|t)?[\s-]?out|burnout|lonely|exhaust\w*|worried|worry|nervous|tearful|crying|miserable|feel(?:s|ing)?\s+(?:bad|good|low|down|great|terrible|awful|better|worse|like)|(?:i'?m|i\s+am|is|are|feeling|feels)\s+(?:happy|excited|thrilled|hopeless|stuck|lost|scared|afraid))\b/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(?:\+?\d[\s().-]?){9,}/;

export function screenLine(text: string): Screen {
  const t = (text ?? "").trim();
  if (!t) return { ok: false, reason: "There is nothing to save." };
  if (t.length > MAX_LINE) return { ok: false, reason: "That is too long for one memory line." };
  if (redact(t) !== t) return { ok: false, reason: "That looks like a key or password, so it is never saved." };
  if (EMAIL.test(t) || PHONE.test(t)) return { ok: false, reason: "Contact details are never saved." };
  if (HEALTH.test(t)) return { ok: false, reason: "Health is never saved." };
  if (MONEY.test(t)) return { ok: false, reason: "Money matters are never saved." };
  if (RELATIONSHIP.test(t)) return { ok: false, reason: "Relationships are never saved." };
  if (MOOD.test(t)) return { ok: false, reason: "Moods are never saved." };
  return { ok: true };
}

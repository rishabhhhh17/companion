// Research: look things up for the project and file cited notes. Only notes with a real web source are kept.
export type Note = { text: string; source: string };
export type Research = { title: string; answer: string; notes: Note[] };

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

// Only plain web pages on the open internet. Never this Mac, a home network, a cloud metadata address, or a login in the address.
export function isSafeUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (h.startsWith("[")) return false;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224) return false;
  }
  return true;
}

export function parseResearch(text: string): Research | null {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let j: any;
  try { j = JSON.parse(text.slice(a, b + 1)); } catch { return null; }
  const title = typeof j?.title === "string" ? clean(j.title) : "";
  const answer = typeof j?.answer === "string" ? clean(j.answer) : "";
  if (!title || !answer || !Array.isArray(j?.notes)) return null;
  const seen = new Set<string>();
  const notes: Note[] = [];
  for (const n of j.notes) {
    const t = typeof n?.text === "string" ? clean(n.text) : "";
    const s = typeof n?.source === "string" ? n.source.trim() : "";
    if (!t || !isSafeUrl(s)) continue;     // no usable source, no note
    const key = `${t}|${s}`;
    if (seen.has(key)) continue;
    seen.add(key); notes.push({ text: t, source: s });
  }
  return notes.length ? { title, answer, notes } : null;
}

export const researchPrompt = (question: string) =>
  `Research this for a person building a project. Use read only tools and the web; do not change anything in the project.

Reply with ONLY a JSON object:
{"title": "a short title",
 "answer": "the answer in a few plain sentences",
 "notes": [{"text": "one useful fact, in plain words", "source": "https://the-page-you-got-it-from"}]}
Every note must have a source address starting with https. Leave out anything you cannot source.

Question: ${question}`;

export function noteFileName(title: string, date: Date, exists: (file: string) => boolean): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/g, "") || "notes";
  const day = date.toISOString().slice(0, 10);
  let name = `${day}-${slug}.md`;
  for (let i = 2; exists(name); i++) name = `${day}-${slug}-${i}.md`;
  return name;
}

export function notesMarkdown(question: string, r: Research, date: Date): string {
  return [`# ${r.title}`, "", `Asked on ${date.toISOString().slice(0, 10)}: ${question}`, "", r.answer, "", "## Notes", "", ...r.notes.flatMap((n) => [`- ${n.text}`, `  Source: ${n.source}`]), ""].join("\n");
}

// Google Drive over its REST API: search files by name or words inside, and read one as text. With the per file scope the
// plan asks for, Google only shows the files the person opened or picked with the app, so that is all these can see.
import { cap, type GoogleClient } from "./core.ts";

const API = "https://www.googleapis.com/drive/v3";
export const DRIVE_MAX_RESULTS = 20;
export const DRIVE_TEXT_MAX = 20_000;
/** Plain files bigger than this are not downloaded at all. */
export const DRIVE_DOWNLOAD_MAX = 5_000_000;

type File = { id?: string; name?: string; mimeType?: string; modifiedTime?: string; size?: string };

/** Google's own formats and what each is exported as. */
export const EXPORTS: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};
const TEXTLIKE = /^(text\/|application\/(json|xml|csv|x-yaml|yaml|javascript|x-sh)$)/;

/** Drive's query language wants single quotes and backslashes escaped inside a quoted string. */
const quoted = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

export async function driveSearch(c: GoogleClient, query: string, max?: number): Promise<string> {
  const n = Math.max(1, Math.min(Math.floor(max ?? 10), DRIVE_MAX_RESULTS));
  const words = query.trim();
  const q = words ? `(name contains ${quoted(words)} or fullText contains ${quoted(words)}) and trashed = false` : "trashed = false";
  const url = `${API}/files?q=${encodeURIComponent(q)}&pageSize=${n}&fields=${encodeURIComponent("files(id,name,mimeType,modifiedTime)")}`;
  const res = await c.json<{ files?: File[] }>(url);
  const files = (res.files ?? []).slice(0, n);
  if (files.length === 0) return `No files matched "${words}" in the ${c.account.label} Drive (only files opened or picked with this app are visible).`;
  const lines = files.map((f, i) => `${i + 1}. ${f.name ?? "(no name)"}\n   id: ${f.id}\n   type: ${f.mimeType}\n   modified: ${f.modifiedTime ?? ""}`);
  return `${files.length} file${files.length === 1 ? "" : "s"} in the ${c.account.label} Drive:\n\n${lines.join("\n\n")}`;
}

export async function driveRead(c: GoogleClient, id: string): Promise<string> {
  const fid = encodeURIComponent(id);
  const f = await c.json<File>(`${API}/files/${fid}?fields=${encodeURIComponent("id,name,mimeType,size")}`);
  const name = f.name ?? "(no name)";
  const type = f.mimeType ?? "unknown";
  const head = `name: ${name}\ntype: ${type}`;
  const exportAs = EXPORTS[type];
  let text: string;
  if (exportAs) {
    text = await c.text(`${API}/files/${fid}/export?mimeType=${encodeURIComponent(exportAs)}`);
  } else if (TEXTLIKE.test(type)) {
    if (Number(f.size ?? 0) > DRIVE_DOWNLOAD_MAX) return `${head}\n\nThis file is too big to read here (over ${DRIVE_DOWNLOAD_MAX / 1_000_000} MB).`;
    text = await c.text(`${API}/files/${fid}?alt=media`);
  } else {
    return `${head}\n\nThis kind of file cannot be read as text here, so only its name and type are shown.`;
  }
  return `${head}\n\n${cap(text.trim(), DRIVE_TEXT_MAX, "file")}`;
}

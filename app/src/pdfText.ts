// M76: a small PDF writer of our own, for the go live report (goLiveReport.ts). No new dependency: text pages only, in the
// PDF's own built in Helvetica (every PDF reader has it), wrapped to the page, with headings, coloured marks and thin rules.
// What it writes is plain and checkable: a header, numbered objects, a cross reference table with exact byte offsets and a
// trailer. Tested in m76.test.ts by reading that structure back. Nothing here reads files or the network.

export type Rgb = [number, number, number];
/** One block of the page. mark: a short coloured word before the text ("Passed"), in its own colour. */
export type PdfBlock =
  | { kind: "title" | "h" | "p" | "muted" | "small"; text: string; color?: Rgb }
  | { kind: "row"; mark: string; markColor: Rgb; text: string; sub?: string[] }
  | { kind: "rule" }
  | { kind: "gap" };

const W = 595.28, H = 841.89, M = 56;
// Helvetica's widths (its AFM), in thousandths of the size, for the printable ASCII characters 32 to 126.
const WIDTHS = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const charW = (c: string, bold: boolean) => { const n = c.charCodeAt(0); return ((n >= 32 && n <= 126 ? WIDTHS[n - 32]! : 556) * (bold ? 1.06 : 1)) / 1000; };
export const textWidth = (s: string, size: number, bold = false) => Array.from(s).reduce((a, c) => a + charW(c, bold), 0) * size;

/** Only what the built in font can show (Latin 1). Curly quotes and dashes become plain ones; anything else a "?". */
export function pdfSafe(s: string): string {
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/·/g, "-")
    .replace(/[\r\n\t]+/g, " ").replace(/[^\x20-\x7E\xA0-\xFF]/gu, "?");
}
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

/** Words wrapped to a width; a word longer than the line is cut. */
export function wrap(text: string, size: number, width: number, bold = false): string[] {
  const out: string[] = [];
  let cur = "";
  for (const word of pdfSafe(text).split(" ").filter(Boolean)) {
    let w = word;
    while (textWidth(w, size, bold) > width) {
      let n = w.length; while (n > 1 && textWidth(w.slice(0, n), size, bold) > width) n--;
      if (cur) { out.push(cur); cur = ""; }
      out.push(w.slice(0, n)); w = w.slice(n);
    }
    const next = cur ? `${cur} ${w}` : w;
    if (textWidth(next, size, bold) > width && cur) { out.push(cur); cur = w; } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

const STYLE = { title: { size: 22, bold: true, lead: 28 }, h: { size: 13, bold: true, lead: 18 }, p: { size: 10.5, bold: false, lead: 14.5 }, muted: { size: 10.5, bold: false, lead: 14.5 }, small: { size: 8.5, bold: false, lead: 12 } };
const rgb = (c: Rgb) => c.map((x) => (Math.round(x * 1000) / 1000).toString()).join(" ");

/** The pages' drawing commands. ink and muted: the words' colours; line: the rules'. */
export function layout(blocks: PdfBlock[], ink: Rgb, muted: Rgb, line: Rgb, more: string): string[] {
  const pages: string[][] = [[]];
  let y = H - M;
  const page = () => pages[pages.length - 1]!;
  const room = (h: number) => { if (y - h < M + 24) { pages.push([]); y = H - M; text(pdfSafe(more), 8.5, false, muted, M, y); y -= 18; } };
  const text = (s: string, size: number, bold: boolean, c: Rgb, x: number, at: number) => page().push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${rgb(c)} rg ${x.toFixed(2)} ${at.toFixed(2)} Td (${esc(s)}) Tj ET`);
  for (const b of blocks) {
    if (b.kind === "gap") { y -= 8; continue; }
    if (b.kind === "rule") { room(12); page().push(`${rgb(line)} RG 0.75 w ${M} ${(y - 4).toFixed(2)} m ${(W - M).toFixed(2)} ${(y - 4).toFixed(2)} l S`); y -= 14; continue; }
    if (b.kind === "row") {
      const st = STYLE.p, markW = 78, width = W - 2 * M - markW;
      const lines = wrap(b.text, st.size, width, true);
      const subs = (b.sub ?? []).flatMap((s) => wrap(s, st.size, width));
      room(st.lead * Math.min(3, lines.length + subs.length) + 4);
      text(pdfSafe(b.mark), 9, true, b.markColor, M, y - st.size);
      for (const l of lines) { room(st.lead); text(l, st.size, true, ink, M + markW, y - st.size); y -= st.lead; }
      for (const l of subs) { room(st.lead); text(l, st.size, false, muted, M + markW, y - st.size); y -= st.lead; }
      y -= 6;
      continue;
    }
    const st = STYLE[b.kind];
    if (b.kind === "h") y -= 6;
    const lines = wrap(b.text, st.size, W - 2 * M, st.bold);
    for (const l of lines) { room(st.lead); text(l, st.size, st.bold, b.color ?? (b.kind === "muted" || b.kind === "small" ? muted : ink), M, y - st.size); y -= st.lead; }
    y -= b.kind === "title" ? 6 : 4;
  }
  return pages.map((p) => p.join("\n"));
}

/** The whole PDF file. Every byte is one character below 256, so offsets are counted in characters. */
export function pdfDoc(blocks: PdfBlock[], o: { ink: Rgb; muted: Rgb; line: Rgb; title: string; more: string }): Uint8Array {
  const pages = layout(blocks, o.ink, o.muted, o.line, o.more);
  const objs: string[] = [];
  const n = pages.length;
  // 1 catalog, 2 page tree, 3 and 4 the fonts, 5 the information, then each page and its drawing.
  const pageIds = pages.map((_, i) => 6 + i * 2);
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  objs.push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${n} >>`);
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  objs.push(`<< /Title (${esc(pdfSafe(o.title))}) /Producer (${esc(pdfSafe(o.title))}) >>`);
  pages.forEach((content, i) => {
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageIds[i]! + 1} 0 R >>`);
    objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  objs.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((x) => `${String(x).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

/** "#0F7B4F" as the PDF's 0 to 1 colour. Anything else is black. */
export function hexRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const v = parseInt(m[1]!, 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

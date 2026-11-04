// Draws the visual receipt: the page as it is now, with what changed circled. Done in the hidden browser, from two
// pictures of the app being built (never the person's screen). When the words and buttons on the page are the same but
// it looks different (a colour, a size), the two pictures themselves are compared instead.
import { chromium } from "playwright-core";
import { browserExecutable, type PageShot } from "./browser.ts";
import { changedRegions, type Box } from "./visualdiff.ts";

export type Picture = { jpeg: string; regions: Box[]; how: "page" | "pixels" | "all_new" | "none" };

export async function drawReceipt(before: PageShot | null, after: PageShot, signal?: AbortSignal): Promise<Picture> {
  const view = { w: after.w, h: after.h };
  let regions = changedRegions(before?.items ?? [], after.items, view);
  let how: Picture["how"] = !before ? "all_new" : regions.length ? "page" : "none";
  const exe = browserExecutable();
  if (!exe || signal?.aborted) return { jpeg: after.jpeg, regions, how };
  const browser = await chromium.launch({ headless: true, executablePath: exe });
  const stop = () => { browser.close().catch(() => {}); };
  signal?.addEventListener("abort", stop, { once: true });
  try {
    const page = await browser.newPage({ viewport: { width: after.w, height: after.h } });
    if (!regions.length && before) {
      const cells = await page.evaluate(diffCells, { a: after.jpeg, b: before.jpeg, w: after.w });
      // Changed squares joined into a few circles. The sentinel keeps "everything is new" from applying.
      if (cells.length) { regions = changedRegions([{ key: "-", x: -9, y: -9, w: 1, h: 1 }], cells.map((c, i) => ({ key: `c${i}`, ...c })), view); how = "pixels"; }
    }
    return { jpeg: regions.length ? await page.evaluate(ring, { a: after.jpeg, boxes: regions, w: after.w }) : after.jpeg, regions, how };
  } finally { signal?.removeEventListener("abort", stop); await browser.close().catch(() => {}); }
}

// Squares of 16 points whose colours differ clearly between the two pictures (JPEG noise stays under the bar).
// w: the page's own width (1280 at desktop size, 390 at phone size), so a picture is scaled to what it shows.
async function diffCells({ a, b, w = 1280 }: { a: string; b: string; w?: number }): Promise<Box[]> {
  const load = async (src: string) => { const i = new Image(); i.src = `data:image/jpeg;base64,${src}`; await i.decode(); return i; };
  const [ai, bi] = [await load(a), await load(b)];
  if (ai.width !== bi.width || ai.height !== bi.height) return [];
  const px = (img: HTMLImageElement) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d")!; g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
  const [A, B] = [px(ai), px(bi)];
  const k = ai.width / w, cell = Math.round(16 * k), out: Box[] = [];
  for (let y = 0; y < ai.height; y += cell) for (let x = 0; x < ai.width; x += cell) {
    let sum = 0, n = 0;
    for (let yy = y; yy < Math.min(y + cell, ai.height); yy += 2) for (let xx = x; xx < Math.min(x + cell, ai.width); xx += 2) {
      const i = (yy * ai.width + xx) * 4; sum += Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]); n++;
    }
    if (n && sum / n > 36) out.push({ x: x / k, y: y / k, w: cell / k, h: cell / k });
  }
  return out;
}

// The page picture with a green ring around each changed place.
async function ring({ a, boxes, w = 1280 }: { a: string; boxes: Box[]; w?: number }): Promise<string> {
  const i = new Image(); i.src = `data:image/jpeg;base64,${a}`; await i.decode();
  const c = document.createElement("canvas"); c.width = i.width; c.height = i.height;
  const g = c.getContext("2d")!; g.drawImage(i, 0, 0);
  const k = i.width / w;
  // M69 step 3: the change is marked in the proven green, a thin rounded box (an orange or red ring read as an error).
  g.lineWidth = 3 * k; g.strokeStyle = "#1F9D55";
  // A rounded box a little bigger than the change, kept inside the picture so a full width change is still fully ringed.
  const pad = 7 * k, half = g.lineWidth / 2;
  for (const r of boxes) {
    const x = Math.max(half, r.x * k - pad), y = Math.max(half, r.y * k - pad);
    const w = Math.min(c.width - half, (r.x + r.w) * k + pad) - x, h = Math.min(c.height - half, (r.y + r.h) * k + pad) - y;
    g.beginPath(); g.roundRect(x, y, w, h, 10 * k); g.stroke();
  }
  return c.toDataURL("image/jpeg", 0.8).split(",")[1];
}

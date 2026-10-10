// The "it's live" card: a picture to share once a project goes live. The hidden browser opens the live address once
// (a public page), takes a picture, and lays it out at 1200 by 630 (the size most sites use for link previews) with the
// project's name, the address and the date. Plain and proud, no hype.
import { chromium } from "playwright-core";
import { browserExecutable } from "../proof/browser.ts";

export type ShareCard = { jpeg: string; withShot: boolean };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The project's name as a person would say it: package.json's name, else the folder's, tidied. */
export function projectTitle(pkgName: string | undefined, folder: string): string {
  const raw = (pkgName && !/^(my-app|vite-project|app|project|untitled)$/i.test(pkgName) ? pkgName : folder).replace(/^@[^/]+\//, "");
  const words = raw.replace(/[-_.]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  return words ? words[0].toUpperCase() + words.slice(1) : "My project";
}

export function cardHtml(o: { title: string; url: string; date: string; shot?: string }): string {
  const host = (() => { try { return new URL(o.url).host; } catch { return o.url; } })();
  return `<!doctype html><html><body style="margin:0;width:1200px;height:630px;overflow:hidden;font-family:-apple-system,'SF Pro Display',Helvetica,sans-serif;background:#0f1115;color:#f4f4f5">
<div style="position:absolute;left:64px;top:72px;width:440px">
  <div style="display:inline-block;padding:6px 14px;border-radius:999px;background:#1e8a4c;color:#fff;font-weight:700;font-size:20px;letter-spacing:.02em">● Live</div>
  <div style="margin-top:28px;font-size:56px;font-weight:800;line-height:1.05;word-wrap:break-word">${esc(o.title)}</div>
  <div style="margin-top:14px;font-size:30px;color:#c7c7cc">is live.</div>
  <div style="margin-top:40px;font-size:24px;color:#ff9a2e;word-break:break-all">${esc(host)}</div>
  <div style="margin-top:10px;font-size:18px;color:#8e8e93">${esc(o.date)}</div>
</div>
${o.shot ? `<div style="position:absolute;left:560px;top:112px;width:600px;height:405px;border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5);border:1px solid #2c2f36;background:#fff">
  <div style="height:30px;background:#e9e9ec;display:flex;align-items:center;gap:7px;padding-left:12px"><i style="width:11px;height:11px;border-radius:50%;background:#ff5f57"></i><i style="width:11px;height:11px;border-radius:50%;background:#febc2e"></i><i style="width:11px;height:11px;border-radius:50%;background:#28c840"></i></div>
  <img src="data:image/jpeg;base64,${o.shot}" style="display:block;width:600px;height:375px;object-fit:cover;object-position:top">
</div>` : ""}
</body></html>`;
}

export async function makeShareCard(o: { url: string; title: string; date: string; signal?: AbortSignal; timeoutMs?: number }): Promise<ShareCard | null> {
  const exe = browserExecutable();
  if (!exe || o.signal?.aborted) return null;
  const browser = await chromium.launch({ headless: true, executablePath: exe });
  const stop = () => { browser.close().catch(() => {}); };
  o.signal?.addEventListener("abort", stop, { once: true });
  try {
    let shot: string | undefined;
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto(o.url, { waitUntil: "load", timeout: o.timeoutMs ?? 20_000 });
      await page.waitForTimeout(800);
      shot = (await page.screenshot({ type: "jpeg", quality: 80 })).toString("base64");
      await page.close();
    } catch { shot = undefined; }   // the card still works without the picture of the site
    if (o.signal?.aborted) return null;
    const card = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await card.setContent(cardHtml({ ...o, shot }), { waitUntil: "load" });
    return { jpeg: (await card.screenshot({ type: "jpeg", quality: 88 })).toString("base64"), withShot: !!shot };
  } catch { return null; }
  finally { o.signal?.removeEventListener("abort", stop); stop(); }
}

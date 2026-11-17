// M112, rendered: the founder's glitch (the chat and Home's ask box at once) stays fixed with the tall Home. (The M112
// habitat look was taken back on 17 Nov 2026 at the founder's word, so its tests went with it.)
import { describe, expect, test } from "bun:test";
import { emit, renderHome, settle } from "./render.tsx";

const TALL = { settings: { "you.name": "Rishabh", "look.layout": "tall" } };
const opened = (o: Record<string, unknown> = {}) => emit("opened", { keyboard: false, instant: true, ...o });

describe("the glitch, in the tall Home", () => {
  test("the chat opens at the top of Home, never scrolled to what is hidden under it", async () => {
    await renderHome(TALL);
    await opened();
    const home = document.querySelector<HTMLElement>("main.home")!;
    await emit("closed", {});
    home.scrollTop = 400;
    await opened({ chat: true });
    await settle(30);
    expect(home.hasAttribute("data-chat")).toBe(true);
    expect(home.scrollTop).toBe(0);
    // The chat is drawn; Home's own ask box stays in the page (its words are kept) but outside the chat.
    expect(document.querySelector(".notch-chat")).toBeTruthy();
    expect(document.querySelector(".notch-chat .askwrap")).toBeNull();
  });
});

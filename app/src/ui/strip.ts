// A strip that scrolls sideways (Settings' pages when Home is narrow, M51): which ends have more past them, so the page can
// fade that end and show an arrow there. A word may sit under the fade, but never with no sign that the strip goes on.

/** "left", "right", both ("left right") or "" from where the strip is scrolled. One point of slack each way, so a scroll
 *  that rounds to a fraction short of an end never shows a fade there. */
export function stripEdges(scrollLeft: number, scrollWidth: number, clientWidth: number): string {
  const slack = 1;
  const left = scrollLeft > slack, right = scrollLeft + clientWidth < scrollWidth - slack;
  return [left ? "left" : "", right ? "right" : ""].filter(Boolean).join(" ");
}

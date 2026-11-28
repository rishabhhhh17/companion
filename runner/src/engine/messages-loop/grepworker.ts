// M125 audit E20: the model's Grep pattern is matched here, off the engine's own thread, so a pattern that backtracks for
// ever is ended by the executor (worker.terminate) and never holds up Stop. Text in, matching line numbers out; no files.
globalThis.onmessage = (e: MessageEvent<{ pattern: string; text: string; max: number }>) => {
  const { pattern, text, max } = e.data;
  const re = new RegExp(pattern), lines = text.split("\n"), hits: number[] = [];
  for (let k = 0; k < lines.length && hits.length < max; k++) if (re.test(lines[k])) hits.push(k);
  postMessage(hits);
};

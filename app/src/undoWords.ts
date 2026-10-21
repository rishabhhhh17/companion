// What the card says when Undo left some of the person's own files alone (runner/src/checkpoints.ts, T06). Plain words.
const NAMES = 5;

/** "a.js, b.css", or the first few and how many more. */
export function fileNames(files: string[]): string {
  return files.length <= NAMES ? files.join(", ") : `${files.slice(0, NAMES).join(", ")} and ${files.length - NAMES} more`;
}

/** "Undone, except 2 files you changed yourself: a.js, b.css. They were left as you have them." */
export function undoneExcept(files: string[]): string {
  const one = files.length === 1;
  return `Undone, except ${files.length} ${one ? "file" : "files"} you changed yourself: ${fileNames(files)}. ${one ? "It was" : "They were"} left as you ${one ? "have it" : "have them"}.`;
}

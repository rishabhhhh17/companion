// The host of a watched address, for a plain line ("example.com"), never the path or the query.
export function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return "this site"; }
}

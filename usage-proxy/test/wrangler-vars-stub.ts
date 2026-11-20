// For the stand in wranglers in the deploy tests: a shell line that prints DODO_API_BASE's binding the way the real wrangler
// 4.156.0 dry run does, and only when wrangler would bind it: a plain `DODO_API_BASE = "..."` line in the [vars] table of the
// wrangler.toml beside the script (deploy.sh runs wrangler from there). Audit run 2, finding 5, round 3: deploy.sh now reads
// the address from the bindings, so a stand in that prints none would read as Dodo's test address.
export const DODO_BASE_BINDING = `awk '/^[[:space:]]*\\[/{t=$0; gsub(/[[:space:]]/,"",t)} t=="[vars]" && /^[[:space:]]*DODO_API_BASE[[:space:]]*=[[:space:]]*"[^"]*"[[:space:]]*$/{v=$0; sub(/^[^"]*"/,"",v); sub(/"[[:space:]]*$/,"",v); print "env.DODO_API_BASE (\\"" v "\\")      Environment Variable"}' wrangler.toml`;

// Audit run 2, finding 5, close out round 1: deploy.sh now reads only wrangler's bindings table, and only when every row is
// exactly one binding with its resource word in the header's Resource column. So the stand ins print the whole table the way
// the real wrangler 4.156.0 does (src: printBindings in wrangler-dist/cli.js): the title line, a "Binding ... Resource" header,
// each `env.NAME (value)` padded to one width (JS string length, newlines counted), six spaces, the resource padded to its own
// width, six spaces, then an empty line. (The real width also adds up the longest name and the longest value apart, so it can
// be wider than any one row; deploy.sh reads the header's column, so either way works.)
const TITLE = "Your Worker has access to the following bindings:";
const GAP = "      ";
/** The table as the real wrangler prints it, from rows of [`env.NAME (value)`, resource]. */
export function wranglerTable(rows: [string, string][]): string {
  const w = Math.max("Binding".length, ...rows.map(([c]) => c.length));
  const t = Math.max("Resource".length, ...rows.map(([, r]) => r.length));
  const line = (c: string, r: string) => c + " ".repeat(w - c.length) + GAP + r + " ".repeat(t - r.length) + GAP;
  return `${TITLE}\n${line("Binding", "Resource")}\n${rows.map(([c, r]) => line(c, r)).join("\n")}\n\n`;
}
/** Splits lines written as `<env.NAME (value)>  <resource>` (two spaces or more between) into table rows. */
export function rowsFrom(lines: string): [string, string][] {
  return lines.split("\n").filter((l) => l !== "").map((l) => {
    const m = /^(.*?) {2,}([A-Za-z][A-Za-z ]*[A-Za-z]) *$/.exec(l);
    return m ? [m[1]!, m[2]!] : [l, ""];
  });
}
/** A shell filter: reads such lines (ASCII only) on stdin and prints them as wrangler's table, as wranglerTable does. */
export const WRANGLER_TABLE = `LC_ALL=C awk 'BEGIN { n = 0; w = 0; t = 0 } { i = match($0, /  +[A-Za-z][A-Za-z ]*[A-Za-z] *$/); if (i) { c[n] = substr($0, 1, i - 1); r[n] = substr($0, i); sub(/^ +/, "", r[n]); sub(/ +$/, "", r[n]) } else { c[n] = $0; r[n] = "" } if (length(c[n]) > w) w = length(c[n]); if (length(r[n]) > t) t = length(r[n]); n++ } END { if (w < 7) w = 7; if (t < 8) t = 8; f = "%-" w "s${GAP}%-" t "s${GAP}\\n"; print "${TITLE}"; printf f, "Binding", "Resource"; for (k = 0; k < n; k++) printf f, c[k], r[k]; print "" }'`;

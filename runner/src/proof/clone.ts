// Opening a project from a GitHub (or GitLab, Bitbucket) link: only plain https addresses of a repository, into a new
// folder named after it. Public repositories only; a private one fails with a plain sentence (no password is asked for).
export function cloneTarget(raw: string): { url: string; name: string } | null {
  const s = raw.trim();
  const m = /^https:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/([A-Za-z0-9][A-Za-z0-9._-]{0,99})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/.exec(s);
  if (!m) return null;
  const [, host, owner, repo] = m;
  // A name that starts with a dot would make a hidden folder (".git" would turn the chosen folder into a git folder).
  if (repo.startsWith(".") || owner.includes("..") || owner.endsWith(".")) return null;
  return { url: `https://${host}/${owner}/${repo}.git`, name: repo };
}

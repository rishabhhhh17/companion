// "Open from a link" runs git on text a person typed or pasted: only plain https addresses of a repository on three known
// sites may get through; nothing that adds an option, a command, a password, another host or a path.
import { describe, expect, test } from "bun:test";
import { cloneTarget } from "../src/proof/clone.ts";

const NO = [
  "", " ", "github.com/me/x", "http://github.com/me/x", "ftp://github.com/me/x", "file:///etc/passwd", "ssh://git@github.com/me/x", "git@github.com:me/x.git", "git://github.com/me/x",
  "ext::sh -c 'touch /tmp/pwned'", "ext::https://github.com/me/x", "fd::3", "https://github.com@evil.example/me/x", "https://user:pass@github.com/me/x", "https://github.com:443@evil.example/me/x",
  "https://github.com.evil.example/me/x", "https://evil.example/github.com/me/x", "https://notgithub.com/me/x", "https://github.com:8080/me/x", "https://GITHUB.com/me/x", "https://gіthub.com/me/x",
  "https://github.com/me/x?foo=bar", "https://github.com/me/x#frag", "https://github.com/me/x/extra/path", "https://github.com/me", "https://github.com/", "https://github.com//x",
  "https://github.com/me/..", "https://github.com/me/.", "https://github.com/../x", "https://github.com/..%2Fx/y", "https://github.com/me/%2e%2e", "https://github.com/me/x%20y", "https://github.com/me/x y",
  "https://github.com/me/x\nrm -rf ~", "https://github.com/me/x; rm -rf ~", "https://github.com/me/x && id", "https://github.com/me/x|sh", "https://github.com/me/$(id)", "https://github.com/me/`id`",
  "https://github.com/me/x'", 'https://github.com/me/x"', "https://github.com/-me/x", "https://github.com/me/.git", "https://github.com/me/.hidden", "https://github.com/.me/x", "https://github.com/me./x",
  "--upload-pack=touch /tmp/x https://github.com/me/x", "-c core.sshCommand=id https://github.com/me/x", "https://github.com/me/x --depth 1", "https://github.com/me/x\u0000", "https://github.com/me/x‮",
  "https://github.com/" + "a".repeat(101) + "/x", "https://github.com/me/" + "x".repeat(101), "https://gist.github.com/me/x", "https://raw.githubusercontent.com/me/x/main/a", "https://codeload.github.com/me/x",
];
const YES: [string, string, string][] = [
  ["https://github.com/me/mug-shop", "https://github.com/me/mug-shop.git", "mug-shop"], ["https://github.com/me/mug-shop/", "https://github.com/me/mug-shop.git", "mug-shop"],
  [" https://gitlab.com/team/site.git/ ", "https://gitlab.com/team/site.git", "site"], ["https://bitbucket.org/a_b/c-d.e", "https://bitbucket.org/a_b/c-d.e.git", "c-d.e"],
  ["https://github.com/me/x\r\n", "https://github.com/me/x.git", "x"],   // a pasted link often ends in a newline: it is trimmed, and the address is rebuilt from its parts
  ["https://github.com/Me-1/My.Repo_2.git", "https://github.com/Me-1/My.Repo_2.git", "My.Repo_2"],
];

describe("opening from a link refuses everything but a plain repository address", () => {
  for (const u of NO) test(JSON.stringify(u).slice(0, 80), () => { expect(cloneTarget(u), u).toBeNull(); });
  for (const [raw, url, name] of YES) test(`accepts ${raw.trim()}`, () => { expect(cloneTarget(raw)).toEqual({ url, name }); });
  test("what is accepted is always a clean https address and a plain folder name", () => {
    for (const [raw] of YES) { const t = cloneTarget(raw)!; expect(t.url).toMatch(/^https:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.git$/); expect(t.name).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]*$/); }
  });
});

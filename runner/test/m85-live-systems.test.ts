// M85 (research feature 3): commands that touch something a copy on this Mac cannot bring back. The research's cases: A12
// (CC #27448, a database deleted on a minor update), A13 (CC #13729, data lost because nobody asked), A21 (HN 47287420, a
// production setup deleted) and the PocketOS database lost through an API token (AIID 1469). Every folder is a temporary
// fixture; nothing here runs any of these commands.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LIVE_TAIL, liveCommand } from "../src/livesystems.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const proj = () => { const d = mkdtempSync(join(tmpdir(), "companion-test-m85-live-")); made.push(d); return d; };

describe("live systems: asked about", () => {
  const live = [
    ["psql -h db.example.com -c 'DROP TABLE users'", "db.example.com"],
    ["psql postgres://u:pw@db.prod.example.com/app -c 'TRUNCATE orders'", "db.prod.example.com"],
    ["mysql -h 10.0.4.2 -e 'DELETE FROM sessions'", "10.0.4.2"],
    ["psql \"$DATABASE_URL\" -c 'DROP TABLE users'", "may be your live database"],
    ["supabase db reset --linked", "live Supabase"],
    ["supabase db push", "live Supabase"],
    ["npx supabase db reset --db-url postgres://u:p@db.abc.supabase.co/postgres", "live Supabase"],
    ["npx prisma migrate reset --force", "DATABASE_URL"],
    ["bunx prisma migrate deploy", "DATABASE_URL"],
    ["terraform destroy -auto-approve", "destroys"],
    ["terraform apply", "changes real cloud"],
    ["tofu apply -destroy", "destroys"],
    ["kubectl delete deployment web", "Kubernetes"],
    ["vercel --prod", "live"],
    ["vercel deploy --prod --yes", "live"],
    ["fly deploy", "live"],
    ["flyctl apps destroy my-app", "Fly.io"],
    ["git push --force origin main", "rewrites the history"],
    ["git push -f", "rewrites the history"],
    ["git push --force-with-lease", "rewrites the history"],
    ["git push origin --delete feature", "deletes a branch"],
    ["curl -X DELETE https://api.example.com/users/1", "DELETE to api.example.com"],
    ["curl --request PUT https://api.example.com/x -d a", "PUT to api.example.com"],
    ["curl -XDELETE https://api.example.com/x", "DELETE"],
    ["node -e \"fetch('https://api.example.com/u/1', { method: 'DELETE' })\"", "DELETE to api.example.com"],
    ["AWS_SECRET_ACCESS_KEY=abc aws s3 ls", "AWS_SECRET_ACCESS_KEY"],
    ["curl -H \"Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY\" https://x.supabase.co/rest/v1/users", "SUPABASE_SERVICE_ROLE_KEY"],
    ["aws s3 rm s3://bucket --recursive", "cloud storage"],
    ["aws ec2 terminate-instances --instance-ids i-1", "cloud account"],
    ["cd sub && vercel --prod", "live"],
    // M85 review: three that were missed.
    ["npx prisma db push --force-reset", "deletes all the data"],
    ["prisma db push --accept-data-loss", "deletes data"],
    ["gh repo delete me/x --yes", "GitHub"],
    ["gh api -X DELETE repos/me/x", "GitHub"],
    ["gh api --method DELETE /repos/me/x/git/refs/heads/main", "GitHub"],
    ["drizzle-kit push", "DATABASE_URL"],
    ["npx drizzle-kit migrate", "DATABASE_URL"],
  ] as const;
  for (const [cmd, part] of live) test(cmd, () => {
    const why = liveCommand(cmd, proj());
    expect(why).toContain(part);
    expect(why!.endsWith(LIVE_TAIL)).toBe(true);
  });
  test("a token's value is never in the reason, only its name", () => {
    const why = liveCommand("STRIPE_SECRET_KEY=sk_live_abcdef123456 node pay.js", proj())!;
    expect(why).toContain("STRIPE_SECRET_KEY");
    expect(why).not.toContain("sk_live_abcdef123456");
    expect(liveCommand("node charge.js sk_live_abcdef123456", proj())).not.toContain("sk_live_abcdef");
  });
});

describe("not live: left to the usual rules", () => {
  const local = [
    "ls", "npm test", "git status", "git push", "git push origin main", "git checkout main",
    "psql -h localhost -c 'DROP TABLE users'", "psql -h 127.0.0.1 -c 'DELETE FROM x'", "psql -h db.example.com -c 'SELECT 1'",
    "mysql -h db.example.com -e 'DELETE FROM sessions WHERE id = 3'",
    "supabase db reset", "supabase db push --local", "supabase start",
    "prisma migrate dev", "prisma generate", "prisma migrate reset --url postgres://u:p@localhost:5432/app",
    "terraform plan", "terraform init", "kubectl get pods", "vercel", "vercel deploy", "fly status", "netlify deploy",
    "curl https://api.example.com/x", "curl -X POST https://api.example.com/x", "curl -X DELETE http://localhost:3000/users/1",
    "curl -X PUT http://127.0.0.1:8080/x", "aws s3 ls", "aws s3 cp a.txt s3://b/a.txt",
    "echo AWS docs", "rm -rf dist",
    "prisma db push", "gh repo view me/x", "gh api repos/me/x", "gh pr list", "drizzle-kit generate", "drizzle-kit studio",
  ];
  for (const cmd of local) test(cmd, () => expect(liveCommand(cmd, proj())).toBeNull());
});

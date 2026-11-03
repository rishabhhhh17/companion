// Review of M56 (must fix 24): a preview page on the internet was held only by a rule on names, so a public name that
// answers with an address on this Mac or the home network (DNS rebinding) was fetched. The browser now sends every
// connection of an internet preview through a small proxy of the check's own, which looks the name up itself, refuses any
// answer that is not a public address, and connects to the very address it checked.
import { afterEach, describe, expect, test } from "bun:test";
import { connect, type Socket } from "node:net";
import { isPublicAddress, startPublicOnlyProxy } from "../src/proof/publicProxy.ts";

const stops: (() => void)[] = [];
afterEach(() => { while (stops.length) stops.pop()!(); });

/** A server on this Mac that writes down every request it gets. */
function target() {
  const seen: string[] = [];
  const s = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(req) { seen.push(`${req.method} ${new URL(req.url).pathname} ${req.headers.get("connection") ?? ""}`); return new Response("hello from the target"); } });
  stops.push(() => s.stop(true));
  return { seen, port: s.port };
}
/** Send raw bytes to the proxy and read everything that comes back until it closes (or a short wait). */
function raw(port: number, text: string, waitMs = 800): Promise<string> {
  return new Promise((res) => {
    let got = "";
    const sk: Socket = connect(port, "127.0.0.1", () => sk.write(text));
    sk.on("data", (d) => { got += d.toString(); });
    const done = () => { sk.destroy(); res(got); };
    sk.on("close", done); sk.on("error", done);
    setTimeout(done, waitMs);
  });
}
const lookupTo = (ip: string) => async () => [{ address: ip, family: ip.includes(":") ? 6 : 4 }];

describe("which addresses are public", () => {
  test("this Mac, the home network and the special ranges are not; the internet is", () => {
    for (const ip of ["127.0.0.1", "127.9.9.9", "0.0.0.0", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "224.0.0.1", "255.255.255.255", "::1", "::", "fe80::1", "fd00::1", "fc00::1", "::ffff:192.168.1.1", "::ffff:127.0.0.1", "64:ff9b::c0a8:101", "2002:c0a8:0101::1", "nonsense", ""]) expect(isPublicAddress(ip), ip).toBe(false);
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.128.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) expect(isPublicAddress(ip), ip).toBe(true);
  });
});

describe("the public only proxy", () => {
  test("a name that answers with a home network address is refused, and nothing is reached", async () => {
    const t = target();
    const refused: string[] = [];
    const p = await startPublicOnlyProxy({ lookup: lookupTo("127.0.0.1"), onRefused: (h) => refused.push(h) });
    stops.push(p.stop);
    const out = await raw(p.port, `CONNECT rebind.attacker.example:${t.port} HTTP/1.1\r\nHost: rebind.attacker.example:${t.port}\r\n\r\n`);
    expect(out).toStartWith("HTTP/1.1 403");
    const plain = await raw(p.port, `GET http://rebind.attacker.example:${t.port}/admin HTTP/1.1\r\nHost: rebind.attacker.example:${t.port}\r\n\r\n`);
    expect(plain).toStartWith("HTTP/1.1 403");
    expect(t.seen).toEqual([]);
    expect(refused).toEqual(["rebind.attacker.example", "rebind.attacker.example"]);
  });
  test("an address written as a number is checked the same way", async () => {
    const t = target();
    const p = await startPublicOnlyProxy({});
    stops.push(p.stop);
    expect(await raw(p.port, `GET http://127.0.0.1:${t.port}/ HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n`)).toStartWith("HTTP/1.1 403");
    expect(await raw(p.port, `CONNECT [::1]:${t.port} HTTP/1.1\r\n\r\n`)).toStartWith("HTTP/1.1 403");
    expect(t.seen).toEqual([]);
  });
  test("one private answer among several is enough to refuse", async () => {
    const t = target();
    const p = await startPublicOnlyProxy({ lookup: async () => [{ address: "8.8.8.8", family: 4 }, { address: "192.168.1.1", family: 4 }] });
    stops.push(p.stop);
    expect(await raw(p.port, `CONNECT two.example:443 HTTP/1.1\r\n\r\n`)).toStartWith("HTTP/1.1 403");
  });
  test("an allowed address is reached at the very address checked, and a plain request closes after its answer", async () => {
    const t = target();
    const looked: string[] = [];
    const p = await startPublicOnlyProxy({ lookup: async (h) => { looked.push(h); return [{ address: "127.0.0.1", family: 4 }]; }, isAllowed: () => true });
    stops.push(p.stop);
    const out = await raw(p.port, `GET http://site.example:${t.port}/page?q=1 HTTP/1.1\r\nHost: site.example:${t.port}\r\nProxy-Connection: keep-alive\r\n\r\n`);
    expect(out).toStartWith("HTTP/1.1 200");
    expect(out).toContain("hello from the target");
    expect(t.seen).toEqual(["GET /page close"]);
    const tunnel = await raw(p.port, `CONNECT site.example:${t.port} HTTP/1.1\r\n\r\nGET /through HTTP/1.1\r\nHost: site.example\r\nConnection: close\r\n\r\n`);
    expect(tunnel).toStartWith("HTTP/1.1 200 Connection Established");
    expect(tunnel).toContain("hello from the target");
    expect(t.seen).toEqual(["GET /page close", "GET /through close"]);
    expect(looked).toEqual(["site.example", "site.example"]);
  });
  test("a name that cannot be looked up, or a request it cannot read, is refused", async () => {
    const p = await startPublicOnlyProxy({ lookup: async () => { throw new Error("ENOTFOUND"); } });
    stops.push(p.stop);
    expect(await raw(p.port, `CONNECT nowhere.example:443 HTTP/1.1\r\n\r\n`)).toStartWith("HTTP/1.1 502");
    expect(await raw(p.port, `NONSENSE\r\n\r\n`)).toStartWith("HTTP/1.1 400");
  });
});

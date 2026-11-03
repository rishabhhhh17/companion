// The browser check's lock for a preview page on the internet (review of M56, must fix 24, an incident under the bar's
// rule 9). A rule on names alone lets a public name that answers with an address on this Mac or the home network through
// (DNS rebinding: rebind.attacker.example answering 192.168.1.1, the person's router). So the hidden browser sends every
// connection of an internet preview here: this proxy looks the name up itself, refuses the connection unless every answer
// is a public address, and then connects to the very address it checked, so the answer cannot change in between.
// It only ever listens on 127.0.0.1, on a port of its own, for as long as one check runs. It never reads or keeps what
// passes through it: a tunnel (https, WebSockets) is passed on as it is, and a plain http request only has its first line
// and its connection headers rewritten, so it closes after its answer and cannot be reused for another address.
import { BlockList, connect, createServer, isIP, type Socket } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";

export type Lookup = (host: string) => Promise<{ address: string; family: number }[]>;
export type PublicOnlyProxy = { port: number; stop: () => void };

const v4 = new BlockList();
for (const [net, bits] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) v4.addSubnet(net, bits, "ipv4");
const v6 = new BlockList();
for (const [net, bits] of [["::", 96], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8], ["2001:db8::", 32], ["100::", 64]] as const) v6.addSubnet(net, bits, "ipv6");

/** The eight groups of an IPv6 address as numbers (a dotted IPv4 tail counts as the last two). */
function groups6(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0];
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (dotted) { const p = dotted[1].split(".").map(Number); s = s.slice(0, -dotted[1].length) + `${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`; }
  const [head, tail] = s.split("::");
  const h = head ? head.split(":") : [], t = tail !== undefined ? (tail ? tail.split(":") : []) : [];
  const fill = tail !== undefined ? 8 - h.length - t.length : 0;
  const all = [...h, ...Array(Math.max(0, fill)).fill("0"), ...t];
  if (all.length !== 8) return null;
  const n = all.map((g) => parseInt(g, 16));
  return n.every((x) => Number.isInteger(x) && x >= 0 && x <= 0xffff) ? n : null;
}
const v4Of = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

/** Is this an address on the public internet: never this Mac, the home network, a link local or a special range? An IPv6
 *  address that carries an IPv4 one (mapped, NAT64, 6to4) is judged by the IPv4 address it carries. */
export function isPublicAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return !v4.check(ip, "ipv4");
  if (kind !== 6) return false;
  const g = groups6(ip);
  if (!g) return false;
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return isPublicAddress(v4Of(g[6], g[7]));   // ::ffff:a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isPublicAddress(v4Of(g[6], g[7]));   // NAT64
  if (g[0] === 0x2002) return isPublicAddress(v4Of(g[1], g[2]));   // 6to4
  return !v6.check(ip, "ipv6");
}

const MAX_HEAD = 64 * 1024;
const HEAD_WAIT_MS = 10_000;
const answer = (status: string) => `HTTP/1.1 ${status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`;
const defaultLookup: Lookup = async (host) => (await dnsLookup(host, { all: true, verbatim: true })) as { address: string; family: number }[];

/** Starts the proxy on 127.0.0.1 with a port of its own. `isAllowed` and `lookup` are for tests; `onRefused` names each
 *  host refused, for the check's gap line. */
export function startPublicOnlyProxy(o: { lookup?: Lookup; isAllowed?: (ip: string, host: string) => boolean; onRefused?: (host: string) => void } = {}): Promise<PublicOnlyProxy> {
  const lookup = o.lookup ?? defaultLookup, allowed = o.isAllowed ?? ((ip: string) => isPublicAddress(ip));
  const open = new Set<Socket>();
  const track = (s: Socket) => { open.add(s); s.on("close", () => open.delete(s)); return s; };
  const server = createServer((client) => {
    track(client);
    client.on("error", () => client.destroy());
    let head = Buffer.alloc(0);
    const timer = setTimeout(() => client.destroy(), HEAD_WAIT_MS);
    const refuse = (status: string) => { clearTimeout(timer); client.end(answer(status)); };
    const onData = (d: Buffer) => {
      head = Buffer.concat([head, d]);
      const end = head.indexOf("\r\n\r\n");
      if (end < 0) { if (head.length > MAX_HEAD) { client.off("data", onData); refuse("431 Request Header Fields Too Large"); } return; }
      client.off("data", onData);
      clearTimeout(timer);
      client.pause();
      void route(head.subarray(0, end).toString("latin1"), head.subarray(end + 4));
    };
    client.on("data", onData);

    async function route(text: string, rest: Buffer) {
      const lines = text.split("\r\n");
      const [method, target, version] = lines[0].split(" ");
      let host = "", port = 0, firstLine = "";
      if (method === "CONNECT" && target) {
        const m = /^\[([^\]]+)\]:(\d+)$/.exec(target) ?? /^([^:]+):(\d+)$/.exec(target);
        if (m) { host = m[1]; port = Number(m[2]); }
      } else if (method && target && /^HTTP\/1\.[01]$/.test(version ?? "")) {
        try {
          const u = new URL(target);
          if (u.protocol === "http:") { host = u.hostname.replace(/^\[|\]$/g, ""); port = Number(u.port || 80); firstLine = `${method} ${u.pathname}${u.search} ${version}`; }
        } catch { /* not an address */ }
      }
      if (!host || !(port >= 1 && port <= 65535)) return refuse("400 Bad Request");
      let addresses: string[];
      try { addresses = isIP(host) ? [host] : (await lookup(host)).map((a) => a.address); } catch { return refuse("502 Bad Gateway"); }
      if (addresses.length === 0) return refuse("502 Bad Gateway");
      if (!addresses.every((a) => allowed(a, host))) { o.onRefused?.(host); return refuse("403 Forbidden"); }
      const upstream = track(connect({ host: addresses[0], port }));
      let connected = false;
      upstream.on("error", () => { if (!connected) refuse("502 Bad Gateway"); else client.destroy(); upstream.destroy(); });
      upstream.on("connect", () => {
        connected = true;
        if (method === "CONNECT") {
          client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
          if (rest.length) upstream.write(rest);
        } else {
          const keep = lines.slice(1).filter((l) => !/^(proxy-connection|connection|keep-alive|proxy-authorization)\s*:/i.test(l));
          upstream.write(Buffer.concat([Buffer.from([firstLine, ...keep, "Connection: close", "", ""].join("\r\n"), "latin1"), rest]));
        }
        client.pipe(upstream); upstream.pipe(client);
        client.resume();
      });
      client.on("close", () => upstream.destroy());
      upstream.on("close", () => client.destroy());
    }
  });
  return new Promise((res, rej) => {
    server.once("error", rej);
    server.listen(0, "127.0.0.1", () => {
      const a = server.address();
      const port = typeof a === "object" && a ? a.port : 0;
      res({ port, stop: () => { server.close(); for (const s of open) s.destroy(); open.clear(); } });
    });
  });
}

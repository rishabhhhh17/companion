// A small fake of the Durable Object API that store-do.ts uses: a namespace that makes one object per name, and storage whose
// every call yields first, the way a real call can let other work run in between. Each object is kept, so two "server
// instances" (two DurableStore values) on one namespace share the same objects, as they would on Cloudflare.
import { StoreObject, type NamespaceLike, type StorageLike } from "../src/store-do.ts";

const yieldNow = () => new Promise<void>((r) => setTimeout(r, 0));
const copy = <T>(v: T): T => (v === undefined ? v : structuredClone(v));

export class FakeStorage implements StorageLike {
  data = new Map<string, unknown>();
  calls = 0;
  async get<T>(key: string) { this.calls++; await yieldNow(); return copy(this.data.get(key)) as T | undefined; }
  async put(entries: Record<string, unknown>) { this.calls++; await yieldNow(); for (const [k, v] of Object.entries(entries)) this.data.set(k, copy(v)); }
  async delete(keys: string[]) { this.calls++; await yieldNow(); let n = 0; for (const k of keys) if (this.data.delete(k)) n++; return n; }
  async list<T>(o: { prefix: string }) {
    this.calls++; await yieldNow();
    return new Map([...this.data].filter(([k]) => k.startsWith(o.prefix)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => [k, copy(v) as T]));
  }
}

export class FakeNamespace implements NamespaceLike<{ name: string }> {
  objects = new Map<string, { obj: StoreObject; storage: FakeStorage }>();
  /** Every call in order: the object's name and the step (never its arguments). */
  log: string[] = [];
  idFromName(name: string) { return { name }; }
  get(id: { name: string }) {
    return {
      fetch: async (input: string, init?: RequestInit) => {
        const o = this.#object(id.name);
        this.log.push(`${id.name} ${new URL(input).pathname.slice(1)}`);
        return o.obj.fetch(new Request(input, init));
      },
    };
  }
  /** Everything every object holds, in a fixed order, for tests that check what is kept. An object that holds nothing is left
   *  out: on Cloudflare an object with no stored data keeps nothing. */
  dump() {
    return [...this.objects].filter(([, o]) => o.storage.data.size > 0).sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, o]) => [name, [...o.storage.data].sort(([a], [b]) => (a < b ? -1 : 1))]);
  }
  storageOf(name: string) { return this.objects.get(name)?.storage; }
  /** The object's storage, made now if it does not exist yet (for a test that writes a starting state). */
  storageFor(name: string) { return this.#object(name).storage; }
  #object(name: string) {
    let o = this.objects.get(name);
    if (!o) { const storage = new FakeStorage(); o = { obj: new StoreObject({ storage }), storage }; this.objects.set(name, o); }
    return o;
  }
}

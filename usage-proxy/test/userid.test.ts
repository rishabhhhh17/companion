import { describe, expect, test } from "bun:test";
import { MIN_SECRET_CHARS, USER_ID_SECRET_SETTING, deriveUserId, findOwnerByUserId, secretProblem } from "../src/userid.ts";

const SECRET = "operator-secret-for-tests-0123456789abcdef";
const OTHER = "a-different-operator-secret-9876543210fedcba";

describe("the opaque user id sent to Anthropic", () => {
  test("it is a fixed length hex string: stable for one person, different between people", async () => {
    const a1 = await deriveUserId("owner-aaa", SECRET), a2 = await deriveUserId("owner-aaa", SECRET), b = await deriveUserId("owner-bbb", SECRET);
    expect(a1).toMatch(/^[0-9a-f]{64}$/);
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
  });
  test("a different operator secret gives a different id, so the id cannot be worked out without the key", async () => {
    expect(await deriveUserId("owner-aaa", SECRET)).not.toBe(await deriveUserId("owner-aaa", OTHER));
  });
  test("it holds no personal data: even if the owner id were an email or a name, none of it shows", async () => {
    for (const owner of ["jane.doe@example.com", "Jane Doe", "+1 415 555 0100"]) {
      const id = await deriveUserId(owner, SECRET);
      expect(id).toMatch(/^[0-9a-f]{64}$/);
      expect(id).not.toContain(owner);
      expect(id).not.toMatch(/[@\s+.]/);   // no email, space or phone shape
    }
  });
  test("a missing, empty or short secret is refused, never replaced by a default", async () => {
    for (const bad of [undefined, null, "", "short", "x".repeat(MIN_SECRET_CHARS - 1), 42, "   "]) {
      expect(secretProblem(bad), String(bad)).toMatch(new RegExp(USER_ID_SECRET_SETTING));
      await expect(deriveUserId("owner-aaa", bad as any)).rejects.toThrow(USER_ID_SECRET_SETTING);
    }
    expect(secretProblem(SECRET)).toBeNull();
  });
  test("an empty owner id is refused", async () => {
    await expect(deriveUserId("", SECRET)).rejects.toThrow();
  });
});

describe("finding the owner from the opaque id", () => {
  const owners = ["owner-aaa", "owner-bbb", "owner-ccc"];
  test("the owner whose id matches is found, from the id alone, the list and the secret", async () => {
    for (const o of owners) expect(await findOwnerByUserId(await deriveUserId(o, SECRET), owners, SECRET)).toBe(o);
  });
  test("an id that matches nobody, a wrong secret, or a malformed id finds nobody", async () => {
    const id = await deriveUserId("owner-zzz", SECRET);
    expect(await findOwnerByUserId(id, owners, SECRET)).toBeNull();
    expect(await findOwnerByUserId(await deriveUserId("owner-aaa", SECRET), owners, OTHER)).toBeNull();
    for (const bad of ["", "abc", "not hex ".repeat(10), "g".repeat(64), "a".repeat(63)]) expect(await findOwnerByUserId(bad, owners, SECRET), bad).toBeNull();
  });
  test("the id may be pasted in capitals or with spaces around it", async () => {
    const id = await deriveUserId("owner-bbb", SECRET);
    expect(await findOwnerByUserId(`  ${id.toUpperCase()}\n`, owners, SECRET)).toBe("owner-bbb");
  });
  test("a missing secret is an error, not a guess", async () => {
    await expect(findOwnerByUserId("a".repeat(64), owners, undefined as any)).rejects.toThrow(USER_ID_SECRET_SETTING);
  });
});

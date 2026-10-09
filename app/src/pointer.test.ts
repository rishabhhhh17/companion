import { describe, expect, test } from "bun:test";
import { flightMs } from "./pointer.ts";

describe("the pointer's flight", () => {
  test("short hops are not too quick to follow, long ones not too slow", () => {
    expect(flightMs(10)).toBe(600); expect(flightMs(800)).toBe(1000); expect(flightMs(5000)).toBe(1400);
  });
});

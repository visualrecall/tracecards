import { describe, expect, it } from "vitest";
import { ulid } from "../src";

const bytes = (fill: number) => () => new Uint8Array(10).fill(fill);

describe("ulid", () => {
  it("encodes the time in the first 10 characters and the random bytes in the last 16", () => {
    expect(ulid(0, bytes(0))).toBe("00000000000000000000000000");
    expect(ulid(2 ** 48 - 1, bytes(255))).toBe("7ZZZZZZZZZZZZZZZZZZZZZZZZZ");
    // The spec's example time, 1469918176385 ms.
    expect(ulid(1469918176385, bytes(0)).slice(0, 10)).toBe("01ARYZ6S41");
  });

  it("reads the random bytes 5 bits at a time", () => {
    const random = () => Uint8Array.from([0b00001000, 0b01000000, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(ulid(0, random).slice(10)).toBe("1100000000000001");
  });

  it("sorts by time", () => {
    expect(ulid(1000, bytes(255)) < ulid(1001, bytes(0))).toBe(true);
  });

  it("rejects times it can't encode", () => {
    expect(() => ulid(-1, bytes(0))).toThrow(RangeError);
    expect(() => ulid(2 ** 48, bytes(0))).toThrow(RangeError);
    expect(() => ulid(1.5, bytes(0))).toThrow(RangeError);
  });
});

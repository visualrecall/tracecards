import { describe, expect, it } from "vitest";
import { normalizeDeck } from "../src/normalize";

const deck = (data: Record<string, unknown>) => normalizeDeck({ ok: true, data });

describe("normalizeDeck", () => {
  it("reads the deck's slot on the pad", () => {
    expect(deck({ pad: 1 }).pad).toBe(1);
    expect(deck({ pad: 8 }).pad).toBe(8);
  });

  it("drops a slot that isn't on the pad", () => {
    for (const pad of [0, 9, 2.5, "3", true, null]) expect(deck({ pad }).pad).toBeUndefined();
  });
});

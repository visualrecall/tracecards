import { describe, expect, it } from "vitest";
import { cardAt, cardsLabel } from "../src/phone";

describe("cardAt", () => {
  it("is the card nearest the middle", () => {
    expect(cardAt(0, 300, 5)).toBe(0);
    expect(cardAt(149, 300, 5)).toBe(0);
    expect(cardAt(151, 300, 5)).toBe(1);
    expect(cardAt(600, 300, 5)).toBe(2);
  });

  it("stays among the cards when scrolled past either end", () => {
    expect(cardAt(-40, 300, 5)).toBe(0);
    expect(cardAt(5000, 300, 5)).toBe(4);
  });

  it("is the first card when there are none, or before they're laid out", () => {
    expect(cardAt(100, 300, 0)).toBe(0);
    expect(cardAt(100, 0, 5)).toBe(0);
  });
});

describe("cardsLabel", () => {
  it("counts cards in words", () => {
    expect([0, 1, 9].map(cardsLabel)).toEqual(["0 cards", "1 card", "9 cards"]);
  });
});

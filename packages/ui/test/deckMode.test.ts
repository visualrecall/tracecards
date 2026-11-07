import { describe, expect, it } from "vitest";
import { deckListTarget, deckModeKey, deckModeTarget, padMoveTarget } from "../src/deckMode";
import type { GridMove } from "../src/gridNavigation";

// Tests run without a DOM, so a plain object stands in for the key press.
const key = (init: Partial<KeyboardEvent>) =>
  deckModeKey({
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...init,
  } as KeyboardEvent);

describe("deckModeKey", () => {
  it("reads plain keys and Shift with j, k, ↓ and ↑", () => {
    expect(key({ key: " " })).toBe("browse");
    expect(key({ key: "l" })).toBe("nextDeck");
    expect(key({ key: "ArrowDown" })).toBe("down");
    expect(key({ key: "J", shiftKey: true })).toBe("deckBelow");
    expect(key({ key: "ArrowUp", shiftKey: true })).toBe("deckAbove");
  });

  it("ignores other modifiers and shifted keys", () => {
    expect(key({ key: "j", metaKey: true })).toBeNull();
    expect(key({ key: "ArrowLeft", altKey: true })).toBeNull();
    expect(key({ key: "H", shiftKey: true })).toBeNull();
  });
});

/** The pad's eight slots, the first `decks` of them filled. */
const pad = (decks: number) => Array.from({ length: 8 }, (_, index) => index < decks);

describe("deckModeTarget", () => {
  it("goes through the pad in order with left and right, round the ends", () => {
    expect(deckModeTarget("nextDeck", 3, pad(8), 0, 1)).toEqual({ slot: 4 });
    expect(deckModeTarget("nextDeck", 7, pad(8), 0, 1)).toEqual({ slot: 0 });
    expect(deckModeTarget("previousDeck", 0, pad(5), 0, 1)).toEqual({ slot: 4 });
    expect(deckModeTarget("nextDeck", 0, pad(1), 0, 1)).toBeNull();
  });

  it("skips empty slots with left and right", () => {
    const filled = [true, false, false, true, false, false, true, false];
    expect(deckModeTarget("nextDeck", 0, filled, 0, 1)).toEqual({ slot: 3 });
    expect(deckModeTarget("nextDeck", 6, filled, 0, 1)).toEqual({ slot: 0 });
    expect(deckModeTarget("previousDeck", 3, filled, 0, 1)).toEqual({ slot: 0 });
  });

  it("turns pages with down and up", () => {
    expect(deckModeTarget("down", 1, pad(8), 0, 3)).toEqual({ slot: 1, page: 1 });
    expect(deckModeTarget("up", 1, pad(8), 2, 3)).toEqual({ slot: 1, page: 1 });
  });

  it("goes to the deck below or above past the last or first page, in the same column", () => {
    expect(deckModeTarget("down", 1, pad(8), 2, 3)).toEqual({ slot: 5 });
    expect(deckModeTarget("up", 5, pad(8), 0, 3)).toEqual({ slot: 1 });
    // Nothing below the bottom row, above the top row, or in an empty slot.
    expect(deckModeTarget("down", 5, pad(8), 0, 1)).toBeNull();
    expect(deckModeTarget("up", 1, pad(8), 0, 1)).toBeNull();
    expect(deckModeTarget("down", 2, pad(6), 0, 1)).toBeNull();
  });

  it("goes to the deck below or above straight away with Shift", () => {
    expect(deckModeTarget("deckBelow", 0, pad(8), 0, 3)).toEqual({ slot: 4 });
    expect(deckModeTarget("deckAbove", 6, pad(8), 1, 3)).toEqual({ slot: 2 });
  });

  it("only turns pages when the deck isn't in the pad", () => {
    expect(deckModeTarget("down", -1, pad(8), 0, 2)).toEqual({ slot: -1, page: 1 });
    expect(deckModeTarget("nextDeck", -1, pad(8), 0, 2)).toBeNull();
  });
});

describe("padMoveTarget", () => {
  // The pad's eight slots, in rows of four:
  //  0 1 2 3
  //  4 5 6 7
  it.each<[number, GridMove, number]>([
    [5, "left", 4],
    [4, "left", 3],
    [0, "left", 0],
    [3, "right", 4],
    [7, "right", 7],
    [1, "down", 5],
    [5, "down", 5],
    [6, "up", 2],
    [2, "up", 2],
    [5, "first", 0],
    [2, "last", 7],
  ])("from %i, %s lands on %i", (from, move, to) => {
    expect(padMoveTarget(move, from, 8)).toBe(to);
  });
});

describe("deckListTarget", () => {
  it("goes through the decks in order with left and right, round the ends", () => {
    expect(deckListTarget("nextDeck", 2, 12)).toBe(3);
    expect(deckListTarget("nextDeck", 11, 12)).toBe(0);
    expect(deckListTarget("previousDeck", 0, 12)).toBe(11);
    expect(deckListTarget("nextDeck", 0, 1)).toBeNull();
  });

  it("goes to the deck before or after with up and down, with Shift or without", () => {
    expect(deckListTarget("down", 9, 12)).toBe(10);
    expect(deckListTarget("deckBelow", 9, 12)).toBe(10);
    expect(deckListTarget("up", 9, 12)).toBe(8);
    expect(deckListTarget("deckAbove", 9, 12)).toBe(8);
  });

  it("stops at the ends with up and down", () => {
    expect(deckListTarget("up", 0, 12)).toBeNull();
    expect(deckListTarget("down", 11, 12)).toBeNull();
  });
});

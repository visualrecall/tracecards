import type { Deck } from "@tracecards/core";
import { describe, expect, it } from "vitest";
import {
  offPadDecks,
  padDecks,
  padSlots,
  placeInSlot,
  shownDeck,
  slotUpdates,
} from "../src/deckActions";

const deck = (name: string, pad?: number): Deck => ({
  name,
  hasDeckFile: false,
  cards: [],
  ...(pad !== undefined && { pad }),
});

const names = (slots: readonly (Deck | undefined)[]) => slots.map((item) => item?.name ?? null);

describe("the deck pad", () => {
  it("puts each attached deck in its slot, leaving the others empty", () => {
    const decks = [deck("A", 3), deck("B"), deck("C", 1), deck("D", 8)];
    expect(names(padSlots(decks))).toEqual(["C", null, "A", null, null, null, null, "D"]);
    expect(names(padDecks(decks))).toEqual(["C", "A", "D"]);
  });

  it("is empty until decks are attached", () => {
    expect(padDecks([deck("A"), deck("B")])).toEqual([]);
  });

  it("moves a deck whose slot is taken to the first empty one, or off the pad when it's full", () => {
    expect(names(padSlots([deck("A", 2), deck("B", 2)]))).toEqual([
      "B",
      "A",
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    const full = Array.from({ length: 8 }, (_, index) => deck(`D${index}`, index + 1));
    const extra = deck("E", 4);
    expect(padDecks([...full, extra])).not.toContain(extra);
    expect(offPadDecks([...full, extra])).toEqual([extra]);
  });

  it("leaves the other decks off it", () => {
    const decks = [deck("A", 2), deck("B"), deck("C", 5), deck("D")];
    expect(offPadDecks(decks).map((item) => item.name)).toEqual(["B", "D"]);
  });

  it("shows the first deck on the pad when none is selected", () => {
    const list = [deck("A"), deck("B", 4), deck("C", 2)];
    expect(shownDeck(list, null)?.name).toBe("C");
    expect(shownDeck(list, "A")?.name).toBe("A");
    expect(shownDeck([deck("A")], null)?.name).toBe("A");
  });
});

describe("dropping a deck in a slot", () => {
  const updates = (deckName: string, occupant: Deck | undefined, slot: number, decks: Deck[]) =>
    slotUpdates(
      decks.find((item) => item.name === deckName)!,
      occupant,
      slot,
    ).map(({ deck: item, pad }) => [item.name, pad]);

  it("puts a deck from off the pad in an empty slot", () => {
    const decks = [deck("A", 1), deck("B")];
    expect(updates("B", undefined, 2, decks)).toEqual([["B", 3]]);
  });

  it("takes the deck there off the pad first, and doesn't move it to an empty slot", () => {
    const decks = [deck("A", 1), deck("B")];
    expect(updates("B", decks[0], 0, decks)).toEqual([
      ["A", null],
      ["B", 1],
    ]);
  });

  it("leaves the old slot of a deck on the pad empty, rather than swapping", () => {
    const decks = [deck("A", 1), deck("B", 4)];
    expect(updates("B", decks[0], 0, decks)).toEqual([
      ["A", null],
      ["B", 1],
    ]);
    const slots = placeInSlot(padSlots(decks), decks[1]!, 0);
    expect(names(slots)).toEqual(["B", null, null, null, null, null, null, null]);
  });

  it("changes nothing in the deck's own slot", () => {
    const decks = [deck("A", 1)];
    expect(updates("A", decks[0], 0, decks)).toEqual([]);
  });

  it("shows the pad as the writes will leave it", () => {
    const decks = [deck("A", 1), deck("B", 2), deck("C")];
    expect(names(placeInSlot(padSlots(decks), decks[2]!, 1))).toEqual([
      "A",
      "C",
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});

import type { GridMove } from "./gridNavigation";

// The keys while no card is selected ("deck mode"): they move between the decks in
// the pad and turn their pages. Selecting a card (Space, i or Enter) switches to the card keys.

/** The pad's columns, so the deck below is four slots on. */
const PAD_COLUMNS = 4;

export type DeckModeKey =
  /** Space, i or Enter: select the first card on the page. */
  | "browse"
  | "previousDeck"
  | "nextDeck"
  /** j or ↓: the next page, or on the last page the deck below. */
  | "down"
  /** k or ↑: the previous page, or on the first page the deck above. */
  | "up"
  /** Shift+J or Shift+↓, also while a card is selected. */
  | "deckBelow"
  /** Shift+K or Shift+↑, also while a card is selected. */
  | "deckAbove";

const PLAIN: Record<string, DeckModeKey> = {
  " ": "browse",
  i: "browse",
  Enter: "browse",
  h: "previousDeck",
  ArrowLeft: "previousDeck",
  l: "nextDeck",
  ArrowRight: "nextDeck",
  j: "down",
  ArrowDown: "down",
  k: "up",
  ArrowUp: "up",
};

const SHIFTED: Record<string, DeckModeKey> = {
  J: "deckBelow",
  ArrowDown: "deckBelow",
  K: "deckAbove",
  ArrowUp: "deckAbove",
};

/** The deck-mode key pressed, if any. Shift goes with j, k, ↓ and ↑ only. */
export function deckModeKey(event: KeyboardEvent): DeckModeKey | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  return (event.shiftKey ? SHIFTED : PLAIN)[event.key] ?? null;
}

/** Where a key leaves the pad: the deck's slot, and a page to turn to in the same deck. */
export interface DeckModeTarget {
  slot: number;
  page?: number;
}

/**
 * Where a deck-mode key goes from the deck in `slot` of the pad, whose slots are
 * `filled` or empty (`slot` is -1 when the selected deck isn't on the pad), showing `page` of
 * `pages`. Null when it goes nowhere. Left and right go through the decks in slot order, skipping
 * empty slots, and go round; up and down turn pages and, past the first or last page, go to the
 * deck above or below in the same column, as Shift with them does straight away. An empty slot
 * there goes nowhere. A deck that's switched to shows the page it was on.
 */
export function deckModeTarget(
  key: Exclude<DeckModeKey, "browse">,
  slot: number,
  filled: readonly boolean[],
  page: number,
  pages: number,
): DeckModeTarget | null {
  const inPad = filled[slot] === true;
  const deckAt = (target: number) =>
    inPad && target !== slot && filled[target] === true ? { slot: target } : null;
  // The next deck along, going round past the empty slots.
  const along = (step: 1 | -1) => {
    const slots = filled.length;
    for (let distance = 1; distance < slots; distance++) {
      const target = (((slot + step * distance) % slots) + slots) % slots;
      if (filled[target]) return deckAt(target);
    }
    return null;
  };
  switch (key) {
    case "previousDeck":
      return along(-1);
    case "nextDeck":
      return along(1);
    case "down":
      return page < pages - 1 ? { slot, page: page + 1 } : deckAt(slot + PAD_COLUMNS);
    case "up":
      return page > 0 ? { slot, page: page - 1 } : deckAt(slot - PAD_COLUMNS);
    case "deckBelow":
      return deckAt(slot + PAD_COLUMNS);
    case "deckAbove":
      return deckAt(slot - PAD_COLUMNS);
  }
}

/**
 * Where Alt with an arrow key moves the deck in `slot` of the pad's `slots`, empty ones included:
 * left and right to the slot beside it, up and down to the row above or below. It stays put at
 * the pad's edges.
 */
export function padMoveTarget(move: GridMove, slot: number, slots: number): number {
  switch (move) {
    case "left":
      return Math.max(slot - 1, 0);
    case "right":
      return Math.min(slot + 1, slots - 1);
    case "up":
      return slot >= PAD_COLUMNS ? slot - PAD_COLUMNS : slot;
    case "down":
      return slot + PAD_COLUMNS < slots ? slot + PAD_COLUMNS : slot;
    case "first":
      return 0;
    case "last":
      return slots - 1;
  }
}

/**
 * Where a deck-mode key goes in the grid view, where the decks are a list rather than the pad,
 * from the deck at `index` of `decks`. Left and right go through them in order and go round, as
 * in the pad; up and down, with Shift or without, go to the deck before or after and stop at the
 * ends. Null when it goes nowhere.
 */
export function deckListTarget(
  key: Exclude<DeckModeKey, "browse">,
  index: number,
  decks: number,
): number | null {
  const target =
    key === "previousDeck"
      ? (index - 1 + decks) % decks
      : key === "nextDeck"
        ? (index + 1) % decks
        : key === "up" || key === "deckAbove"
          ? index - 1
          : index + 1;
  return index >= 0 && target >= 0 && target < decks && target !== index ? target : null;
}

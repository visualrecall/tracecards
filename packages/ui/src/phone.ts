// What the Tracecards tab shows on phones, where the deck pad doesn't fit.

/**
 * On phones the tab shows one card at a time, with a button for the deck; or lists: every deck,
 * then the cards of the one chosen.
 */
export type PhoneView = "card" | "list";

/**
 * Which card a row that scrolls sideways is on: the one nearest the middle, when each card is
 * `step` pixels on from the one before and the first is in the middle at no scroll.
 */
export function cardAt(scrollLeft: number, step: number, count: number): number {
  if (count === 0 || step <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollLeft / step)));
}

/** How many cards a deck has, in words: "1 card", "9 cards". */
export function cardsLabel(count: number): string {
  return count === 1 ? "1 card" : `${count} cards`;
}

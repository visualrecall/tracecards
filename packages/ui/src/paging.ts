import { type GridMove, gridMove } from "./gridNavigation";

/** Cards on a page: a row of four, then one on each side of the deck pad. */
export const CARDS_PER_PAGE = 6;

/** The columns of a page's cards, in order. The first four are in the first row. */
const COLUMNS = [0, 1, 2, 3, 0, 3] as const;

/** How many pages `cards` cards take. An empty deck still has one page. */
export function pageCount(cards: number): number {
  return Math.max(1, Math.ceil(cards / CARDS_PER_PAGE));
}

/** The page the card at `index` is on. */
export function pageOf(index: number): number {
  return Math.floor(index / CARDS_PER_PAGE);
}

/** A move between cards: a grid move, or to the same place on the next or previous page. */
export type CardMove = GridMove | "nextPage" | "previousPage";

/** The move a key press asks for: a grid move, or Page Up or Page Down, without modifier keys. */
export function cardMove(event: KeyboardEvent): CardMove | null {
  const move = gridMove(event);
  if (move || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return move;
  return event.key === "PageDown" ? "nextPage" : event.key === "PageUp" ? "previousPage" : null;
}

/**
 * The card a move from the card at `index` lands on, in a deck of `count` cards laid out in
 * pages. Left and right stay on the page. Up and down go by row, around the deck
 * pad, and onto the next or previous page in the same column; from under the pad they go to the
 * nearest card beside it, looking left first. Home and End go to the deck's first and last cards,
 * and Page Up and Page Down to the same place on the previous or next page. Returns `index` when
 * there's nowhere to go.
 */
export function cardMoveTarget(index: number, count: number, move: CardMove): number {
  const page = pageOf(index);
  const start = page * CARDS_PER_PAGE;
  const onPage = Math.min(count - start, CARDS_PER_PAGE);
  const next = start + CARDS_PER_PAGE;
  const position = index - start;
  const column = COLUMNS[position] ?? 0;
  switch (move) {
    case "left":
      return Math.max(index - 1, start);
    case "right":
      return Math.min(index + 1, start + onPage - 1);
    case "first":
      return 0;
    case "last":
      return count - 1;
    case "previousPage":
      return page > 0 ? index - CARDS_PER_PAGE : index;
    case "nextPage":
      return next < count ? Math.min(index + CARDS_PER_PAGE, count - 1) : index;
    case "up":
      if (position >= 4) return start + column;
      if (page === 0) return index;
      return start - CARDS_PER_PAGE + (secondRowCard(column, CARDS_PER_PAGE) ?? 0);
    case "down": {
      const below = position < 4 ? secondRowCard(column, onPage) : undefined;
      if (below !== undefined) return start + below;
      if (next >= count) return index;
      return next + Math.min(column, count - next - 1, 3);
    }
  }
}

/**
 * The position of the card in a page's second row below `column`, when the page has `onPage`
 * cards. Below the deck pad, that's the nearest card beside it, looking left first.
 */
function secondRowCard(column: number, onPage: number): number | undefined {
  const columns = column === 1 ? [0, 3] : column === 2 ? [3, 0] : [column];
  return columns
    .map((candidate) => (candidate === 0 ? 4 : 5))
    .find((position) => position < onPage);
}

/**
 * Turns wheel events into page turns: the first event turns the page, and the
 * events in the next 200ms are ignored. A trackpad swipe, which sends events for a second or
 * more, turns a page every 200ms while it lasts.
 */
export class WheelPager {
  private last = -Infinity;

  constructor(private readonly interval = 200) {}

  /** The page to move by for a wheel event at `time` (ms): 1 (next), -1 (previous) or 0. */
  turn(deltaY: number, time: number): -1 | 0 | 1 {
    if (time - this.last < this.interval) return 0;
    this.last = time;
    return deltaY > 0 ? 1 : -1;
  }
}

import type { CardMove } from "./paging";

// The grid view: a deck's cards in rows that scroll, as many to a row as fit, with no pad.

/**
 * How the grid screen lays out a deck's cards: in pages of six around the deck pad,
 * or in rows that scroll, with no pad (the grid view).
 */
export type Layout = "pad" | "grid";

/** How many rows Page Up and Page Down move, about a screen of cards. */
const PAGE_ROWS = 2;

/**
 * The card a move from the card at `index` lands on in the grid view, where a deck's `count`
 * cards fill rows of `columns`. Left and right go through the cards in order, up and down by row,
 * onto the last card when the row below is shorter, and Page Up and Page Down two rows at a time.
 * Home and End go to the first and last cards. Returns `index` when there's nowhere to go.
 */
export function rowMoveTarget(
  index: number,
  count: number,
  columns: number,
  move: CardMove,
): number {
  const row = Math.floor(index / columns);
  const lastRow = Math.floor((count - 1) / columns);
  const down = (rows: number) =>
    Math.min(index + Math.min(rows, lastRow - row) * columns, count - 1);
  const up = (rows: number) => index - Math.min(rows, row) * columns;
  switch (move) {
    case "left":
      return Math.max(index - 1, 0);
    case "right":
      return Math.min(index + 1, count - 1);
    case "up":
      return up(1);
    case "down":
      return down(1);
    case "previousPage":
      return up(PAGE_ROWS);
    case "nextPage":
      return down(PAGE_ROWS);
    case "first":
      return 0;
    case "last":
      return count - 1;
  }
}

/** How many columns a CSS grid has, from its computed track sizes. */
export function gridColumns(grid: Element): number {
  const tracks = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean);
  return Math.max(1, tracks.length);
}

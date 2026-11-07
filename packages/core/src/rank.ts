// Choosing `rank` values when the user reorders decks or cards. See "Reordering" in
// spec/vault-format.md.

/** Gives the item at `index` in the list passed to `planReorder` this rank. */
export interface RankWrite {
  index: number;
  rank: number;
}

/** Ranks with more decimals than this are too fine to read, so the order is renumbered instead. */
const MAX_DECIMALS = 8;

/**
 * The rank writes that move the item at `from` to position `to` in `items`, which must be in
 * display order (ranked items first, in ascending order). Usually that's one write: the moved
 * item gets a short number between its new neighbours. Items without a rank that would end up
 * before it get ranks too, since unranked items sort after ranked ones. When no number fits
 * between the neighbours, the items up to the last ranked one are renumbered 1, 2, 3…, which
 * writes only those whose rank changes.
 */
export function planReorder(
  items: readonly { rank?: number | undefined }[],
  from: number,
  to: number,
): RankWrite[] {
  if (from === to || !(from in items) || !(to in items)) return [];

  const order = items.map((_, index) => index).filter((index) => index !== from);
  order.splice(to, 0, from);
  const rankAt = (position: number) => items[order[position] ?? -1]?.rank;

  const writes: RankWrite[] = [];
  let previous: number | undefined;
  for (let position = 0; position < to; position++) {
    const index = order[position] ?? -1;
    const rank = rankAt(position) ?? after(previous);
    if (rankAt(position) === undefined) writes.push({ index, rank });
    previous = rank;
  }

  const next = rankAt(to + 1);
  const rank =
    previous === undefined
      ? next === undefined
        ? 1
        : before(next)
      : next === undefined
        ? after(previous)
        : between(previous, next);
  if (rank !== undefined) return [...writes, { index: from, rank }];

  let last = to;
  for (let position = to + 1; position < order.length; position++) {
    if (rankAt(position) !== undefined) last = position;
  }
  return order.slice(0, last + 1).flatMap((index, position) => {
    const renumbered = position + 1;
    return items[index]?.rank === renumbered ? [] : [{ index, rank: renumbered }];
  });
}

/**
 * The rank for an item added after the last of `items`, which must be in display order, as a card
 * created in a deck or moved into one: the whole number after the last item's rank. Undefined when
 * the last item has no rank, or there are no items: the added item then has no rank either, and
 * sorts among the other unranked items. Either way only the added item is written.
 */
export function rankAtEnd(items: readonly { rank?: number | undefined }[]): number | undefined {
  const last = items[items.length - 1]?.rank;
  return last === undefined ? undefined : after(last);
}

/** The first whole number after `rank`, or 1 at the start of the list. */
function after(rank: number | undefined): number {
  return rank === undefined ? 1 : Math.floor(rank) + 1;
}

function before(rank: number): number {
  return Math.ceil(rank) - 1;
}

/**
 * The number with the fewest decimals strictly between `low` and `high`, nearest to their
 * midpoint, or undefined when that would take more than `MAX_DECIMALS` decimals.
 */
function between(low: number, high: number): number | undefined {
  const middle = (low + high) / 2;
  for (let decimals = 0; decimals <= MAX_DECIMALS; decimals++) {
    const scale = 10 ** decimals;
    const candidate = Math.round(middle * scale) / scale;
    if (candidate > low && candidate < high) return candidate;
  }
  return undefined;
}

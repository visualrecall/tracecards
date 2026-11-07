import { planReorder } from "@tracecards/core";
import { useRef, useState } from "react";

/** Something that can be reordered: decks and cards. */
interface Ranked {
  rank?: number | undefined;
}

/** A rank to save for an item, planned by a reorder. */
export interface RankUpdate<T> {
  item: T;
  rank: number;
}

/**
 * How long a reorder keeps showing after its saves finish, at most, if the vault never catches up
 * with it (such as when the file is changed elsewhere meanwhile).
 */
const SETTLE_MS = 3000;

interface Pending {
  /** The items' keys in the order to show. */
  order: readonly string[];
  /** The ranks saved or being saved, by key. */
  ranks: ReadonlyMap<string, number>;
  /** How many saves haven't finished. */
  saving: number;
}

/**
 * Shows a reorder as soon as the user makes it, and saves it with `save`. Until the saves are done
 * and the items have the new ranks, the hook shows its own order and plans further reorders from
 * the ranks it saved. That way the user can reorder again right away. Saves run one after another. Returns the items in the order to show, and a function that
 * moves the item at `from` to `to`.
 */
export function usePendingOrder<T extends Ranked>(
  items: readonly T[],
  key: (item: T) => string,
  save: (updates: RankUpdate<T>[]) => Promise<boolean>,
): [shown: readonly T[], move: (from: number, to: number) => void] {
  const [pending, setPending] = useState<Pending | null>(null);
  const queue = useRef(Promise.resolve());

  // Once the saves are done and the vault has caught up, its own order is the same.
  if (pending && pending.saving === 0 && hasRanks(items, key, pending.ranks)) setPending(null);
  const shown = pending ? arrange(items, pending.order, key) : items;

  const move = (from: number, to: number) => {
    const planned = planMove(shown, key, pending?.ranks, from, to);
    if (!planned) return;
    const { order, ranks, updates } = planned;
    setPending((current) => ({ order, ranks, saving: (current?.saving ?? 0) + 1 }));

    queue.current = queue.current.then(async () => {
      if (!(await save(updates).catch(() => false))) {
        // Show what the vault has: some of the ranks may not have been saved.
        setPending(null);
        return;
      }
      setPending((current) => current && { ...current, saving: current.saving - 1 });
      window.setTimeout(() => {
        setPending((current) =>
          current?.order === order && current.saving === 0 ? null : current,
        );
      }, SETTLE_MS);
    });
  };

  return [shown, move];
}

/**
 * What moving the item at `from` to `to` in `shown` takes: the new order of keys, the ranks to
 * save, and all the ranks saved so far with them. Ranks in `saved` win over the items' own, which
 * may be out of date. Null when nothing needs saving.
 */
export function planMove<T extends Ranked>(
  shown: readonly T[],
  key: (item: T) => string,
  saved: ReadonlyMap<string, number> | undefined,
  from: number,
  to: number,
): { order: string[]; ranks: Map<string, number>; updates: RankUpdate<T>[] } | null {
  const ranks = new Map(saved);
  const planned = planReorder(
    shown.map((item) => ({ rank: ranks.get(key(item)) ?? item.rank })),
    from,
    to,
  );
  const updates = planned.flatMap(({ index, rank }) => {
    const item = shown[index];
    if (item === undefined) return [];
    ranks.set(key(item), rank);
    return [{ item, rank }];
  });
  if (updates.length === 0) return null;
  return { order: moveItem(shown.map(key), from, to), ranks, updates };
}

/** A copy of `list` with the item at `from` moved to `to`. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const result = [...list];
  const [item] = result.splice(from, 1);
  if (item !== undefined) result.splice(to, 0, item);
  return result;
}

/** Whether the items have these ranks. Items no longer there don't count. */
function hasRanks<T extends Ranked>(
  items: readonly T[],
  key: (item: T) => string,
  ranks: ReadonlyMap<string, number>,
): boolean {
  const byKey = new Map(items.map((item) => [key(item), item]));
  return [...ranks].every(([name, rank]) => {
    const item = byKey.get(name);
    return item === undefined || item.rank === rank;
  });
}

/** The items in `order`, followed by any it doesn't mention (such as a deck created meanwhile). */
function arrange<T>(items: readonly T[], order: readonly string[], key: (item: T) => string): T[] {
  const byKey = new Map(items.map((item) => [key(item), item]));
  const arranged = order.flatMap((name) => {
    const item = byKey.get(name);
    byKey.delete(name);
    return item === undefined ? [] : [item];
  });
  return [...arranged, ...byKey.values()];
}

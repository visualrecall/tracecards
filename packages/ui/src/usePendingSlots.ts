import type { Deck } from "@tracecards/core";
import { useRef, useState } from "react";
import type { DeckUpdate } from "./host";
import { moveItem } from "./usePendingOrder";

/** How long a move keeps showing after its saves finish, at most, if the vault never catches up. */
const SETTLE_MS = 3000;

interface Pending {
  /** The decks' names by slot, null for an empty slot, as they're to be shown. */
  order: readonly (string | null)[];
  /** The slots saved or being saved, from 1, by deck name. */
  saved: ReadonlyMap<string, number>;
  /** How many saves haven't finished. */
  saving: number;
}

/**
 * Shows a move on the deck pad as soon as the user makes it, and saves it with `save`, as
 * `usePendingOrder` does for ranks. `slots` is the whole pad, empty slots included, as the vault
 * has it. Until the saves are done and the decks are in their new slots, the hook shows its own
 * arrangement and plans further moves from the slots it saved. Returns the slots to show, and a
 * function that moves the deck in slot `from` to slot `to` (from 0), sliding the slots between,
 * empty ones too, along by one.
 */
export function usePendingSlots<T extends Deck>(
  slots: readonly (T | undefined)[],
  save: (updates: DeckUpdate[]) => Promise<boolean>,
): [shown: readonly (T | undefined)[], move: (from: number, to: number) => void] {
  const [pending, setPending] = useState<Pending | null>(null);
  const queue = useRef(Promise.resolve());

  const names = slots.map((deck) => deck?.name ?? null);
  // Once the saves are done and the vault has caught up, its own slots are the same. A deck
  // attached or detached meanwhile makes the arrangement out of date, so the vault's is shown.
  if (pending && (pending.saving === 0 ? same(names, pending.order) : !sameDecks(names, pending))) {
    setPending(null);
  }
  const shown = pending ? arrange(slots, pending.order) : slots;

  const move = (from: number, to: number) => {
    if (from === to || shown[from] === undefined) return;
    const next = moveItem(shown, from, to);
    const saved = new Map(pending?.saved);
    const updates = next.flatMap((deck, index) => {
      if (!deck || (saved.get(deck.name) ?? deck.pad) === index + 1) return [];
      saved.set(deck.name, index + 1);
      return [{ deck, pad: index + 1 }];
    });
    if (updates.length === 0) return;
    const order = next.map((deck) => deck?.name ?? null);
    setPending((current) => ({ order, saved, saving: (current?.saving ?? 0) + 1 }));

    queue.current = queue.current.then(async () => {
      if (!(await save(updates).catch(() => false))) {
        // Show what the vault has: some of the slots may not have been saved.
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

function same(a: readonly (string | null)[], b: readonly (string | null)[]): boolean {
  return a.length === b.length && a.every((name, index) => name === b[index]);
}

/** Whether the pad holds the same decks as the pending arrangement, in whatever slots. */
function sameDecks(names: readonly (string | null)[], pending: Pending): boolean {
  const onPad = names.filter((name) => name !== null);
  const planned = new Set(pending.order.filter((name) => name !== null));
  return onPad.length === planned.size && onPad.every((name) => planned.has(name));
}

/** The decks in `slots` put in the slots `order` names. */
function arrange<T extends Deck>(
  slots: readonly (T | undefined)[],
  order: readonly (string | null)[],
): (T | undefined)[] {
  const byName = new Map(slots.flatMap((deck) => (deck ? [[deck.name, deck] as const] : [])));
  return order.map((name) => (name === null ? undefined : byName.get(name)));
}

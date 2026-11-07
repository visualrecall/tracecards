import { type Deck, PAD_SLOTS, validateTitle } from "@tracecards/core";
import { type DeckUpdate, type Host, type MenuEntry, promptText } from "./host";
import { ICONS } from "./icons";
import { titleProblemMessage } from "./titles";
import type { RankUpdate } from "./usePendingOrder";

// What the user can do with decks. The screens and the app's commands share these, so the
// questions asked and the checks made are the same everywhere.

export { PAD_SLOTS };

/**
 * The deck pad's slots, each with its deck or undefined when it's empty. Until
 * workspaces give each set of decks its own pad, the pad holds one set: the decks the user has
 * attached, each in the slot its `pad` names. When two decks name the same slot, as after a sync
 * conflict, the later one in `decks` goes in the first empty slot, or off the pad when it's full.
 */
export function padSlots<T extends Deck>(decks: readonly T[]): (T | undefined)[] {
  const slots: (T | undefined)[] = Array.from({ length: PAD_SLOTS }, () => undefined);
  const displaced: T[] = [];
  for (const deck of decks) {
    if (deck.pad === undefined) continue;
    if (slots[deck.pad - 1] === undefined) slots[deck.pad - 1] = deck;
    else displaced.push(deck);
  }
  for (const deck of displaced) {
    const free = slots.indexOf(undefined);
    if (free >= 0) slots[free] = deck;
  }
  return slots;
}

/** The decks on the pad, in slot order. */
export function padDecks<T extends Deck>(decks: readonly T[]): T[] {
  return padSlots(decks).filter((deck) => deck !== undefined);
}

/** The decks that aren't on the pad, in order, which can be attached while it has room. */
export function offPadDecks<T extends Deck>(decks: readonly T[]): T[] {
  const onPad = new Set(padDecks(decks));
  return decks.filter((deck) => !onPad.has(deck));
}

/** The deck the grid shows for the selected name: that deck, or the first on the pad. */
export function shownDeck(decks: readonly Deck[], selected: string | null): Deck | undefined {
  return decks.find((deck) => deck.name === selected) ?? padDecks(decks)[0] ?? decks[0];
}

/**
 * The decks as a menu, with the one shown checked, as the deck title opens it: the pad's, or in
 * the grid view, all of them.
 */
export function deckSwitcherMenu(
  decks: readonly Deck[],
  shown: Deck | undefined,
  onSelect: (name: string) => void,
): MenuEntry[] {
  return decks.map((deck) => ({
    title: deck.name,
    icon: deck.icon ?? ICONS.deck,
    checked: deck === shown,
    onClick: () => onSelect(deck.name),
  }));
}

/**
 * Asks for a name and creates the deck, on the pad when it has room: in `slot` (from 0) when it's
 * given, or the first empty one. Resolves to the new deck's name, or null.
 */
export async function newDeck(
  host: Host,
  decks: readonly Deck[],
  slot?: number,
): Promise<string | null> {
  const input = await promptText(host, {
    title: "New deck",
    cta: "Create",
    placeholder: "Deck name",
    validate: (value) => deckNameProblem(value, decks),
  });
  if (input === null) return null;
  const name = input.trim();
  if (!(await host.createDeck(name))) return null;
  // `decks` is from before the deck was made, so it's stood in for to attach it: a new folder is
  // a deck with no `_deck.md` and no cards.
  if (padDecks(decks).length < PAD_SLOTS) {
    const created: Deck = { name, hasDeckFile: false, cards: [] };
    await attachDeck(host, decks, created, slot);
  }
  return name;
}

/**
 * The deck's context menu: detach from or attach to the pad, rename, change icon, print, and delete
 * (in red). `onDetached` is told which deck on the pad is next to the one detached, so the screen
 * can switch to it.
 */
export function deckMenu(
  host: Host,
  decks: readonly Deck[],
  deck: Deck,
  onDetached?: (next: Deck | undefined) => void,
): MenuEntry[] {
  const onPad = padDecks(decks).includes(deck);
  return [
    onPad
      ? {
          title: "Detach from pad",
          icon: ICONS.detach,
          onClick: () => void detachDeck(host, decks, deck, onDetached),
        }
      : {
          title: "Attach to pad",
          icon: ICONS.attach,
          onClick: () => void attachDeck(host, decks, deck),
        },
    { title: "Rename…", icon: ICONS.edit, onClick: () => void renameDeck(host, decks, deck) },
    {
      title: "Change icon…",
      icon: ICONS.changeIcon,
      onClick: () => void changeDeckIcon(host, deck),
    },
    { title: "Print…", icon: ICONS.print, onClick: () => host.showPrintDialog(deck) },
    // A line apart from the rest, so Delete isn't hit by mistake next to Detach.
    "separator",
    {
      title: "Delete…",
      icon: ICONS.delete,
      warning: true,
      onClick: () => void deleteDeck(host, deck),
    },
  ];
}

/**
 * What an empty slot of the pad does: a search to pick a deck that isn't on the pad
 * to attach there, or to create a new deck there. With no deck to attach, it goes straight to
 * creating one. `slot` counts from 0. `onSelect` is told the deck that was attached or created.
 */
export async function fillSlot(
  host: Host,
  decks: readonly Deck[],
  slot: number,
  onSelect: (name: string) => void,
): Promise<void> {
  const off = offPadDecks(decks);
  const choice = off.length === 0 ? "new" : await host.pickDeck(off);
  if (choice === null) return;
  if (choice === "new") {
    const name = await newDeck(host, decks, slot);
    if (name) onSelect(name);
  } else if (await attachDeck(host, decks, choice, slot)) {
    onSelect(choice.name);
  }
}

/**
 * Takes the deck off the pad. It stays a deck, with its cards, in the deck list and in search,
 * and its slot stays empty: the other decks keep theirs.
 */
async function detachDeck(
  host: Host,
  decks: readonly Deck[],
  deck: Deck,
  onDetached?: (next: Deck | undefined) => void,
): Promise<void> {
  const pad = padDecks(decks);
  const index = pad.indexOf(deck);
  const next = pad[index + 1] ?? pad[index - 1];
  if (await host.updateDecks([{ deck, pad: null }])) onDetached?.(next);
}

/**
 * Puts the deck on the pad: in `slot` (from 0) when it's given and empty, or else in the first
 * empty slot.
 */
async function attachDeck(
  host: Host,
  decks: readonly Deck[],
  deck: Deck,
  slot?: number,
): Promise<boolean> {
  const slots = padSlots(decks);
  const target = slot !== undefined && slots[slot] === undefined ? slot : slots.indexOf(undefined);
  if (target < 0) {
    host.notify(`The deck pad is full: it holds ${PAD_SLOTS} decks. Detach one first.`);
    return false;
  }
  return host.updateDecks([{ deck, pad: target + 1 }]);
}

/**
 * What dropping `deck` in `slot` (from 0) of the pad writes, when `occupant` is the deck showing
 * there: the occupant comes off the pad, and `deck` takes the slot, leaving its own slot empty if it
 * was on the pad. The occupant isn't moved to an empty slot, nor to the one `deck` leaves. It's
 * written first, so no two decks name the slot meanwhile.
 */
export function slotUpdates(deck: Deck, occupant: Deck | undefined, slot: number): DeckUpdate[] {
  if (occupant?.name === deck.name) return [];
  const pad = slot + 1;
  return occupant
    ? [
        { deck: occupant, pad: null },
        { deck, pad },
      ]
    : [{ deck, pad }];
}

/** The pad's slots once `deck` is dropped in `slot` (from 0), as `slotUpdates` leaves them. */
export function placeInSlot<T extends Deck>(
  slots: readonly (T | undefined)[],
  deck: T,
  slot: number,
): (T | undefined)[] {
  return slots.map((item, index) =>
    index === slot ? deck : item?.name === deck.name ? undefined : item,
  );
}

/** Saves dropping `deck` in `slot` of the pad, where `occupant` is showing (see `slotUpdates`). */
export async function placeDeck(
  host: Host,
  deck: Deck,
  occupant: Deck | undefined,
  slot: number,
): Promise<boolean> {
  const updates = slotUpdates(deck, occupant, slot);
  return updates.length === 0 || (await host.updateDecks(updates));
}

/** Saves the ranks a reorder of the decks planned. */
export function saveDeckRanks(host: Host, updates: RankUpdate<Deck>[]): Promise<boolean> {
  return host.updateDecks(updates.map(({ item, rank }) => ({ deck: item, rank })));
}

async function renameDeck(host: Host, decks: readonly Deck[], deck: Deck): Promise<void> {
  const input = await promptText(host, {
    title: "Rename deck",
    cta: "Rename",
    value: deck.name,
    validate: (value) => deckNameProblem(value, decks, deck),
  });
  const name = input?.trim();
  if (name && name !== deck.name) await host.renameDeck(deck, name);
}

async function changeDeckIcon(host: Host, deck: Deck): Promise<void> {
  const icon = await host.pickIcon();
  if (icon && icon !== deck.icon) await host.updateDecks([{ deck, icon }]);
}

async function deleteDeck(host: Host, deck: Deck): Promise<void> {
  const cards = deck.cards.length;
  const confirmed = await host.confirm({
    title: "Delete deck",
    message:
      cards === 0
        ? `Delete “${deck.name}”?`
        : `Delete “${deck.name}” and its ${cards === 1 ? "card" : `${cards} cards`}?`,
    cta: "Delete",
    destructive: true,
  });
  if (confirmed) await host.trashDeck(deck);
}

/** Why a typed deck name can't be used, or null when it can. `current` is the deck renamed. */
function deckNameProblem(input: string, decks: readonly Deck[], current?: Deck): string | null {
  const check = validateTitle(input, "deck");
  if (!check.ok) return titleProblemMessage(check, "deck");
  // File systems on macOS and Windows ignore case, so “books” would be the “Books” folder.
  const name = check.title.toLowerCase();
  const taken = decks.find((deck) => deck !== current && deck.name.toLowerCase() === name);
  return taken ? `There’s already a deck called “${taken.name}”.` : null;
}

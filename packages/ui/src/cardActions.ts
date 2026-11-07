import { type Card, cardDeckName, type Deck, rankAtEnd, validateTitle } from "@tracecards/core";
import type { CardEdit, Confirmation, Host, MenuEntry } from "./host";
import { ICONS } from "./icons";
import { titleProblemMessage } from "./titles";
import type { RankUpdate } from "./usePendingOrder";

// What the user can do with cards. The screens and the app's commands share these, so the
// questions asked and the checks made are the same everywhere.

/** Asked before the card form closes with changes that haven't been saved. */
export const DISCARD_CHANGES: Confirmation = {
  title: "Unsaved changes",
  message: "You have unsaved changes. Close without saving them?",
  cta: "Close",
  destructive: true,
};

/**
 * Shows the card form for a new card in `deck`, or in the first deck. The card goes at the end of
 * the deck it's saved to. Resolves to its path once the form has closed, or null when no card was
 * created.
 */
export async function newCard(
  host: Host,
  decks: readonly Deck[],
  deck?: Deck,
): Promise<string | null> {
  const initial = deck ?? decks[0];
  if (!initial) {
    host.notify("Create a deck first: cards are kept in decks.");
    return null;
  }
  let created: string | null = null;
  await host.showCardForm({
    decks,
    deck: initial,
    save: async ({ title, description, deck: target, cover }) => {
      created = await host.createCard({
        deck: target,
        title,
        description: description || undefined,
        rank: rankAtEnd(target.cards),
        // A new card has no cover to re-crop or remove.
        cover: cover && "image" in cover ? cover : undefined,
      });
      return created !== null;
    },
  });
  return created;
}

/**
 * The card's context menu: moving it, editing it and deleting it. The decks to
 * move it to are in a submenu, with its own checked, so Edit and Delete stay at hand however many
 * decks there are. `onLeave` is called when the card is about to
 * leave its deck.
 */
export function cardMenu(
  host: Host,
  decks: readonly Deck[],
  card: Card,
  onLeave: () => void,
): MenuEntry[] {
  const current = cardDeckName(card.path);
  return [
    {
      title: "Move to",
      icon: ICONS.move,
      entries: decks.map((deck) => ({
        title: deck.name,
        icon: deck.icon ?? ICONS.deck,
        checked: deck.name === current,
        onClick: () => {
          if (deck.name !== current) void moveCard(host, card, deck, onLeave);
        },
      })),
    },
    { title: "Edit card…", icon: ICONS.edit, onClick: () => void editCard(host, decks, card) },
    {
      title: "Delete…",
      icon: ICONS.delete,
      warning: true,
      onClick: () => void deleteCard(host, card, onLeave),
    },
  ];
}

/**
 * Moves the card to the end of `deck`, unless a card there has the same title. `onLeave` is called
 * just before. Resolves to whether it moved.
 */
export async function moveCard(
  host: Host,
  card: Card,
  deck: Deck,
  onLeave?: () => void,
): Promise<boolean> {
  const problem = moveProblem(card, deck);
  if (problem) {
    host.notify(problem);
    return false;
  }
  onLeave?.();
  return host.moveCard(card, deck, rankAtEnd(deck.cards));
}

/** Why the card can't move to `deck`, or null when it can. */
export function moveProblem(card: Card, deck: Deck): string | null {
  const taken = sameTitle(deck, card.title);
  return taken ? `“${deck.name}” already has a card called “${taken.title}”.` : null;
}

/** Saves the ranks a reorder of a deck's cards planned. */
export function saveCardRanks(host: Host, updates: RankUpdate<Card>[]): Promise<boolean> {
  return host.updateCards(updates.map(({ item, rank }) => ({ card: item, rank })));
}

/** The longest card title the card form and the opened card take. */
export const MAX_TITLE = 60;

/**
 * The longest card description the card form and the opened card take. A line of the card holds
 * about 28 characters, and the card has room for eight lines under a title of one line, seven
 * under two and six under three. Measured on ordinary text, 180 characters show in full under a
 * title of one line every time, under two lines 98 times in 100, and under three about six in ten,
 * the rest losing the end of the last line, faded; 200 would cut one in seven under two lines.
 * Characters rather than words, since a long word or a web address takes as much room as its
 * length. A longer description already in a file is left as it is, and the card fades it out where
 * it's cut off.
 */
export const MAX_DESCRIPTION = 180;

/** A title as one line: each line break, with the spaces round it, becomes one space. */
export function oneLineTitle(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, " ");
}

/**
 * Text cut to at most `length` characters as a field's `maxLength` counts them (UTF-16 units),
 * one fewer when the cut would split an emoji or another character that takes two.
 */
export function cutText(text: string, length: number): string {
  if (text.length <= length) return text;
  const end = Math.max(0, length);
  const last = text.charCodeAt(end - 1);
  return text.slice(0, last >= 0xd800 && last <= 0xdbff ? end - 1 : end);
}

/** The card form's title and description after a change made to them together. */
export interface CardWordsChange {
  title: string;
  description: string;
  /** Where the cursor goes in the description. */
  caret: number;
}

/**
 * Enter in the card form's title, its selection from `start` to `end`: what's after the selection
 * starts the description, above what's there. Null when nothing's after it, or when the
 * description has no room for it, since moving text mustn't cut any: the cursor only goes to the
 * description then, as Backspace at the description's start only goes to the title when the two
 * don't fit in it.
 */
export function splitTitle(
  value: string,
  start: number,
  end: number,
  description: string,
): CardWordsChange | null {
  // Kept as it is, spaces too, so Backspace joins the two back as they were.
  const rest = value.slice(end);
  if (rest.trim() === "") return null;
  const joined = description === "" ? rest : `${rest}\n${description}`;
  if (joined.length > MAX_DESCRIPTION) return null;
  return { title: value.slice(0, start), description: joined, caret: 0 };
}

/**
 * Text of more than one line pasted into the card form's title, over its selection from `start`
 * to `end`: the first line goes in the title, and the rest starts the description, followed by
 * what was after the selection in the title, then the description that was there. Only the pasted
 * text is cut to the room the limits leave, never what the card had, even when that alone is over
 * the description's limit, as an older file's description can be. Null for text of one line, which
 * the title takes as it is.
 */
export function pasteIntoTitle(
  value: string,
  start: number,
  end: number,
  pasted: string,
  description: string,
): CardWordsChange | null {
  const [first = "", ...others] = pasted.trim().split(/\r?\n/);
  if (others.length === 0) return null;
  const titleRest = value.slice(end);
  const had = titleRest.length + (description === "" ? 0 : description.length + 1);
  const rest = cutText(others.join("\n").trim(), MAX_DESCRIPTION - had);
  return {
    title: cutText(value.slice(0, start) + first.trim(), MAX_TITLE),
    description: [rest + titleRest, description].filter((part) => part !== "").join("\n"),
    caret: rest.length,
  };
}

/**
 * Why a typed card title can't be used in `deck`, or null when it can. `current` is the card
 * being edited.
 */
export function cardTitleProblem(input: string, deck: Deck, current?: Card): string | null {
  const check = validateTitle(input, "card");
  if (!check.ok) return titleProblemMessage(check, "card");
  const taken = sameTitle(deck, check.title, current);
  return taken ? `There’s already a card called “${taken.title}” in “${deck.name}”.` : null;
}

/** Shows the card form for the card, which renames it and changes its description and cover. */
async function editCard(host: Host, decks: readonly Deck[], card: Card): Promise<void> {
  const deck = decks.find((candidate) => candidate.name === cardDeckName(card.path));
  if (!deck) return;
  await host.showCardForm({
    card,
    decks,
    deck,
    save: ({ title, description, cover }) => {
      const edit: CardEdit = {};
      if (title !== card.title) edit.title = title;
      if (description !== (card.description ?? "")) edit.description = description;
      if (cover !== undefined) edit.cover = cover;
      return Object.keys(edit).length === 0 ? Promise.resolve(true) : host.editCard(card, edit);
    },
  });
}

/** Asks, then deletes the card. `onLeave` is called just before it leaves its deck. */
export async function deleteCard(host: Host, card: Card, onLeave: () => void): Promise<void> {
  const confirmed = await host.confirm({
    title: "Delete card",
    message: `Delete “${card.title}”?`,
    cta: "Delete",
    destructive: true,
  });
  if (!confirmed) return;
  onLeave();
  await host.trashCard(card);
}

/** The card in `deck` with this title in any letter case, other than `except`. */
function sameTitle(deck: Deck, title: string, except?: Card): Card | undefined {
  // File systems on macOS and Windows ignore case, so “Ideas” would be the “ideas” file.
  const name = title.toLowerCase();
  return deck.cards.find((card) => card.path !== except?.path && card.title.toLowerCase() === name);
}

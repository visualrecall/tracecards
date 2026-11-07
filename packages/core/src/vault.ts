// Builds the vault model from a listing of the vault folder. See spec/vault-format.md.
import type { ParsedFrontmatter } from "./frontmatter";
import type { Card, Deck, Vault } from "./model";
import { normalizeCard, normalizeDeck } from "./normalize";

/** A folder or file under the vault root, with a path relative to the root using `/`. */
export type VaultEntry =
  | { type: "folder"; path: string }
  | {
      type: "file";
      path: string;
      /** Only needed for `.md` files. A file without frontmatter has `{ ok: true, data: {} }`. */
      frontmatter: ParsedFrontmatter;
    };

/** The file in a deck's folder that holds the deck's fields. */
export const DECK_FILE = "_deck.md";
/** The folder for images, in the vault root. */
export const ATTACHMENTS = "attachments";

/** The name of the deck a card is in, from its path: the first folder in it. */
export function cardDeckName(cardPath: string): string {
  return cardPath.slice(0, cardPath.indexOf("/"));
}

/** The card at this path, relative to the vault root, looked for in its deck only. */
export function findCard(decks: readonly Deck[], path: string): Card | undefined {
  const deckName = cardDeckName(path);
  return decks.find((deck) => deck.name === deckName)?.cards.find((card) => card.path === path);
}

/**
 * Whether the file at this path, relative to the vault root, is a card: a `.md` file in a deck's
 * folder, or in a folder inside it, other than `_deck.md`, outside the attachments folder and
 * hidden folders.
 */
export function isCardPath(path: string): boolean {
  const segments = path.split("/");
  const [deckName] = segments;
  return (
    segments.length > 1 &&
    deckName !== ATTACHMENTS &&
    !segments.some((segment) => segment.startsWith(".")) &&
    path.endsWith(".md") &&
    segments[segments.length - 1] !== DECK_FILE
  );
}

/** Builds decks and cards from every entry under the vault root, applying the spec's rules. */
export function buildVault(entries: Iterable<VaultEntry>): Vault {
  const decks = new Map<string, Deck>();
  const deckFor = (name: string): Deck => {
    let deck = decks.get(name);
    if (!deck) {
      deck = { name, hasDeckFile: false, cards: [] };
      decks.set(name, deck);
    }
    return deck;
  };

  for (const entry of entries) {
    const segments = entry.path.split("/");
    const [deckName] = segments;
    if (deckName === undefined || deckName === ATTACHMENTS) continue;
    if (segments.some((segment) => segment.startsWith("."))) continue;

    if (entry.type === "folder") {
      if (segments.length === 1) deckFor(deckName);
      continue;
    }
    const fileName = segments[segments.length - 1] ?? "";
    if (fileName === DECK_FILE) {
      // A `_deck.md` in a sub-folder is neither deck metadata nor a card.
      if (segments.length === 2) {
        Object.assign(deckFor(deckName), normalizeDeck(entry.frontmatter), { hasDeckFile: true });
      }
      continue;
    }
    if (!isCardPath(entry.path)) continue;

    deckFor(deckName).cards.push({
      path: entry.path,
      title: fileName.slice(0, -".md".length),
      ...normalizeCard(entry.frontmatter),
    });
  }

  const sorted = [...decks.values()];
  dropDuplicateIds(sorted.flatMap((deck) => deck.cards));
  for (const deck of sorted) deck.cards.sort(compareCards);
  sorted.sort(compareDecks);
  return { decks: sorted };
}

/** When cards share an id, the card whose path comes first keeps it. */
function dropDuplicateIds(cards: Card[]): void {
  const seen = new Set<string>();
  for (const card of [...cards].sort((a, b) => compareCodeUnits(a.path, b.path))) {
    if (card.id === undefined) continue;
    if (seen.has(card.id)) delete card.id;
    else seen.add(card.id);
  }
}

const collator = new Intl.Collator("en", { numeric: true });

function compareDecks(a: Deck, b: Deck): number {
  return compareOptional(a.rank, b.rank) || collator.compare(a.name, b.name);
}

function compareCards(a: Card, b: Card): number {
  return (
    compareOptional(a.rank, b.rank) ||
    compareOptional(createdTime(a), createdTime(b)) ||
    collator.compare(a.title, b.title) ||
    compareCodeUnits(a.path, b.path)
  );
}

/** Ascending, with missing values last. */
function compareOptional(a: number | undefined, b: number | undefined): number {
  if (a === undefined) return b === undefined ? 0 : 1;
  if (b === undefined) return -1;
  return a - b;
}

function createdTime(card: Card): number | undefined {
  return card.created === undefined ? undefined : Date.parse(card.created);
}

function compareCodeUnits(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

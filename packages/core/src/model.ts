// The in-memory model of a vault, as read from its files. See spec/vault-format.md.

export interface Vault {
  /** Decks in display order. */
  decks: Deck[];
}

/** The deck pad's slots: two rows of four. */
export const PAD_SLOTS = 8;

export interface Deck {
  /** Folder name. It is also the deck's path relative to the vault root. */
  name: string;
  /** Lucide icon name. */
  icon?: string;
  /** Title of the card whose cover is used as the deck cover. */
  cover?: string;
  rank?: number;
  /**
   * The deck's slot on the deck pad, from 1 to `PAD_SLOTS`, when it's on the pad. Decks aren't on
   * it until the user puts them there.
   */
  pad?: number;
  /** Whether the deck folder has a `_deck.md` file. */
  hasDeckFile: boolean;
  /** Cards in display order. */
  cards: Card[];
}

/** Only `idea` exists so far. Unknown kinds are read as `idea`. */
export type CardKind = "idea";

export interface Card {
  /** Path relative to the vault root, e.g. `Books/Psychology/Thinking, Fast and Slow.md`. */
  path: string;
  /** File name without `.md`. */
  title: string;
  /** Missing when the file has none, or when a card earlier in path order has the same id. */
  id?: string;
  kind: CardKind;
  description?: string;
  /** Wikilink target of the cover image, e.g. `jtbd-cover.webp`. */
  cover?: string;
  coverCrop?: CoverCrop;
  rank?: number;
  /** ISO 8601 creation time, as written in the file. */
  created?: string;
  bookmarks: Bookmark[];
  /** Set when the frontmatter can't be parsed. The card's fields are then empty. */
  frontmatterError?: string;
}

/** Visible part of the cover as `[x, y, width, height]`, each a fraction of the image size. */
export type CoverCrop = readonly [x: number, y: number, width: number, height: number];

export interface Bookmark {
  url: string;
  title?: string;
  primary: boolean;
  /** Set when the URL is a YouTube video. */
  videoId?: string;
}

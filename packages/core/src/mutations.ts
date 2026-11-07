// The changes Tracecards makes to cards' and decks' fields, following "Setting a cover", "Adding
// cards", "Changing bookmarks" and "Ids" in spec/vault-format.md. Each change works on a
// frontmatter object in place, so it can run inside the app's own update of the file (such as
// Obsidian's `processFrontMatter`), which keeps the fields it doesn't touch, and the note.
import { newFile } from "./frontmatter";
import type { Card, CoverCrop, Deck } from "./model";

/** A card's or deck's frontmatter fields, by name. */
export type Frontmatter = Record<string, unknown>;

/** Sets the description, or removes it when it's empty. */
export function setDescription(frontmatter: Frontmatter, description: string): void {
  if (description === "") delete frontmatter.description;
  else frontmatter.description = description;
}

/**
 * Points the cover at the image with this file name, or with null removes the cover and its crop.
 * The crop for a new image is set after, with `setCoverCrop`.
 */
export function setCover(frontmatter: Frontmatter, fileName: string | null): void {
  if (fileName === null) {
    delete frontmatter.cover;
    delete frontmatter["cover-crop"];
  } else {
    // The bare name, which is unique in the vault (see `coverFileName`).
    frontmatter.cover = `[[${fileName}]]`;
  }
}

/** Sets the part of the cover that shows, or removes it to show the whole image. */
export function setCoverCrop(frontmatter: Frontmatter, crop: CoverCrop | undefined): void {
  if (crop) frontmatter["cover-crop"] = [...crop];
  else delete frontmatter["cover-crop"];
}

/** Sets the rank, or removes it so the card or deck sorts among the unranked ones. */
export function setRank(frontmatter: Frontmatter, rank: number | undefined): void {
  if (rank === undefined) delete frontmatter.rank;
  else frontmatter.rank = rank;
}

/** Puts the deck in a slot of the deck pad, or with null takes it off by removing the field. */
export function setPad(frontmatter: Frontmatter, slot: number | null): void {
  if (slot === null) delete frontmatter.pad;
  else frontmatter.pad = slot;
}

/**
 * Gives the card an id from `newId`, unless its frontmatter has one that no other card in `decks`
 * has. Only run it alongside another change: a file is never written just to add an id. The id is
 * read from the frontmatter rather than `card`, which doesn't have the id an earlier save gave it
 * until the vault is read again.
 */
export function ensureId(
  frontmatter: Frontmatter,
  card: Card,
  decks: readonly Deck[],
  newId: () => string,
): void {
  const id = typeof frontmatter.id === "string" ? frontmatter.id.trim() : "";
  // `buildVault` has already taken the id from the later of two cards that share it.
  const own =
    id !== "" &&
    !decks.some((deck) => deck.cards.some((other) => other.id === id && other.path !== card.path));
  if (!own) frontmatter.id = newId();
}

/** A bookmark's fields as Tracecards writes them. An empty title is left out. */
export interface BookmarkFields {
  url: string;
  title?: string;
}

/** Adds the bookmark at the end of the card's list. */
export function addBookmark(frontmatter: Frontmatter, bookmark: BookmarkFields): void {
  const fields: Frontmatter = { url: bookmark.url };
  if (bookmark.title) fields.title = bookmark.title;
  const list = bookmarkList(frontmatter);
  if (list) list.push(fields);
  else frontmatter.bookmarks = [fields];
}

/** Changes the URL and title of the bookmark with this URL, keeping its other fields. */
export function editBookmark(
  frontmatter: Frontmatter,
  url: string,
  bookmark: BookmarkFields,
): void {
  const fields = findBookmark(frontmatter, url);
  fields.url = bookmark.url;
  if (bookmark.title) fields.title = bookmark.title;
  else delete fields.title;
}

/** Removes the bookmark with this URL, and the `bookmarks` field with the last one. */
export function removeBookmark(frontmatter: Frontmatter, url: string): void {
  const fields = findBookmark(frontmatter, url);
  const list = bookmarkList(frontmatter) ?? [];
  list.splice(list.indexOf(fields), 1);
  if (list.length === 0) delete frontmatter.bookmarks;
}

/** Makes the bookmark with this URL the primary one, or with null leaves the card without one. */
export function setPrimaryBookmark(frontmatter: Frontmatter, url: string | null): void {
  const primary = url === null ? null : findBookmark(frontmatter, url);
  for (const item of bookmarkList(frontmatter) ?? []) {
    if (!isFields(item)) continue;
    if (item === primary) item.primary = true;
    else delete item.primary;
  }
}

/** The card's `bookmarks` list, or undefined when it has none. */
function bookmarkList(frontmatter: Frontmatter): unknown[] | undefined {
  const list = frontmatter.bookmarks;
  if (list === undefined || list === null) return undefined;
  // A value of the wrong type is ignored when the card is read, but it isn't overwritten.
  if (!Array.isArray(list)) throw new Error("its bookmarks field isn't a list");
  return list as unknown[];
}

/**
 * The bookmark with this URL, as the model reads it: trimmed. When several have it (only possible
 * when written by hand), the first.
 */
function findBookmark(frontmatter: Frontmatter, url: string): Frontmatter {
  const fields = bookmarkList(frontmatter)?.find(
    (item): item is Frontmatter =>
      isFields(item) && typeof item.url === "string" && item.url.trim() === url,
  );
  if (!fields) throw new Error("the bookmark isn't in the card's file any more");
  return fields;
}

function isFields(value: unknown): value is Frontmatter {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface NewCardFields {
  id: string;
  /** Written in UTC, to the second. */
  created: Date;
  description?: string;
  /** The file name of the cover image. */
  cover?: string;
  /** The cover's crop, written only with a cover. */
  coverCrop?: CoverCrop;
  rank?: number;
  /** The card's bookmarks, in order. The first is its primary bookmark. */
  bookmarks?: readonly BookmarkFields[];
}

/** The text of a new card's file: its fields in the spec's order, leaving out the empty ones. */
export function newCardFile(card: NewCardFields): string {
  const fields: Frontmatter = { id: card.id };
  if (card.description) fields.description = card.description;
  if (card.cover !== undefined) {
    setCover(fields, card.cover);
    setCoverCrop(fields, card.coverCrop);
  }
  if (card.rank !== undefined) fields.rank = card.rank;
  fields.created = card.created.toISOString().replace(/\.\d{3}Z$/, "Z");
  for (const bookmark of card.bookmarks ?? []) addBookmark(fields, bookmark);
  const primary = card.bookmarks?.[0];
  if (primary) setPrimaryBookmark(fields, primary.url);
  return newFile(fields);
}

/**
 * The file name for a card's cover image: the card's title with the image's extension, with ` 1`,
 * ` 2` and so on added while a file in `existing` has that name. Letter case is ignored, as it is
 * by file systems on macOS and Windows.
 */
export function coverFileName(
  title: string,
  extension: string,
  existing: Iterable<string>,
): string {
  const taken = new Set(Array.from(existing, (name) => name.toLowerCase()));
  let name = `${title}.${extension}`;
  for (let number = 1; taken.has(name.toLowerCase()); number++) {
    name = `${title} ${number}.${extension}`;
  }
  return name;
}

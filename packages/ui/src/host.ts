import type { BookmarkFields, Card, CoverCrop, Deck } from "@tracecards/core";
import { createContext, type ReactNode, use } from "react";
import type { CoverImage } from "./coverImage";
import type { TitleCase } from "./titleCase";

/**
 * What the screens need from the app they run in. The Obsidian plugin implements it with
 * Obsidian's API; the standalone app will implement it with its own.
 */
export interface Host {
  /** URL of the card's cover image, or null when it has none or the link isn't an image. */
  coverUrl: (card: Card) => string | null;
  /** Opens the card. `event` is the click or key press, so modifier keys can be honoured. */
  openCard: (card: Card, event?: MouseEvent | KeyboardEvent) => void;
  /** Draws the named icon into `element`, replacing its contents. */
  setIcon: (element: HTMLElement, icon: string) => void;

  /**
   * Shows a menu at the pointer, or at the element when it was opened from the keyboard. With
   * `anchor`, such as the button that opened it, the menu opens below that instead.
   */
  showMenu: (entries: MenuEntry[], event: MouseEvent, anchor?: HTMLElement) => void;
  /**
   * Asks for one or more lines of text, each in its own field. Resolves to what the user entered,
   * or null when cancelled. `promptText` asks for one.
   */
  promptFields: (prompt: FieldsPrompt) => Promise<string[] | null>;
  /** Asks the user to confirm an action. */
  confirm: (confirmation: Confirmation) => Promise<boolean>;
  /** Lets the user choose a Lucide icon. Resolves to its name, or null when cancelled. */
  pickIcon: () => Promise<string | null>;
  /**
   * Lets the user search `decks` for one to put on the deck pad, or choose to create a new deck.
   * Resolves to the deck, "new", or null when cancelled.
   */
  pickDeck: (decks: readonly Deck[]) => Promise<Deck | "new" | null>;
  /**
   * Shows `CardForm` in a modal. Closing it with unsaved changes asks `DISCARD_CHANGES` first.
   * Resolves once it has closed.
   */
  showCardForm: (form: CardFormRequest) => Promise<void>;
  /** Shows a short message that goes away by itself. */
  notify: (message: string) => void;
  /** The title YouTube gives a video, or null when it can't be had. */
  videoTitle: (url: string) => Promise<string | null>;
  /** The Pixabay API key set on this device, or null when there's none. */
  pixabayKey: () => string | null;
  /** How cards show their titles. */
  titleCase: () => TitleCase;
  /** Opens Tracecards' settings, where the Pixabay key is set. */
  openSettings: () => void;
  /**
   * Sends a request, without the limits a web page has on reaching other sites. Rejects when it
   * can't be reached; any answer, an error status too, resolves.
   */
  send: (request: HttpRequest) => Promise<HttpResponse>;
  /** What printing a deck needs from this device. */
  printing: Printing;
  /** Shows the dialog that prints the deck, as a PDF or through Game Crafter. */
  showPrintDialog: (deck: Deck) => void;
  /** Shows a sheet over the screen, at the bottom on phones, until it's closed or dismissed. */
  showSheet: (sheet: Sheet) => void;
  /** A key with Cmd or Ctrl, written as the app writes shortcuts, such as "⌘ K" on a Mac. */
  modKey: (key: string) => string;

  // Changes to the vault. Each tells the user when it fails and resolves to whether it worked,
  // once the screens can show the change, so they needn't wait for it themselves.

  /** Creates the Tracecards folder when it doesn't exist. */
  createFolder: () => void;
  createDeck: (name: string) => Promise<boolean>;
  renameDeck: (deck: Deck, name: string) => Promise<boolean>;
  /** Deletes the deck folder with its cards, moving it to the trash. */
  trashDeck: (deck: Deck) => Promise<boolean>;
  /** Writes deck fields to each deck's `_deck.md`, creating it when the deck has none. */
  updateDecks: (updates: DeckUpdate[]) => Promise<boolean>;
  /** Writes card fields to each card's frontmatter, adding an `id` when the card has none. */
  updateCards: (updates: CardUpdate[]) => Promise<boolean>;
  /** Writes a new card, as "Adding cards" in the spec says. Resolves to its path, or null. */
  createCard: (card: NewCard) => Promise<string | null>;
  /**
   * Renames the card's file, which updates links to it, and writes its description and cover, as
   * "Setting a cover" in the spec says.
   */
  editCard: (card: Card, edit: CardEdit) => Promise<boolean>;
  /** Moves the card's file into the deck's folder and gives it `rank`, or none when undefined. */
  moveCard: (card: Card, deck: Deck, rank: number | undefined) => Promise<boolean>;
  /** Deletes the card's file, moving it to the trash. */
  trashCard: (card: Card) => Promise<boolean>;
  // A card's bookmarks, as "Changing bookmarks" in the spec says. Bookmarks are found by URL.
  addBookmark: (card: Card, bookmark: BookmarkFields) => Promise<boolean>;
  editBookmark: (card: Card, url: string, bookmark: BookmarkFields) => Promise<boolean>;
  removeBookmark: (card: Card, url: string) => Promise<boolean>;
  /** Makes the bookmark with this URL the primary one, or with null leaves the card without one. */
  setPrimaryBookmark: (card: Card, url: string | null) => Promise<boolean>;
}

/**
 * An entry in a menu: an item, an item that opens a submenu, a heading for the items below it, or
 * a line between groups.
 */
export type MenuEntry = MenuItem | Submenu | { heading: string } | "separator";

/** An item that opens more entries beside the menu, or in its place on phones. */
export interface Submenu {
  title: string;
  icon: string;
  entries: MenuEntry[];
}

export interface MenuItem {
  title: string;
  icon: string;
  /** Styles the item as destructive, as for Delete. */
  warning?: boolean;
  /** Shows a check mark, as on the current choice among several. */
  checked?: boolean;
  onClick: () => void;
}

export interface TextPrompt {
  title: string;
  /** Label of the button that accepts. */
  cta: string;
  value?: string;
  placeholder?: string;
  /** Returns why the text can't be used, which keeps the prompt open, or null when it can. */
  validate: (value: string) => string | null;
}

export interface FieldsPrompt {
  title: string;
  /** Label of the button that accepts. */
  cta: string;
  fields: PromptField[];
  /**
   * Returns why the values can't be used, with the index of the field it's about, which keeps
   * the prompt open, or null when they can.
   */
  validate: (values: string[]) => { field: number; message: string } | null;
}

export interface PromptField {
  label: string;
  value?: string;
  placeholder?: string;
}

export interface Confirmation {
  title: string;
  message: string;
  /** Label of the button that confirms. */
  cta: string;
  /** Styles the confirm button as destructive. */
  destructive?: boolean;
}

/** What `showSheet` shows: a title, and what's under it, given a way to close the sheet. */
export interface Sheet {
  title: string;
  render: (close: () => void) => ReactNode;
}

export interface DeckUpdate {
  deck: Deck;
  icon?: string;
  rank?: number;
  /** Puts the deck in this slot of the deck pad (1 to 8), or takes it off it (null). */
  pad?: number | null;
}

export interface CardUpdate {
  card: Card;
  rank?: number;
}

/** What the card form asks for: a new card, or changes to one. */
export interface CardFormRequest {
  /** The card to edit, or undefined for a new card. */
  card?: Card;
  decks: readonly Deck[];
  /** The deck a new card is saved to until the user picks another, or the edited card's deck. */
  deck: Deck;
  /** Saves what the form holds. Resolves to whether it worked; the form stays open if not. */
  save: (draft: CardDraft) => Promise<boolean>;
}

/** What the card form holds. */
export interface CardDraft {
  title: string;
  description: string;
  deck: Deck;
  /** How the cover changed, or undefined when it didn't. */
  cover: CoverEdit | undefined;
}

export interface NewCard {
  deck: Deck;
  title: string;
  description?: string | undefined;
  rank?: number | undefined;
  cover?: NewCover | undefined;
  /** In order. The first is the card's primary bookmark. */
  bookmarks?: BookmarkFields[] | undefined;
}

/** A new cover image, with the part of it to show, or none to show it whole. */
export interface NewCover {
  image: CoverImage;
  crop: CoverCrop | undefined;
}

/** A change to a card's cover: a new image, a new crop for the image it has, or null to remove it. */
export type CoverEdit = NewCover | { crop: CoverCrop } | null;

/** Changes to a card. An empty description removes it; a missing field stays as it is. */
export interface CardEdit {
  title?: string;
  description?: string;
  cover?: CoverEdit;
  bookmarks?: BookmarkChanges;
}

/** Bookmarks to add at the end of a card's list, and the URLs of those to remove. */
export interface BookmarkChanges {
  add: BookmarkFields[];
  remove: string[];
}

/** A back image the user added, kept on this device after it was made print-size. */
export interface CustomBack {
  /** What to call it in the list, and what `Printing.readBack` takes. */
  id: string;
  name: string;
}

/** How the cards' fronts can print: light text on a dark card, or dark text on a light one. */
export const FACE_THEMES = ["dark", "light"] as const;

export type FaceTheme = (typeof FACE_THEMES)[number];

/**
 * What printing needs from the device: the user's Game Crafter keys and session, kept in secret
 * storage so they never sync, and the card backs.
 */
export interface Printing {
  /** The Game Crafter API key id and private key the user set, or null when either is missing. */
  keys: () => { keyId: string; privateKey: string } | null;
  /** The signed-in session, or null. */
  session: () => string | null;
  setSession: (session: string | null) => void;
  /** The link the app handles that Game Crafter's sign-in sends the user back to. */
  signInPostback: string;
  /**
   * Opens Game Crafter's sign-in page in the browser and resolves to the `sso_id` it sends back to
   * the app, at `signInPostback`, or null when it doesn't within a few minutes or is started again.
   */
  signIn: (url: string) => Promise<string | null>;
  /** Opens a web page in the user's browser. */
  openUrl: (url: string) => void;
  /** The card's cover as an image to draw, or null when it has none or it can't be read. */
  coverBitmap: (card: Card) => Promise<ImageBitmap | null>;
  /** Whether the cards' fronts print dark or light, as the settings keep it. */
  faceTheme: () => FaceTheme;
  setFaceTheme: (theme: FaceTheme) => void;
  /** The back to print, as the settings keep it: a design's id, or a custom back's id. */
  chosenBack: () => string;
  setChosenBack: (id: string) => void;
  customBacks: () => Promise<CustomBack[]>;
  /** A custom back as an image, or null when it's gone. */
  readBack: (id: string) => Promise<ImageBitmap | null>;
  /** A custom back's URL, to show it, or null when it's gone. */
  backUrl: (id: string) => string | null;
  /** The part of the custom back to print, as the settings keep it, or undefined to fill the card. */
  backCrop: () => CoverCrop | undefined;
  setBackCrop: (crop: CoverCrop | undefined) => void;
  /** Saves the picture, already prepared like a cover, as a custom back. Resolves to it, or null. */
  addBack: (name: string, image: Blob) => Promise<CustomBack | null>;
  removeBack: (id: string) => Promise<void>;
  /**
   * Asks where to save a PDF, with the system's save dialog where there is one, suggesting
   * `name`. Call it straight from the click, before anything is awaited, as the dialog needs.
   * Resolves to where to write it, or null when the user cancels.
   */
  savePdf: (name: string) => Promise<SaveTarget | null>;
}

/** Where a file goes, chosen before it's made. */
export interface SaveTarget {
  /** Writes the file. */
  write: (data: Uint8Array) => Promise<SavedFile>;
}

/** A file once it's saved, and what the device can do with it. */
export interface SavedFile {
  /** Where it went, to tell the user, such as its name. */
  where: string;
  /**
   * Opens it, in the app the system opens such files with, or else in this one. The print dialog
   * opens the PDF as soon as it's saved, ready to print.
   */
  open?: () => void;
  /** Shows it in its folder, selected, named as the system names its files app. */
  reveal?: { label: string; run: () => void };
}

/** What `Host.send` sends. */
export interface HttpRequest {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: { contentType: string; data: ArrayBuffer };
}

/** What `Host.request` got back. */
export interface HttpResponse {
  status: number;
  /** The `Content-Type` header, or "" without one. */
  contentType: string;
  body: ArrayBuffer;
}

export const HostContext = createContext<Host | null>(null);

export function useHost(): Host {
  const host = use(HostContext);
  if (!host) throw new Error("No Host: render screens inside <HostContext value={host}>.");
  return host;
}

/**
 * Downloads an image, such as a search result or a video's thumbnail. Resolves to null when it
 * can't be had.
 */
export async function downloadImage(host: Host, url: string): Promise<Blob | null> {
  try {
    const { status, contentType, body } = await host.send({ url });
    if (status !== 200) return null;
    return new Blob([body], { type: contentType.split(";")[0]?.trim() ?? "" });
  } catch {
    return null;
  }
}

/** A response's body read as JSON, or undefined when it isn't JSON. */
export function responseJson(response: HttpResponse): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(response.body));
  } catch {
    return undefined;
  }
}

/** Whether a value read from JSON is an object, whose fields can then be checked. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Asks for a line of text. Resolves to what the user entered, or null when cancelled. */
export async function promptText(
  host: Host,
  { value, placeholder, validate, ...prompt }: TextPrompt,
): Promise<string | null> {
  const values = await host.promptFields({
    ...prompt,
    fields: [{ label: "", value, placeholder }],
    validate: ([text = ""]) => {
      const message = validate(text);
      return message === null ? null : { field: 0, message };
    },
  });
  return values?.[0] ?? null;
}

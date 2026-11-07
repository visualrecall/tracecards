import {
  addBookmark,
  type BookmarkFields,
  type Card,
  type Deck,
  editBookmark,
  removeBookmark,
  setPrimaryBookmark,
} from "@tracecards/core";
import type {
  CardEdit,
  CardFormRequest,
  CardUpdate,
  Confirmation,
  DeckUpdate,
  FieldsPrompt,
  Host,
  HttpRequest,
  HttpResponse,
  MenuEntry,
  NewCard,
  Sheet,
  Submenu,
  TitleCase,
} from "@tracecards/ui";
import {
  type App,
  Keymap,
  Menu,
  type MenuItem,
  Notice,
  Platform,
  requestUrl,
  setIcon,
} from "obsidian";
import { VaultActions } from "./actions";
import { CardFormModal } from "./CardFormModal";
import { CardModal } from "./CardModal";
import { PrintModal } from "./PrintModal";
import { ObsidianPrinting } from "./printing";
import { SheetModal } from "./SheetModal";
import type TracecardsPlugin from "./main";
import { confirmModal, DeckSuggestModal, IconSuggestModal, PromptModal } from "./modals";
import type { RecentCards } from "./recent";
import { readSecret } from "./settings";
import type { VaultStore } from "./store";

const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"]);

/** The screens' access to Obsidian. */
export class ObsidianHost implements Host {
  private readonly actions: VaultActions;
  readonly printing: ObsidianPrinting;

  constructor(
    private readonly app: App,
    private readonly store: VaultStore,
    private readonly recent: RecentCards,
    private readonly plugin: TracecardsPlugin,
  ) {
    this.actions = new VaultActions(app, store);
    this.printing = new ObsidianPrinting(app, plugin, this.actions);
  }

  readonly showPrintDialog = (deck: Deck): void => {
    new PrintModal(this.app, this, deck).open();
  };

  readonly showSheet = (sheet: Sheet): void => {
    new SheetModal(this.app, this, sheet).open();
  };

  readonly coverUrl = (card: Card): string | null => {
    const file = this.actions.coverFile(card);
    if (!file || !IMAGE_EXTENSIONS.has(file.extension.toLowerCase())) return null;
    return this.app.vault.getResourcePath(file);
  };

  /**
   * Opens the card in the card modal. With Cmd or Ctrl (or a middle click), its note opens where
   * Obsidian would open a link instead. Either way, search lists it among the recent cards.
   */
  readonly openCard = (card: Card, event?: MouseEvent | KeyboardEvent): void => {
    const file = this.app.vault.getFileByPath(this.store.vaultPath(card.path));
    if (!file) return;
    this.recent.add(file.path);
    const paneType = Keymap.isModEvent(event);
    if (paneType) void this.app.workspace.getLeaf(paneType).openFile(file);
    else new CardModal(this.app, this, this.store, this.recent, file).open();
  };

  readonly setIcon = (element: HTMLElement, icon: string): void => {
    setIcon(element, icon);
  };

  readonly showMenu = (entries: MenuEntry[], event: MouseEvent, anchor?: HTMLElement): void => {
    const menu = new Menu();
    addMenuEntries(menu, entries);
    if (anchor) {
      const { left, bottom, width } = anchor.getBoundingClientRect();
      // Below the anchor, lined up with its right edge where there's room.
      menu.showAtPosition({ x: left, y: bottom, width, left: true }, anchor.doc);
    } else {
      menu.showAtMouseEvent(event);
    }
  };

  readonly promptFields = (prompt: FieldsPrompt): Promise<string[] | null> =>
    new Promise((resolve) => new PromptModal(this.app, prompt, resolve).open());

  readonly confirm = (confirmation: Confirmation): Promise<boolean> =>
    confirmModal(this.app, confirmation);

  readonly pickIcon = (): Promise<string | null> =>
    new Promise((resolve) => new IconSuggestModal(this.app, resolve).open());

  readonly pickDeck = (decks: readonly Deck[]): Promise<Deck | "new" | null> =>
    new Promise((resolve) => new DeckSuggestModal(this.app, decks, resolve).open());

  readonly showCardForm = (form: CardFormRequest): Promise<void> =>
    new Promise((resolve) => new CardFormModal(this.app, this, form, resolve).open());

  readonly notify = (message: string): void => {
    new Notice(message);
  };

  /** Asks YouTube's oEmbed endpoint, which needs no key. The README discloses this. */
  readonly videoTitle = async (url: string): Promise<string | null> => {
    try {
      const response = await requestUrl(
        `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
      );
      const data: unknown = response.json;
      if (typeof data !== "object" || data === null || !("title" in data)) return null;
      return typeof data.title === "string" && data.title.trim() !== "" ? data.title.trim() : null;
    } catch {
      return null;
    }
  };

  /** The secret the Pixabay setting names, from Obsidian's secret storage on this device. */
  readonly pixabayKey = (): string | null => readSecret(this.app, this.plugin.settings.pixabayKey);

  readonly titleCase = (): TitleCase => this.plugin.settings.titleCase;

  readonly openSettings = (): void => {
    this.plugin.openSettings();
  };

  /** Obsidian's `requestUrl`, which isn't held back by the cross-origin rules `fetch` has. */
  readonly send = async ({ url, method, body }: HttpRequest): Promise<HttpResponse> => {
    const response = await requestUrl({
      url,
      throw: false,
      ...(method && { method }),
      ...(body && { body: body.data, contentType: body.contentType }),
    });
    const contentType = Object.entries(response.headers).find(
      ([name]) => name.toLowerCase() === "content-type",
    )?.[1];
    return { status: response.status, contentType: contentType ?? "", body: response.arrayBuffer };
  };

  readonly modKey = (key: string): string => modKey(key);

  readonly createFolder = (): void => {
    void this.attempt("Couldn't create the folder", () => this.actions.createFolder());
  };

  readonly createDeck = (name: string): Promise<boolean> =>
    this.attempt("Couldn't create the deck", () => this.actions.createDeck(name));

  readonly renameDeck = (deck: Deck, name: string): Promise<boolean> =>
    this.attempt("Couldn't rename the deck", () => this.actions.renameDeck(deck, name));

  readonly trashDeck = (deck: Deck): Promise<boolean> =>
    this.attempt("Couldn't delete the deck", () => this.actions.trashDeck(deck));

  readonly updateDecks = (updates: DeckUpdate[]): Promise<boolean> =>
    this.attempt("Couldn't save the deck", async () => {
      // One at a time: each may create a `_deck.md`.
      for (const { deck, ...fields } of updates) {
        await this.actions.updateDeck(deck, fields);
      }
    });

  readonly updateCards = (updates: CardUpdate[]): Promise<boolean> =>
    this.attempt("Couldn't save the card", async () => {
      for (const { card, ...fields } of updates) {
        await this.actions.updateCard(card, fields);
      }
    });

  readonly createCard = async (card: NewCard): Promise<string | null> => {
    let path: string | null = null;
    await this.attempt("Couldn't create the card", async () => {
      path = await this.actions.createCard(card);
    });
    return path;
  };

  readonly editCard = (card: Card, edit: CardEdit): Promise<boolean> =>
    this.attempt("Couldn't save the card", () => this.actions.editCard(card, edit));

  readonly moveCard = (card: Card, deck: Deck, rank: number | undefined): Promise<boolean> =>
    this.attempt("Couldn't move the card", () => this.actions.moveCard(card, deck, rank));

  readonly trashCard = (card: Card): Promise<boolean> =>
    this.attempt("Couldn't delete the card", () => this.actions.trashCard(card));

  readonly addBookmark = (card: Card, bookmark: BookmarkFields): Promise<boolean> =>
    this.attempt("Couldn't add the bookmark", () =>
      this.actions.changeBookmarks(card, (frontmatter) => addBookmark(frontmatter, bookmark)),
    );

  readonly editBookmark = (card: Card, url: string, bookmark: BookmarkFields): Promise<boolean> =>
    this.attempt("Couldn't save the bookmark", () =>
      this.actions.changeBookmarks(card, (frontmatter) => editBookmark(frontmatter, url, bookmark)),
    );

  readonly removeBookmark = (card: Card, url: string): Promise<boolean> =>
    this.attempt("Couldn't delete the bookmark", () =>
      this.actions.changeBookmarks(card, (frontmatter) => removeBookmark(frontmatter, url)),
    );

  readonly setPrimaryBookmark = (card: Card, url: string | null): Promise<boolean> =>
    this.attempt("Couldn't save the bookmark", () =>
      this.actions.changeBookmarks(card, (frontmatter) => setPrimaryBookmark(frontmatter, url)),
    );

  /**
   * Runs a change to the vault, telling the user if it fails. It resolves once the screens can
   * show the change.
   */
  private async attempt(failure: string, change: () => Promise<void>): Promise<boolean> {
    try {
      await this.store.change(change);
      return true;
    } catch (error) {
      new Notice(`${failure}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}

/**
 * A key with Cmd or Ctrl, written as Obsidian writes hotkeys: "⌘ K" on a Mac, "Ctrl + K"
 * elsewhere. Enter is "↵" on a Mac.
 */
export function modKey(key: string): string {
  if (Platform.isMacOS) return `⌘ ${key === "Enter" ? "↵" : key}`;
  return `Ctrl + ${key}`;
}

/**
 * Adds the entries to an Obsidian menu. Submenus use MenuItem's `setSubmenu`, which Obsidian's own
 * menus use but its types leave out. Without it, a submenu's entries follow its title as a
 * heading.
 */
function addMenuEntries(menu: Menu, entries: readonly MenuEntry[]): void {
  for (const entry of entries) {
    if (entry === "separator") menu.addSeparator();
    else if ("heading" in entry) {
      menu.addItem((item) => item.setTitle(entry.heading).setIsLabel(true));
    } else if ("entries" in entry) {
      addSubmenu(menu, entry);
    } else {
      const { title, icon, warning, checked, onClick } = entry;
      menu.addItem((item) => {
        item
          .setTitle(title)
          .setIcon(icon)
          .setWarning(warning ?? false)
          .setChecked(checked ?? null)
          .onClick(onClick);
        // Obsidian reddens a warning item only when it's pointed at.
        // `dom` isn't in the typings, but menu items have had it for years.
        if (warning)
          (item as unknown as { dom: HTMLElement }).dom.addClass("tracecards-menu-warning");
      });
    }
  }
}

function addSubmenu(menu: Menu, { title, icon, entries }: Submenu): void {
  let submenu: Menu | undefined;
  menu.addItem((item) => {
    submenu = (item as MenuItem & { setSubmenu?: () => Menu }).setSubmenu?.();
    item.setTitle(title);
    if (submenu) item.setIcon(icon);
    else item.setIsLabel(true);
  });
  addMenuEntries(submenu ?? menu, entries);
}

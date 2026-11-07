import type { Card } from "@tracecards/core";
import {
  cardSizeVariables,
  type DeckDrop,
  ICONS,
  newCard,
  newDeck,
  type PadDrop,
  ValueStore,
} from "@tracecards/ui";
import {
  type App,
  Notice,
  Platform,
  Plugin,
  type TAbstractFile,
  type TFile,
  TFolder,
  type WorkspaceLeaf,
} from "obsidian";
import { registerCanvas } from "./canvas";
import { DECKS_VIEW_TYPE, DecksView } from "./DecksView";
import { GRID_VIEW_TYPE, GridView } from "./GridView";
import { ObsidianHost } from "./host";
import { registerIcon } from "./icon";
import { SIGN_IN_ACTION } from "./printing";
import { RecentCards } from "./recent";
import { SearchModal, type SearchMode } from "./SearchModal";
import { DEFAULT_SETTINGS, parseSettings, type Settings, SettingsTab } from "./settings";
import { VaultStore } from "./store";

export default class TracecardsPlugin extends Plugin {
  override settings: Settings = DEFAULT_SETTINGS;
  store!: VaultStore;
  host!: ObsidianHost;
  /** The deck the Tracecards tab in use shows, for the Decks panel. Null is the first deck. */
  readonly selection = new ValueStore<string | null>(null);
  /** The Tracecards tab active last, while it's open. */
  private lastGrid: WorkspaceLeaf | null = null;
  /** A card being dragged in the Tracecards tab, for the Decks panel to show where it would go. */
  readonly cardDrop = new ValueStore<PadDrop | null>(null);
  /** A deck dragged out of the Decks panel, for the Tracecards tab's pad to show where it would go. */
  readonly deckDrop = new ValueStore<DeckDrop | null>(null);
  private recent!: RecentCards;

  override async onload(): Promise<void> {
    this.settings = parseSettings(await this.loadData());
    this.store = new VaultStore(this.app, this.settings.folder);
    this.recent = new RecentCards(this.app);
    this.host = new ObsidianHost(this.app, this.store, this.recent, this);
    this.register(() => this.store.refreshSoon.cancel());
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => this.recent.rename(oldPath, file.path)),
    );

    // The main window now, and each pop-out window as it opens.
    this.styleWindow(window.document);
    this.registerEvent(this.app.workspace.on("window-open", (win) => this.styleWindow(win.doc)));
    this.register(() => {
      const unset = Object.fromEntries(
        Object.keys(this.windowVariables()).map((name) => [name, ""]),
      );
      for (const doc of this.windowDocuments()) doc.body.setCssProps(unset);
    });

    // Game Crafter sends the user back here after they approve the sign-in.
    this.registerObsidianProtocolHandler(SIGN_IN_ACTION, ({ sso_id: ssoId }) =>
      this.host.printing.receiveSignIn(ssoId),
    );

    registerIcon();
    this.registerView(GRID_VIEW_TYPE, (leaf) => new GridView(leaf, this));
    this.registerView(DECKS_VIEW_TYPE, (leaf) => new DecksView(leaf, this));
    this.addSettingTab(new SettingsTab(this));
    registerCanvas(this);
    this.addRibbonIcon(ICONS.tracecards, "Open Tracecards", () => void this.openTracecards());
    // Never rename a command's id: hotkeys and other plugins refer to it as `tracecards:<id>`.
    this.addCommand({ id: "open", name: "Open", callback: () => void this.openTracecards() });
    this.addCommand({
      id: "show-decks",
      name: "Show decks",
      callback: () => void this.showDecksPanel(true),
    });
    this.addCommand({ id: "new-deck", name: "New deck", callback: () => void this.newDeck() });
    this.addCommand({ id: "new-card", name: "New card", callback: () => void this.newCard() });
    this.addCommand({
      id: "search-cards",
      name: "Search cards",
      callback: () => this.search("cards"),
    });
    this.addCommand({
      id: "search-decks",
      name: "Search decks",
      callback: () => this.search("decks"),
    });
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFolder) || !this.isGridFolder(file)) return;
        menu.addItem((item) =>
          item
            .setTitle("Open in Tracecards")
            .setIcon(ICONS.tracecards)
            .onClick(
              () => void this.openTracecards(file.path === this.store.folder ? null : file.name),
            ),
        );
      }),
    );

    // Obsidian fires a create event for every file while the vault loads, so listen only after.
    this.app.workspace.onLayoutReady(() => {
      this.store.refresh();
      const onFileEvent = (file: TAbstractFile, oldPath?: string) => {
        if (this.store.contains(file.path) || (oldPath && this.store.contains(oldPath))) {
          this.store.noteChange();
        }
      };
      this.registerEvent(this.app.vault.on("create", onFileEvent));
      this.registerEvent(this.app.vault.on("delete", onFileEvent));
      this.registerEvent(this.app.vault.on("rename", onFileEvent));
      // Its second argument is the file's text, not an old path.
      this.registerEvent(this.app.metadataCache.on("changed", (file) => onFileEvent(file)));
    });
  }

  /** Reloads the settings when data.json changes outside Obsidian, as when sync brings new ones. */
  override async onExternalSettingsChange(): Promise<void> {
    this.settings = parseSettings(await this.loadData());
    this.applySettings();
  }

  /** Applies changed settings. The settings tab calls it after saving. */
  applySettings(): void {
    this.store.setFolder(this.settings.folder);
    for (const doc of this.windowDocuments()) this.styleWindow(doc);
  }

  /**
   * The Tracecards tab in use, which the Decks panel follows and what's chosen there or in search
   * goes to: the one active last, or else the first. A tab not shown since Obsidian started may
   * not have its view yet, so this is the tab, not the view.
   */
  private gridInUse(): WorkspaceLeaf | undefined {
    const leaves = this.app.workspace.getLeavesOfType(GRID_VIEW_TYPE);
    return leaves.find((leaf) => leaf === this.lastGrid) ?? leaves[0];
  }

  /** Makes the grid view's tab the one in use, as it becomes active, and shows its deck. */
  useGrid(view: GridView, deck: string | null): void {
    this.lastGrid = view.leaf;
    this.selection.set(deck);
  }

  /** Shows the grid view's deck in the Decks panel, if its tab is the one in use. */
  showGridDeck(view: GridView, deck: string | null): void {
    if (this.gridInUse() === view.leaf) this.selection.set(deck);
  }

  /**
   * Opens the Tracecards tab in use, or switches to it, and selects `deck` when given. With
   * `focus` false, as when a deck is chosen in the Decks panel, a tab that's open is shown without
   * taking the focus, so the panel's keys keep working. Resolves to the tab's view.
   */
  async openGrid(deck: string | null = null, { focus = true } = {}): Promise<GridView | null> {
    const { workspace } = this.app;
    const existing = this.gridInUse();
    const leaf = existing ?? workspace.getLeaf("tab");
    if (!existing || deck !== null) {
      await leaf.setViewState({
        type: GRID_VIEW_TYPE,
        active: focus || !existing,
        state: deck ? { deck } : {},
      });
    }
    await workspace.revealLeaf(leaf);
    return leaf.view instanceof GridView ? leaf.view : null;
  }

  /** Opens search, for cards or for decks. */
  search(mode: SearchMode): void {
    new SearchModal(this.app, this.host, this.store, this.recent, mode, {
      chooseCard: (card, event) => void this.openCard(card, event),
      chooseDeck: (deck) => void this.openGrid(deck.name),
      newCard: () => void this.newCard(),
    }).open();
  }

  /**
   * Opens card search to choose a card, as a canvas's Tracecards button does, and calls
   * `onChoose` with its file. "New card" makes one to choose.
   */
  pickCard(onChoose: (file: TFile) => void): void {
    const choose = (path: string) => {
      const file = this.app.vault.getFileByPath(this.store.vaultPath(path));
      if (file) onChoose(file);
    };
    new SearchModal(this.app, this.host, this.store, this.recent, "cards", {
      chooseCard: (card) => choose(card.path),
      newCard: () =>
        void newCard(this.host, this.store.decks).then((path) => {
          if (path !== null) choose(path);
        }),
    }).open();
  }

  /** Opens Obsidian's settings at the Tracecards tab, as the gear in the tab's header does. */
  openSettings(): void {
    // Obsidian's API has no way to open a plugin's settings, so this uses what Obsidian itself
    // calls, when it's there.
    const { setting } = this.app as App & {
      setting?: { open(): void; openTabById(id: string): unknown };
    };
    if (!setting) {
      new Notice("Open settings, then choose Tracecards under community plugins.");
      return;
    }
    setting.open();
    setting.openTabById(this.manifest.id);
  }

  /**
   * The card size and the grid view's most cards in a row are CSS variables on each window's
   * body, so the grid, the card modal, the card form and canvases all follow them.
   */
  private styleWindow(doc: Document): void {
    doc.body.setCssProps(this.windowVariables());
  }

  private windowVariables(): Record<string, string> {
    return {
      ...cardSizeVariables(),
      "--tracecards-max-columns": String(this.settings.gridColumns),
    };
  }

  /** The main window's document and those of any pop-out windows. */
  private windowDocuments(): Set<Document> {
    const docs = new Set<Document>([window.document]);
    this.app.workspace.iterateAllLeaves((leaf) => docs.add(leaf.view.containerEl.doc));
    return docs;
  }

  /**
   * Opens Tracecards, as its ribbon icon and command do: the Tracecards tab, with the Decks panel
   * brought forward in the sidebar. On phones and tablets, where the sidebar is a drawer, Decks
   * becomes the drawer's panel but the drawer stays closed.
   */
  private async openTracecards(deck: string | null = null): Promise<void> {
    await this.openGrid(deck);
    await this.showDecksPanel(false);
  }

  /**
   * Opens the Decks panel in the left sidebar, unless it's open somewhere, and brings it forward.
   * On phones and tablets the sidebar is a drawer, which only opens with `openDrawer`.
   */
  private async showDecksPanel(openDrawer: boolean): Promise<void> {
    const { workspace } = this.app;
    const root = workspace.getLeavesOfType(DECKS_VIEW_TYPE)[0]?.getRoot() ?? workspace.leftSplit;
    // Obsidian's API doesn't export its drawer class, so a drawer is found as a mobile sidebar.
    const drawer = Platform.isMobile
      ? [workspace.leftSplit, workspace.rightSplit].find((side) => side === root)
      : undefined;
    const closedDrawer = drawer?.collapsed === true;
    await workspace.ensureSideLeaf(DECKS_VIEW_TYPE, "left", { reveal: true });
    // Obsidian has no way to choose a drawer's panel without opening it, so revealing the panel
    // opened the drawer; closing it again straight away, before it's drawn, leaves Decks chosen.
    if (drawer && closedDrawer && !openDrawer) drawer.collapse();
  }

  /**
   * Opens the card, with the Tracecards tab behind it turned to the card's deck and page. No
   * card is selected there: closing the card leaves the grid in deck mode.
   */
  private async openCard(card: Card, event: MouseEvent | KeyboardEvent): Promise<void> {
    const view = await this.openGrid();
    view?.showCard(card.path);
    this.host.openCard(card, event);
  }

  /** Switches to the Tracecards tab, where the new card will show, and shows the card form. */
  private async newCard(): Promise<void> {
    const view = await this.openGrid();
    await view?.newCard();
  }

  private async newDeck(): Promise<void> {
    const name = await newDeck(this.host, this.store.decks);
    if (name) await this.openGrid(name);
  }

  /** Whether the folder is the Tracecards folder or one of its decks. */
  private isGridFolder(folder: TFolder): boolean {
    if (folder.path === this.store.folder) return true;
    return (
      folder.parent?.path === this.store.folder &&
      this.store.decks.some((deck) => deck.name === folder.name)
    );
  }
}

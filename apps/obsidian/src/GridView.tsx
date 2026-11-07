import { cardDeckName } from "@tracecards/core";
import {
  focusDeckMode,
  GridScreen,
  HostContext,
  ICONS,
  type Layout,
  newCard,
  type PhoneView,
  type Reveal,
} from "@tracecards/ui";
import {
  ItemView,
  Platform,
  Scope,
  setIcon,
  setTooltip,
  TFolder,
  type ViewStateResult,
  type WorkspaceLeaf,
} from "obsidian";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { modKey } from "./host";
import type TracecardsPlugin from "./main";

/** Never renamed: saved workspaces refer to it, and a tab of an unknown type can't open. */
export const GRID_VIEW_TYPE = "tracecards-grid";

/** How long a card has to show up before the grid stops waiting to show it, as a new one may. */
const REVEAL_TIMEOUT_MS = 5000;

/** The header button that switches the layout, as it shows in each: what it switches to. */
const LAYOUT_BUTTON: Record<Layout, { icon: string; label: string }> = {
  pad: { icon: ICONS.gridView, label: "Switch to grid view (R)" },
  grid: { icon: ICONS.padView, label: "Switch to pad view (R)" },
};

/** The same button on phones, which switches between one card at a time and the lists. */
const PHONE_VIEW_BUTTON: Record<PhoneView, { icon: string; label: string }> = {
  card: { icon: ICONS.listView, label: "Show the decks as lists" },
  list: { icon: ICONS.cardView, label: "Show one card at a time" },
};

/**
 * The Tracecards tab: mounts the React grid screen. Its view state keeps the selected deck, the
 * layout, and the page showing in each deck, and on phones, which of the phone's views shows and
 * the deck open in its lists.
 */
export class GridView extends ItemView {
  private root: Root | null = null;
  private deck: string | null = null;
  private layout: Layout = "pad";
  private pages: Readonly<Record<string, number>> = {};
  /** Phones get `PhoneScreen`, since the deck pad doesn't fit. */
  private readonly phone = Platform.isPhone;
  private phoneView: PhoneView = "card";
  /** In the phone's lists, the deck whose cards are showing, or null for the decks. */
  private listDeck: string | null = null;
  /** A card for the screen to turn to. Not saved. */
  private reveal: Reveal | null = null;
  /** In the middle of the tab's header, where the screen shows the deck's name. */
  private titleSlot: HTMLElement | null = null;
  private layoutButton: HTMLElement | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: TracecardsPlugin,
  ) {
    super(leaf);
    // Shortcuts for a new card and for search, while this tab is active. Commands don't
    // get default hotkeys, so the "New card" and "Search cards" commands have none.
    this.scope = new Scope(this.app.scope);
    this.scope.register(["Mod"], "J", () => {
      void this.newCard();
      return false;
    });
    this.scope.register(["Mod"], "K", () => {
      this.plugin.search("cards");
      return false;
    });
  }

  override getViewType(): string {
    return GRID_VIEW_TYPE;
  }

  override getDisplayText(): string {
    return "Tracecards";
  }

  override getIcon(): string {
    return ICONS.tracecards;
  }

  override getState(): Record<string, unknown> {
    return {
      ...super.getState(),
      deck: this.deck,
      layout: this.layout,
      pages: this.pages,
      phoneView: this.phoneView,
      listDeck: this.listDeck,
    };
  }

  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    if (typeof state === "object" && state !== null && "deck" in state) {
      this.deck = typeof state.deck === "string" ? state.deck : null;
      if ("layout" in state && (state.layout === "pad" || state.layout === "grid")) {
        this.layout = state.layout;
      }
      if ("pages" in state) this.pages = validPages(state.pages);
      const openDeck = this.listDeck;
      if ("phoneView" in state && (state.phoneView === "card" || state.phoneView === "list")) {
        this.phoneView = state.phoneView;
      }
      if ("listDeck" in state) {
        this.listDeck = typeof state.listDeck === "string" ? state.listDeck : null;
      } else if (this.phoneView === "list") {
        // A deck chosen elsewhere, as in the Decks panel or search, shows its cards in the lists.
        this.listDeck = this.deck;
      }
      // Going into a deck's cards from the decks is a step back undoes (see `openListDeck`).
      if (openDeck === null && this.listDeck !== null) result.history = true;
      this.render();
    }
    await super.setState(state, result);
  }

  override async onOpen(): Promise<void> {
    // In reverse order, since Obsidian puts each new action before the others: the layout, search,
    // "New card", then settings. Their tooltips give the keys that do the same.
    this.addAction(ICONS.settings, "Tracecards settings", () => this.plugin.openSettings());
    this.addAction(ICONS.add, `New card (${modKey("J")})`, () => void this.newCard());
    this.addAction(ICONS.search, `Search cards (${modKey("K")}) or decks (#)`, () =>
      this.plugin.search("cards"),
    );
    this.layoutButton = this.addAction("", "", () => {
      if (this.phone) {
        this.switchPhoneView();
        return;
      }
      this.setLayout(this.layout === "pad" ? "grid" : "pad");
      focusDeckMode(this.contentEl);
    });
    this.layoutButton.addClass("tracecards-view-switch");
    // The header's middle is empty, so the deck's name goes there,
    // rather than taking room above the cards. Obsidian's API has no slot for it, so it's found
    // by its class. On phones and tablets the header centres the tab's own title, so there, as
    // when the header isn't found, the screen puts the name above the cards.
    this.titleSlot = Platform.isMobile
      ? null
      : (this.containerEl.querySelector(".view-header")?.createDiv("tracecards-header-title") ??
        null);
    this.root = createRoot(this.contentEl);
    this.render();
    // So the keys work as soon as the tab is selected, in deck mode.
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf !== this.leaf) return;
        focusDeckMode(this.contentEl);
        // With more than one Tracecards tab, the Decks panel follows the one in use.
        this.plugin.useGrid(this, this.deck);
      }),
    );
    // While this tab is active but nothing in particular has the focus, as after Obsidian starts,
    // keys go to the grid as if it had the focus.
    this.registerDomEvent(this.containerEl.win, "keydown", (event) => {
      const { doc } = this.containerEl;
      if (event.defaultPrevented || doc.activeElement !== doc.body) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (this.app.workspace.getActiveViewOfType(GridView) !== this) return;
      if (focusDeckMode(this.contentEl, event)) event.preventDefault();
    });
    // A renamed deck keeps its page, and stays selected if it was, whether it's renamed here or
    // anywhere else.
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        const { store } = this.plugin;
        if (!(file instanceof TFolder) || file.parent?.path !== store.folder) return;
        const oldName = store.relativePath(oldPath);
        if (oldName === null) return;
        const { [oldName]: page, ...others } = this.pages;
        if (page !== undefined) this.pages = { ...others, [file.name]: page };
        if (oldName === this.deck) this.deck = file.name;
        if (page !== undefined || this.deck === file.name) this.saveState();
      }),
    );
  }

  override async onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
    this.titleSlot?.remove();
    this.titleSlot = null;
  }

  /**
   * Shows the card form for a new card in the selected deck. Once it's created, selects its deck
   * and shows it.
   */
  async newCard(): Promise<void> {
    const { decks } = this.plugin.store;
    const deck = decks.find((candidate) => candidate.name === this.deck);
    const path = await newCard(this.plugin.host, decks, deck);
    if (path !== null) this.showCard(path, true);
  }

  /**
   * Selects the card's deck and turns to the card's page, in deck mode. A new card is selected
   * and pops in once it's in the deck.
   */
  showCard(path: string, isNew = false): void {
    if (!isNew) focusDeckMode(this.contentEl);
    const reveal: Reveal = { path, isNew };
    this.deck = cardDeckName(path);
    if (this.phoneView === "list") this.listDeck = this.deck;
    this.reveal = reveal;
    this.saveState();
    window.setTimeout(() => {
      if (this.reveal === reveal) this.revealed();
    }, REVEAL_TIMEOUT_MS);
  }

  private readonly revealed = (): void => {
    this.reveal = null;
    this.render();
  };

  private readonly selectDeck = (name: string): void => {
    this.deck = name;
    this.saveState();
  };

  private readonly setLayout = (layout: Layout): void => {
    this.layout = layout;
    this.saveState();
  };

  /** Switches the phone between one card at a time and the lists, which start at the decks. */
  private switchPhoneView(): void {
    this.phoneView = this.phoneView === "card" ? "list" : "card";
    // The step back to the decks goes with the deck's cards, so Android's back button doesn't
    // bring the lists back later.
    if (this.listDeck !== null) decksStep(this.leaf)?.backHistory.pop();
    this.listDeck = null;
    this.saveState();
  }

  /**
   * Shows the deck's cards in the phone's lists, as a step in the tab's history, so that Android's
   * back button goes back to the decks. Obsidian keeps history only for tabs meant for navigating,
   * and opens notes in them, so the tab is one only while the step is recorded.
   */
  private readonly openListDeck = (name: string): void => {
    this.navigation = true;
    void this.leaf
      .setViewState({
        type: GRID_VIEW_TYPE,
        state: { ...this.getState(), deck: name, listDeck: name },
      })
      .finally(() => {
        this.navigation = false;
      });
  };

  /** Goes back from a deck's cards to the decks, through the tab's history when it has the step. */
  private readonly leaveListDeck = (): void => {
    const history = decksStep(this.leaf);
    if (history) {
      void history.back();
      return;
    }
    this.listDeck = null;
    this.saveState();
  };

  private readonly changePage = (deck: string, page: number): void => {
    this.pages = { ...this.pages, [deck]: page };
    this.saveState();
  };

  private saveState(): void {
    this.render();
    this.app.workspace.requestSaveLayout();
  }

  private render(): void {
    const { host, store } = this.plugin;
    this.plugin.showGridDeck(this, this.deck);
    if (this.layoutButton) {
      const { icon, label } = this.phone
        ? PHONE_VIEW_BUTTON[this.phoneView]
        : LAYOUT_BUTTON[this.layout];
      setIcon(this.layoutButton, icon);
      setTooltip(this.layoutButton, label);
    }
    this.root?.render(
      <StrictMode>
        <HostContext value={host}>
          <GridScreen
            store={store}
            deck={this.deck}
            onDeckChange={this.selectDeck}
            layout={this.layout}
            onLayoutChange={this.setLayout}
            pages={this.pages}
            onPageChange={this.changePage}
            reveal={this.reveal}
            onRevealed={this.revealed}
            onNewCard={() => void this.newCard()}
            onSearchDecks={() => this.plugin.search("decks")}
            onCardDropChange={(drop) => this.plugin.cardDrop.set(drop)}
            deckDrop={this.plugin.deckDrop}
            titleSlot={this.titleSlot}
            phone={
              this.phone
                ? {
                    view: this.phoneView,
                    listDeck: this.listDeck,
                    onOpenDeck: this.openListDeck,
                    onLeaveDeck: this.leaveListDeck,
                  }
                : undefined
            }
          />
        </HostContext>
      </StrictMode>,
    );
  }
}

/** A tab's history, which Obsidian's API leaves out: the steps back, and going back one. */
interface TabHistory {
  backHistory: { state?: { type?: string; state?: Record<string, unknown> } }[];
  back(): Promise<void>;
}

/**
 * The tab's history, when its last step back is to before a deck's cards were shown in the
 * phone's lists, as `openListDeck` records it. Null otherwise, or when Obsidian keeps history
 * differently.
 */
function decksStep(leaf: WorkspaceLeaf): TabHistory | null {
  const history = (leaf as WorkspaceLeaf & { history?: Partial<TabHistory> }).history;
  if (!Array.isArray(history?.backHistory) || typeof history.back !== "function") return null;
  const step = history.backHistory[history.backHistory.length - 1]?.state;
  const state = step?.state;
  const toDecks = step?.type === GRID_VIEW_TYPE && state?.listDeck == null;
  return toDecks ? (history as TabHistory) : null;
}

/** The pages from saved view state, keeping only whole, non-negative numbers. */
function validPages(value: unknown): Record<string, number> {
  if (typeof value !== "object" || value === null) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] => Number.isInteger(entry[1]) && entry[1] >= 0,
    ),
  );
}

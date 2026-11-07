import type { Card, Deck } from "@tracecards/core";
import { coverPosition, coverSource, type Host, ICONS, placeholderLetter } from "@tracecards/ui";
import {
  type App,
  prepareFuzzySearch,
  renderResults,
  type SearchResult,
  setIcon,
  sortSearchResults,
  SuggestModal,
} from "obsidian";
import type { RecentCards } from "./recent";
import type { VaultStore } from "./store";

/** What search looks for: cards, by title, or decks, by name. */
export type SearchMode = "cards" | "decks";

/** At most this many cards and decks show. */
const CARD_RESULTS = 5;
const DECK_RESULTS = 7;
/** How many recent cards show before anything is typed. */
const RECENT_RESULTS = 4;

/** Typed at the start of a card search, searches decks instead. */
const DECK_PREFIX = "#";

type Result =
  | { kind: "card"; card: Card; deck: Deck; match?: SearchResult }
  | { kind: "deck"; deck: Deck; match?: SearchResult }
  | { kind: "new" };

/** What choosing each kind of result does. Without `chooseDeck`, only cards are searched. */
export interface SearchActions {
  chooseCard: (card: Card, event: MouseEvent | KeyboardEvent) => void;
  chooseDeck?: (deck: Deck) => void;
  newCard: () => void;
}

/**
 * Card and deck search, in Obsidian's suggestion modal. It finds cards by title, or decks by name
 * after `#`, fuzzily, with the matched letters highlighted. Before anything is typed it offers a
 * new card and the cards opened last, or the first decks.
 */
export class SearchModal extends SuggestModal<Result> {
  /** Whether anything has been typed. Until then "New card" is offered. */
  private typed = false;

  constructor(
    app: App,
    private readonly host: Host,
    private readonly store: VaultStore,
    private readonly recent: RecentCards,
    private readonly mode: SearchMode,
    private readonly actions: SearchActions,
  ) {
    super(app);
    this.setPlaceholder(mode === "cards" ? "Search cards" : "Search decks…");
    this.emptyStateText = "Nothing found.";
    this.modalEl.addClass("tracecards-search");
  }

  override getSuggestions(input: string): Result[] {
    const query = input.trim();
    if (query !== "") this.typed = true;
    if (!this.actions.chooseDeck) return this.findCards(query);
    if (query.startsWith(DECK_PREFIX))
      return this.findDecks(query.slice(DECK_PREFIX.length).trim());
    if (this.mode === "decks") return this.findDecks(query);
    return this.findCards(query);
  }

  override renderSuggestion(result: Result, element: HTMLElement): void {
    element.addClass("tracecards-search-result");
    if (result.kind === "deck") {
      setIcon(element.createDiv("tracecards-search-icon"), result.deck.icon ?? ICONS.deck);
      renderTitle(element.createDiv("suggestion-title"), result.deck.name, result.match);
    } else if (result.kind === "new") {
      setIcon(element.createDiv("tracecards-cover tracecards-search-new"), ICONS.add);
      element.createDiv({ cls: "suggestion-title", text: "New card" });
    } else {
      this.renderCover(element.createDiv("tracecards-cover"), result.card);
      const text = element.createDiv("suggestion-content");
      renderTitle(text.createDiv("suggestion-title"), result.card.title, result.match);
      text.createDiv({ cls: "suggestion-note", text: result.deck.name });
    }
  }

  override onChooseSuggestion(result: Result, event: MouseEvent | KeyboardEvent): void {
    if (result.kind === "new") this.actions.newCard();
    else if (result.kind === "deck") this.actions.chooseDeck?.(result.deck);
    else this.actions.chooseCard(result.card, event);
  }

  private findCards(query: string): Result[] {
    const { decks } = this.store;
    if (query === "") {
      const recent = this.recentCards(decks).slice(0, RECENT_RESULTS);
      return this.typed ? recent : [{ kind: "new" }, ...recent];
    }
    const search = prepareFuzzySearch(query);
    const results = decks.flatMap((deck) =>
      deck.cards.flatMap((card) => {
        const match = search(card.title);
        return match ? [{ kind: "card" as const, card, deck, match }] : [];
      }),
    );
    sortSearchResults(results);
    return results.slice(0, CARD_RESULTS);
  }

  private findDecks(query: string): Result[] {
    const { decks } = this.store;
    if (query === "") {
      return decks.slice(0, DECK_RESULTS).map((deck) => ({ kind: "deck", deck }));
    }
    const search = prepareFuzzySearch(query);
    const results = decks.flatMap((deck) => {
      const match = search(deck.name);
      return match ? [{ kind: "deck" as const, deck, match }] : [];
    });
    sortSearchResults(results);
    return results.slice(0, DECK_RESULTS);
  }

  /** The recently opened cards that are still in the Tracecards folder. */
  private recentCards(decks: readonly Deck[]): Result[] {
    const cards = new Map(
      decks.flatMap((deck) => deck.cards.map((card) => [card.path, { card, deck }] as const)),
    );
    return this.recent.list.flatMap((vaultPath) => {
      const path = this.store.relativePath(vaultPath);
      const found = path === null ? undefined : cards.get(path);
      return found ? [{ kind: "card" as const, ...found }] : [];
    });
  }

  /** The card's cover, small, as the grid shows it: `Cover`'s image or placeholder. */
  private renderCover(frame: HTMLElement, card: Card): void {
    const placeholder = () =>
      frame.createDiv({ cls: "tracecards-cover-placeholder", text: placeholderLetter(card.title) });
    const source = coverSource(this.host, card);
    if (!source) {
      placeholder();
      return;
    }
    const image = frame.createEl("img", {
      cls: "tracecards-cover-image",
      attr: { src: source.url, alt: "", draggable: "false" },
    });
    image.addEventListener("load", () => {
      image.setCssStyles(coverPosition(source.crop, image.naturalWidth, image.naturalHeight));
      image.addClass("is-loaded");
    });
    image.addEventListener("error", () => {
      image.remove();
      placeholder();
    });
  }
}

/** The text, with the letters the query matched highlighted, as Obsidian's quick switcher does. */
function renderTitle(element: HTMLElement, text: string, match: SearchResult | undefined): void {
  if (match) renderResults(element, text, match);
  else element.setText(text);
}

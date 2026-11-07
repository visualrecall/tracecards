import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type WheelEvent,
} from "react";
import { createPortal } from "react-dom";
import type { Layout } from "./cardRows";
import { deckSwitcherMenu, newDeck, padSlots, shownDeck } from "./deckActions";
import { DeckGrid, type Reveal } from "./DeckGrid";
import { deckListTarget, deckModeKey, deckModeTarget } from "./deckMode";
import { DeckPad } from "./DeckPad";
import { useHost } from "./host";
import type { DeckDrop, PadDrop } from "./padDrop";
import { pageCount, WheelPager } from "./paging";
import { type PhoneOptions, PhoneScreen } from "./PhoneScreen";
import { NULL_STORE, type Store, type VaultSnapshot } from "./store";

interface GridScreenProps {
  store: Store<VaultSnapshot>;
  /** The selected deck. The host keeps it so it survives restarts. Null selects the first deck. */
  deck: string | null;
  onDeckChange: (name: string) => void;
  /** Pages of cards around the deck pad, or rows that scroll. The host keeps it too. */
  layout: Layout;
  onLayoutChange: (layout: Layout) => void;
  /**
   * The page showing in each deck in the pad layout, by name, which the host keeps too. Missing
   * means the first.
   */
  pages: Readonly<Record<string, number>>;
  onPageChange: (deck: string, page: number) => void;
  /**
   * A card for the screen to turn to, and to focus and pop in when it's new. The
   * host selects its deck along with it.
   */
  reveal: Reveal | null;
  /** Called once `reveal` has been shown. */
  onRevealed: () => void;
  /** Shows the card form for a new card in the selected deck. */
  onNewCard: () => void;
  /** Opens search for decks, which `#` does. */
  onSearchDecks: () => void;
  /**
   * Called as a dragged card comes near the deck pad or over a deck list, and with null after, so
   * the deck list, in a sidebar, can show where it would go.
   */
  onCardDropChange?: (drop: PadDrop | null) => void;
  /** A deck dragged out of a deck list, such as one in a sidebar, for the pad to show where it would go. */
  deckDrop?: Store<DeckDrop | null>;
  /**
   * Where to show the deck's name, such as the middle of the app's own header. Without it, the
   * name goes above the cards.
   */
  titleSlot?: HTMLElement | null;
  /** On phones, where the pad doesn't fit: shows `PhoneScreen` instead, with these. */
  phone?: PhoneOptions | undefined;
}

/** What had the focus before the deck or page changed, to give it back afterwards. */
type Mode = "cards" | "tile" | null;

/**
 * The main Tracecards screen: the cards of the selected deck, in pages with the deck pad among
 * them, or in the grid layout, in rows that scroll, with no pad.
 *
 * The keys work in two modes. In deck mode no card is selected (the screen itself
 * or a deck's tile has the focus): `deckModeKey`'s keys move between decks and turn pages, and
 * Space, i or Enter selects the first card showing, and r switches the layout. In the grid layout
 * the decks are a list, so `deckListTarget` says where the keys go, through every deck. In card
 * mode a card has the focus and `DeckGrid`'s keys apply, until Esc. Shift with j, k, ↓ or ↑, `[`
 * and `]` (the previous and next deck), and `#` (deck search) work in both. Clicking a card or a
 * deck leaves the mode as it is; turning the page with the wheel leaves card mode.
 */
export function GridScreen({
  store,
  deck: selected,
  onDeckChange,
  layout,
  onLayoutChange,
  pages,
  onPageChange,
  reveal,
  onRevealed,
  onNewCard,
  onSearchDecks,
  onCardDropChange,
  deckDrop = NULL_STORE,
  titleSlot,
  phone,
}: GridScreenProps) {
  const host = useHost();
  const { folder, vault } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const screen = useRef<HTMLDivElement>(null);
  const focusAfterSwitch = useRef<Mode>(null);
  const [pager] = useState(() => new WheelPager());
  const [padDrop, setPadDrop] = useState<PadDrop | null>(null);

  const decks = vault?.decks ?? [];
  const deck = shownDeck(decks, selected);

  const deckName = deck?.name;
  const pageTotal = pageCount(deck?.cards.length ?? 0);
  const page = Math.min(deckName === undefined ? 0 : (pages[deckName] ?? 0), pageTotal - 1);
  useEffect(() => {
    const mode = focusAfterSwitch.current;
    focusAfterSwitch.current = null;
    if (mode === "cards") {
      // The current card, or the screen itself when the deck has no cards.
      const card = screen.current?.querySelector<HTMLElement>(".tracecards-card[tabindex='0']");
      (card ?? screen.current)?.focus({ preventScroll: true });
    }
    if (mode === "tile" && deckName !== undefined) {
      screen.current
        ?.querySelector<HTMLElement>(`[data-deck="${CSS.escape(deckName)}"]`)
        ?.focus({ preventScroll: true });
    }
  }, [deckName, page]);

  if (!vault) {
    return (
      <Message
        action={
          <button type="button" className="mod-cta" onClick={() => host.createFolder()}>
            Create folder
          </button>
        }
      >
        The folder “{folder}” doesn’t exist yet. Tracecards keeps your decks in it, one folder per
        deck. Create it, or choose another folder in the plugin settings.
      </Message>
    );
  }
  if (!deck) {
    const create = async () => {
      const name = await newDeck(host, decks);
      if (name) onDeckChange(name);
    };
    return (
      <Message
        action={
          <button type="button" className="mod-cta" onClick={() => void create()}>
            New deck
          </button>
        }
      >
        No decks yet. Each folder inside “{folder}” is a deck.
      </Message>
    );
  }

  if (phone) {
    return (
      <PhoneScreen
        {...phone}
        decks={decks}
        deck={deck}
        onDeckChange={onDeckChange}
        reveal={reveal}
        onRevealed={onRevealed}
        onNewCard={onNewCard}
      />
    );
  }

  const slots = padSlots(decks);
  const padDecks = slots.filter((item) => item !== undefined);
  // The decks the keys go through: the pad's, or in the grid layout, all of them.
  const keyDecks = layout === "pad" ? padDecks : decks;

  /** The mode the focus is in, so a switch can give it back: a card's, a tile's or neither. */
  const currentMode = (): Mode => {
    const focused = screen.current?.ownerDocument.activeElement;
    if (focused?.closest(".tracecards-card")) return "cards";
    return focused?.matches(".tracecards-deck-tile") ? "tile" : null;
  };

  // A card or tile showing the focus goes away with the deck or page, so it's given back after.
  const selectDeck = (name: string) => {
    focusAfterSwitch.current = currentMode();
    onDeckChange(name);
  };

  const changePage = (next: number) => {
    focusAfterSwitch.current = currentMode();
    onPageChange(deck.name, next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Shift or Alt can be what types `#`, depending on the keyboard.
    if (event.key === "#" && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      onSearchDecks();
      return;
    }
    const target = event.target as HTMLElement;
    const deckMode =
      target === event.currentTarget || target.matches(".tracecards-deck-tile[data-deck]");
    const plain = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    if (deckMode && plain && event.key === "r") {
      event.preventDefault();
      onLayoutChange(layout === "pad" ? "grid" : "pad");
      return;
    }
    const key = deckModeKey(event.nativeEvent);
    if (key === "browse") {
      if (deckMode && focusFirstCard(event.currentTarget)) event.preventDefault();
      return;
    }
    if (key && (deckMode || key === "deckBelow" || key === "deckAbove")) {
      event.preventDefault();
      if (layout === "grid") {
        const next = decks[deckListTarget(key, decks.indexOf(deck), decks.length) ?? -1];
        if (next) selectDeck(next.name);
        return;
      }
      const filled = slots.map((item) => item !== undefined);
      const move = deckModeTarget(key, slots.indexOf(deck), filled, page, pageTotal);
      if (move?.page !== undefined) changePage(move.page);
      else if (move) {
        const next = slots[move.slot];
        if (next) selectDeck(next.name);
      }
      return;
    }
    // `[` and `]`: the previous and next deck, going round.
    const step = event.key === "]" ? 1 : event.key === "[" ? -1 : 0;
    if (step === 0 || event.altKey || event.ctrlKey || event.metaKey) return;
    const next = keyDecks[(keyDecks.indexOf(deck) + step + keyDecks.length) % keyDecks.length];
    if (!next || next === deck) return;
    event.preventDefault();
    selectDeck(next.name);
  };

  /**
   * Scrolling anywhere on the grid, the deck pad included, turns the page and leaves
   * card mode.
   */
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const next = page + pager.turn(event.deltaY, event.timeStamp);
    if (next === page || next < 0 || next >= pageTotal) return;
    if (currentMode() === "cards") screen.current?.focus({ preventScroll: true });
    changePage(next);
  };

  // The deck title: clicking it lists the decks the keys go through. Like the deck tiles, it
  // doesn't take the focus, so the keys keep their mode.
  const title = (
    <button
      type="button"
      className="tracecards-deck-title"
      aria-haspopup="menu"
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) =>
        host.showMenu(deckSwitcherMenu(keyDecks, deck, selectDeck), event.nativeEvent)
      }
    >
      {deck.name}
    </button>
  );

  const titleBar = !titleSlot && <div className="tracecards-title-bar">{title}</div>;
  const cards =
    deck.cards.length === 0 ? (
      <div className="tracecards-grid-message">
        <p className="tracecards-message">This deck has no cards yet.</p>
        <button type="button" className="mod-cta" onClick={onNewCard}>
          New card
        </button>
      </div>
    ) : (
      <DeckGrid
        deck={deck}
        decks={decks}
        layout={layout}
        page={page}
        onPageChange={changePage}
        reveal={reveal}
        onRevealed={onRevealed}
        onPadDropChange={(drop) => {
          setPadDrop(drop);
          onCardDropChange?.(drop);
        }}
      />
    );

  return (
    <div
      ref={screen}
      className={layout === "pad" ? "tracecards-grid-screen" : "tracecards-grid-screen is-rows"}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      {titleSlot && createPortal(title, titleSlot)}
      {layout === "pad" ? (
        <div
          className={titleSlot ? "tracecards-grid" : "tracecards-grid has-title-bar"}
          onWheel={onWheel}
        >
          {titleBar}
          <DeckPad
            decks={decks}
            selected={deck.name}
            onSelect={selectDeck}
            page={page}
            pages={pageTotal}
            onPageChange={changePage}
            cardDrop={padDrop}
            deckDrop={deckDrop}
          />
          {cards}
        </div>
      ) : (
        // Drawn afresh for each deck, so it starts scrolled to the top.
        <div key={deck.name} className="tracecards-rows">
          {titleBar}
          {cards}
        </div>
      )}
    </div>
  );
}

/**
 * Starts card mode on the first card showing: the first on the page, or the
 * first that's in view in rows that scroll. Returns false when there are no cards.
 */
function focusFirstCard(screen: HTMLElement): boolean {
  const cards = [...screen.querySelectorAll<HTMLElement>(".tracecards-card")];
  const top = screen.querySelector(".tracecards-rows")?.getBoundingClientRect().top;
  const card =
    (top === undefined
      ? undefined
      : cards.find((item) => item.getBoundingClientRect().top >= top)) ?? cards[0];
  card?.focus({ preventScroll: true });
  return card !== undefined;
}

/**
 * Puts the grid screen in `container` in deck mode, with the focus on the screen itself.
 * With `key`, also handles that key press as if the screen had had the focus.
 * Returns whether the key was used.
 */
export function focusDeckMode(container: HTMLElement, key?: KeyboardEvent["nativeEvent"]): boolean {
  const screen = container.querySelector<HTMLElement>(".tracecards-grid-screen");
  const view = screen?.ownerDocument.defaultView;
  if (!screen || !view) return false;
  screen.focus({ preventScroll: true });
  if (!key) return false;
  const copy = new view.KeyboardEvent("keydown", {
    key: key.key,
    code: key.code,
    shiftKey: key.shiftKey,
    altKey: key.altKey,
    ctrlKey: key.ctrlKey,
    metaKey: key.metaKey,
    bubbles: true,
    cancelable: true,
  });
  screen.dispatchEvent(copy);
  return copy.defaultPrevented;
}

function Message({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="tracecards-grid-screen">
      <div className="tracecards-empty">
        <p className="tracecards-message">{children}</p>
        {action}
      </div>
    </div>
  );
}

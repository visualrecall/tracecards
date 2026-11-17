import type { Card, Deck } from "@tracecards/core";
import {
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { CardFace } from "./CardFace";
import { cardMenu } from "./cardActions";
import { Cover } from "./Cover";
import { deckMenu } from "./deckActions";
import type { Reveal } from "./DeckGrid";
import { DeckSheet } from "./DeckSheet";
import { prefersLessMotion } from "./DeckToken";
import { type Host, useHost } from "./host";
import { Icon } from "./Icon";
import { ICONS } from "./icons";
import { PageIndicator } from "./PageIndicator";
import { cardAt, type PhoneView } from "./phone";
import { shownTitle } from "./titleCase";

/** What the host keeps for the phone screen, so it survives restarts. */
export interface PhoneOptions {
  view: PhoneView;
}

interface PhoneScreenProps extends PhoneOptions {
  decks: readonly Deck[];
  /** The selected deck, shown one card at a time. */
  deck: Deck;
  onDeckChange: (name: string) => void;
  /** A card to turn to. */
  reveal: Reveal | null;
  onRevealed: () => void;
  /** Shows the card form for a new card in the selected deck. */
  onNewCard: () => void;
}

/**
 * The Tracecards tab on a phone, where the deck pad doesn't fit. One card at a time, swiped
 * sideways, under the deck's name and over the pad's page bar, lying down, for where in the deck it
 * is, with the deck's button at the bottom, which opens a sheet of every deck. Or, switched
 * from the tab's header, the deck's cards as a list, with the same name and button. The header
 * switches how the deck shows, and the button which deck. A long press on a card or the deck's
 * name or button shows its menu.
 * Held sideways, the phone has too little height for a card at a size to read, so it shows the
 * list, and one card at a time again, on the same card, once it's upright.
 */
export function PhoneScreen({ view, ...rest }: PhoneScreenProps) {
  // The card showing in each deck, by path, so coming back to a deck, to the cards from the list,
  // or upright again, comes back to it.
  const [places] = useState(() => new Map<string, string>());
  const sideways = useSyncExternalStore(onTurn, isSideways);
  // Drawn afresh for each deck, so its row starts where that deck was left.
  return view === "card" && !sideways ? (
    <CardRow key={rest.deck.name} {...rest} places={places} />
  ) : (
    <DeckCards key={rest.deck.name} {...rest} places={places} />
  );
}

/**
 * Whether the phone is held on its side, by its screen rather than the window, so a keyboard
 * taking up part of the window doesn't count.
 */
function isSideways(): boolean {
  const orientation = screenOrientation();
  return orientation
    ? orientation.type.startsWith("landscape")
    : window.matchMedia("(orientation: landscape)").matches;
}

/** Calls `onChange` as the phone is turned. */
function onTurn(onChange: () => void): () => void {
  const target: EventTarget = screenOrientation() ?? window.matchMedia("(orientation: landscape)");
  target.addEventListener("change", onChange);
  return () => target.removeEventListener("change", onChange);
}

/** The screen's orientation, which webviews before iOS 16.4 don't have. */
function screenOrientation(): ScreenOrientation | undefined {
  return (window.screen as { orientation?: ScreenOrientation }).orientation;
}

interface CardRowProps extends Omit<PhoneScreenProps, keyof PhoneOptions> {
  places: Map<string, string>;
}

/**
 * A deck's cards in a row that scrolls sideways, a card at a time, under the deck's name, with the
 * page bar and the deck's button below.
 */
function CardRow({
  decks,
  deck,
  onDeckChange,
  reveal,
  onRevealed,
  onNewCard,
  places,
}: CardRowProps) {
  const host = useHost();
  const row = useRef<HTMLUListElement>(null);
  const { cards } = deck;
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      cards.findIndex((card) => card.path === places.get(deck.name)),
    ),
  );
  // The card in the middle, by path, so it stays there when cards come and go.
  const currentPath = useRef(cards[index]?.path);
  const frame = useRef(0);
  const [popping, setPopping] = useState<string | null>(null);

  const onScroll = () => {
    window.cancelAnimationFrame(frame.current);
    frame.current = window.requestAnimationFrame(() => {
      const element = row.current;
      if (!element) return;
      const next = cardAt(element.scrollLeft, stepOf(element), cards.length);
      setIndex(next);
      currentPath.current = cards[next]?.path;
      if (currentPath.current) places.set(deck.name, currentPath.current);
    });
  };
  useEffect(() => () => window.cancelAnimationFrame(frame.current), []);

  // At first, and as cards come and go, the card that was in the middle stays there, or the one
  // that took its place.
  const keepPlace = useEffectEvent(() => {
    const element = row.current;
    if (!element || cards.length === 0) return;
    const at = cards.findIndex((card) => card.path === currentPath.current);
    const target = at === -1 ? Math.min(index, cards.length - 1) : at;
    if (target !== cardAt(element.scrollLeft, stepOf(element), cards.length)) {
      scrollRow(element, target, false);
    }
  });
  useLayoutEffect(() => keepPlace(), [cards]);

  // Turns to a card from search or a new one, which pops in.
  const revealPath = reveal?.path ?? null;
  const revealIndex =
    revealPath === null ? -1 : cards.findIndex((card) => card.path === revealPath);
  if (revealIndex !== -1 && reveal?.isNew && popping !== revealPath) setPopping(revealPath);
  useLayoutEffect(() => {
    if (revealPath === null || revealIndex === -1) return;
    currentPath.current = revealPath;
    scrollRow(row.current, revealIndex, false);
    onRevealed();
  }, [revealPath, revealIndex, onRevealed]);

  const go = (target: number) => {
    if (target >= 0 && target < cards.length) scrollRow(row.current, target, true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const step = { ArrowLeft: -1, h: -1, ArrowRight: 1, l: 1 }[event.key];
    const card = cards[index];
    if (step !== undefined) go(index + step);
    else if ((event.key === "Enter" || event.key === " ") && card)
      host.openCard(card, event.nativeEvent);
    else return;
    event.preventDefault();
  };

  return (
    <div className="tracecards-phone">
      <DeckTitle decks={decks} deck={deck} />
      <div className="tracecards-phone-stage">
        {cards.length === 0 ? (
          <div className="tracecards-phone-empty">
            <p className="tracecards-message">This deck has no cards yet.</p>
            <button type="button" className="mod-cta" onClick={onNewCard}>
              New card
            </button>
          </div>
        ) : (
          // Obsidian opens its sidebars with a sideways swipe, which the row keeps for itself.
          <ul
            ref={row}
            className="tracecards-phone-cards"
            aria-label={deck.name}
            tabIndex={0}
            data-ignore-swipe="true"
            onScroll={onScroll}
            onKeyDown={onKeyDown}
          >
            {cards.map((card, at) => (
              <li
                key={card.path}
                className={[
                  "tracecards-card",
                  "tracecards-phone-card",
                  at === index && "is-current",
                  card.path === popping && "is-popping",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-current={at === index ? "true" : undefined}
                // The card in the middle opens; one either side comes to the middle.
                onClick={(event) =>
                  at === index ? host.openCard(card, event.nativeEvent) : go(at)
                }
                onContextMenu={(event) => showCardMenu(host, decks, card, event)}
                onAnimationEnd={card.path === popping ? () => setPopping(null) : undefined}
              >
                <CardFace card={card} />
              </li>
            ))}
          </ul>
        )}
        <PageIndicator page={index} pages={cards.length} lying />
      </div>
      <DeckButton decks={decks} deck={deck} onDeckChange={onDeckChange} />
    </div>
  );
}

/** The deck's name, at the top of the phone screen. */
function DeckTitle({ decks, deck }: { decks: readonly Deck[]; deck: Deck }) {
  const host = useHost();
  return (
    <h2
      className="tracecards-phone-title"
      onContextMenu={(event) => showDeckMenu(host, decks, deck, event)}
    >
      {deck.name}
    </h2>
  );
}

interface DeckButtonProps {
  decks: readonly Deck[];
  deck: Deck;
  onDeckChange: (name: string) => void;
}

/** The deck's button at the bottom of the phone screen, which opens the sheet of every deck. */
function DeckButton({ decks, deck, onDeckChange }: DeckButtonProps) {
  const host = useHost();
  const openSheet = () =>
    host.showSheet({
      title: "Decks",
      render: (close) => (
        <DeckSheet decks={decks} selected={deck.name} onSelect={onDeckChange} close={close} />
      ),
    });
  return (
    <div className="tracecards-phone-controls">
      <button
        type="button"
        className="tracecards-deck-button"
        aria-haspopup="dialog"
        onClick={openSheet}
        onContextMenu={(event) => showDeckMenu(host, decks, deck, event)}
      >
        <Icon name={deck.icon ?? ICONS.deck} />
        <span className="tracecards-deck-button-name">{deck.name}</span>
      </button>
    </div>
  );
}

/** How far one card in the row is from the next. */
function stepOf(row: HTMLElement): number {
  const items = row.children as HTMLCollectionOf<HTMLElement>;
  const [first, second] = [items[0], items[1]];
  return first && second ? second.offsetLeft - first.offsetLeft : 0;
}

/** Scrolls the row so the card at `index` is in the middle. */
function scrollRow(row: HTMLElement | null, index: number, smooth: boolean): void {
  row?.scrollTo({
    left: index * stepOf(row),
    behavior: smooth && !prefersLessMotion() ? "smooth" : "instant",
  });
}

/**
 * A deck's cards as rows of a small cover and the title, under the deck's name and over its
 * button. The card the deck was left on is marked and scrolled to, and a card tapped becomes the
 * one the cards come back to.
 */
function DeckCards({
  decks,
  deck,
  onDeckChange,
  reveal,
  onRevealed,
  onNewCard,
  places,
}: CardRowProps) {
  const host = useHost();
  const list = useRef<HTMLUListElement>(null);
  const [current, setCurrent] = useState(() => places.get(deck.name) ?? deck.cards[0]?.path);

  // A card from search or a new one becomes the deck's current card.
  const revealPath = reveal?.path ?? null;
  const revealHere = revealPath !== null && deck.cards.some((card) => card.path === revealPath);
  if (revealHere && current !== revealPath) setCurrent(revealPath);

  // Scrolls to the current card, which the cards come back to.
  useEffect(() => {
    if (current === undefined) return;
    places.set(deck.name, current);
    list.current
      ?.querySelector(`[data-path="${CSS.escape(current)}"]`)
      ?.scrollIntoView({ block: "center" });
    if (revealHere) onRevealed();
  }, [current, revealHere, places, deck.name, onRevealed]);

  const open = (card: Card, event: MouseEvent | KeyboardEvent) => {
    places.set(deck.name, card.path);
    setCurrent(card.path);
    host.openCard(card, event.nativeEvent);
  };

  return (
    <div className="tracecards-phone is-lists">
      <DeckTitle decks={decks} deck={deck} />
      {deck.cards.length === 0 ? (
        <div className="tracecards-phone-empty">
          <p className="tracecards-message">This deck has no cards yet.</p>
          <button type="button" className="mod-cta" onClick={onNewCard}>
            New card
          </button>
        </div>
      ) : (
        <ul ref={list} className="tracecards-phone-rows" aria-label={deck.name}>
          {deck.cards.map((card) => (
            <li
              key={card.path}
              className="tracecards-phone-row"
              role="button"
              tabIndex={0}
              data-path={card.path}
              aria-current={card.path === current ? "true" : undefined}
              onClick={(event) => open(card, event)}
              onKeyDown={(event) => onActivate(event, () => open(card, event))}
              onContextMenu={(event) => showCardMenu(host, decks, card, event)}
            >
              <Cover card={card} />
              <span className="tracecards-phone-row-title">
                {shownTitle(card.title, host.titleCase())}
              </span>
            </li>
          ))}
        </ul>
      )}
      <DeckButton decks={decks} deck={deck} onDeckChange={onDeckChange} />
    </div>
  );
}

/** Calls `action` for Enter or Space, as a button would. */
function onActivate(event: KeyboardEvent, action: () => void): void {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
}

/** The card's menu, which a long press opens on phones. */
function showCardMenu(host: Host, decks: readonly Deck[], card: Card, event: MouseEvent): void {
  event.preventDefault();
  host.showMenu(
    cardMenu(host, decks, card, () => {}),
    event.nativeEvent,
  );
}

function showDeckMenu(host: Host, decks: readonly Deck[], deck: Deck, event: MouseEvent): void {
  event.preventDefault();
  host.showMenu(deckMenu(host, decks, deck), event.nativeEvent);
}

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
import { Cover, coverSource } from "./Cover";
import { deckMenu, newDeck, offPadDecks, padDecks } from "./deckActions";
import type { Reveal } from "./DeckGrid";
import { DeckSheet } from "./DeckSheet";
import { prefersLessMotion } from "./DeckToken";
import { type Host, useHost } from "./host";
import { Icon } from "./Icon";
import { ICONS } from "./icons";
import { cardAt, cardsLabel, type PhoneView } from "./phone";
import { shownTitle } from "./titleCase";

/** What the host keeps for the phone screen, so it survives restarts, and how it changes it. */
export interface PhoneOptions {
  view: PhoneView;
  /** In the lists, the deck whose cards are showing, or null for the decks. */
  listDeck: string | null;
  /** Shows the deck's cards in the lists. */
  onOpenDeck: (name: string) => void;
  /** Goes back from a deck's cards to the decks, in the lists. */
  onLeaveDeck: () => void;
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
 * sideways, with the deck's button at the bottom, which opens a sheet of every deck. Or, switched
 * from the tab's header, lists: the decks, then the cards of the one tapped, with a way back. A
 * long press on a card or a deck shows its menu.
 * Held sideways, the phone has too little height for a card at a size to read, so it shows the
 * lists, and one card at a time again, on the same card, once it's upright.
 */
export function PhoneScreen({
  view,
  listDeck,
  onOpenDeck,
  onLeaveDeck,
  ...rest
}: PhoneScreenProps) {
  // The card showing in each deck, by path, so coming back to a deck, or upright again, comes back
  // to it.
  const [places] = useState(() => new Map<string, string>());
  const sideways = useSyncExternalStore(onTurn, isSideways);
  // Drawn afresh for each deck, so its row starts where that deck was left.
  if (view === "card" && !sideways) {
    return <CardRow key={rest.deck.name} {...rest} places={places} />;
  }
  const { decks, deck, onDeckChange, reveal, onRevealed, onNewCard } = rest;
  const open = decks.find((candidate) => candidate.name === listDeck);
  return open ? (
    <DeckCards
      decks={decks}
      deck={open}
      onLeave={onLeaveDeck}
      reveal={reveal}
      onRevealed={onRevealed}
      onNewCard={onNewCard}
    />
  ) : (
    <DecksScreen decks={decks} current={deck} onOpen={onOpenDeck} onDeckChange={onDeckChange} />
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

/** A deck's cards in a row that scrolls sideways, a card at a time, and the deck's button below. */
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

  const openSheet = () =>
    host.showSheet({
      title: "Decks",
      render: (close) => (
        <DeckSheet decks={decks} selected={deck.name} onSelect={onDeckChange} close={close} />
      ),
    });

  return (
    <div className="tracecards-phone">
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
      </div>
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
          {cards.length > 0 && (
            <span className="tracecards-deck-button-position">
              {Math.min(index, cards.length - 1) + 1}/{cards.length}
            </span>
          )}
          <Icon name={ICONS.deckSheet} />
        </button>
      </div>
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

interface DecksScreenProps {
  decks: readonly Deck[];
  /** The deck selected, which is outlined. */
  current: Deck;
  onOpen: (name: string) => void;
  onDeckChange: (name: string) => void;
}

/** Every deck, as tiles: the pad's first, then the others, and a tile for a new deck. */
function DecksScreen({ decks, current, onOpen, onDeckChange }: DecksScreenProps) {
  const host = useHost();
  const pad = padDecks(decks);
  const off = offPadDecks(decks);
  const groups = [
    { title: "On the pad", decks: pad },
    { title: pad.length > 0 ? "Other decks" : "Decks", decks: off },
  ].filter((group) => group.decks.length > 0);

  const create = async () => {
    const name = await newDeck(host, decks);
    if (name === null) return;
    onDeckChange(name);
    onOpen(name);
  };

  return (
    <div className="tracecards-phone is-lists">
      <div className="tracecards-phone-scroll">
        {groups.map((group, at) => (
          <section key={group.title}>
            <h3 className="tracecards-phone-section">{group.title}</h3>
            <ul className="tracecards-phone-decks">
              {group.decks.map((deck) => (
                <li
                  key={deck.name}
                  className="tracecards-phone-deck"
                  role="button"
                  tabIndex={0}
                  data-deck={deck.name}
                  aria-current={deck === current ? "true" : undefined}
                  onClick={() => onOpen(deck.name)}
                  onKeyDown={(event) => onActivate(event, () => onOpen(deck.name))}
                  onContextMenu={(event) => showDeckMenu(host, decks, deck, event)}
                >
                  <span className="tracecards-phone-deck-top">
                    <span className="tracecards-phone-deck-icon">
                      <Icon name={deck.icon ?? ICONS.deck} />
                    </span>
                    <span className="tracecards-phone-deck-covers">
                      {coveredCards(host, deck, 3).map((card) => (
                        <Cover key={card.path} card={card} />
                      ))}
                    </span>
                  </span>
                  <span className="tracecards-phone-deck-name">{deck.name}</span>
                  <span className="tracecards-phone-deck-count">
                    {cardsLabel(deck.cards.length)}
                  </span>
                </li>
              ))}
              {at === groups.length - 1 && (
                <li
                  className="tracecards-phone-deck is-new"
                  role="button"
                  tabIndex={0}
                  onClick={() => void create()}
                  onKeyDown={(event) => onActivate(event, () => void create())}
                >
                  <Icon name={ICONS.add} />
                  <span>New deck</span>
                </li>
              )}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

/** The first `count` cards of the deck that have a cover image. */
function coveredCards(host: Host, deck: Deck, count: number): Card[] {
  const found: Card[] = [];
  for (const card of deck.cards) {
    if (found.length === count) break;
    if (coverSource(host, card)) found.push(card);
  }
  return found;
}

interface DeckCardsProps {
  decks: readonly Deck[];
  deck: Deck;
  onLeave: () => void;
  reveal: Reveal | null;
  onRevealed: () => void;
  onNewCard: () => void;
}

/** A deck's cards as rows of a small cover and the title, under the deck's name and a way back. */
function DeckCards({ decks, deck, onLeave, reveal, onRevealed, onNewCard }: DeckCardsProps) {
  const host = useHost();
  const list = useRef<HTMLUListElement>(null);

  const revealPath = reveal?.path ?? null;
  const revealHere = revealPath !== null && deck.cards.some((card) => card.path === revealPath);
  useEffect(() => {
    if (!revealHere || revealPath === null) return;
    list.current
      ?.querySelector(`[data-path="${CSS.escape(revealPath)}"]`)
      ?.scrollIntoView({ block: "nearest" });
    onRevealed();
  }, [revealHere, revealPath, onRevealed]);

  return (
    <div className="tracecards-phone is-lists">
      <div className="tracecards-phone-head">
        <button
          type="button"
          className="tracecards-phone-back"
          aria-label="Back to the decks"
          onClick={onLeave}
        >
          <Icon name={ICONS.leaveDeck} />
        </button>
        <span
          className="tracecards-phone-head-name"
          onContextMenu={(event) => showDeckMenu(host, decks, deck, event)}
        >
          {deck.name}
        </span>
        <span className="tracecards-phone-head-count">{cardsLabel(deck.cards.length)}</span>
      </div>
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
              onClick={(event) => host.openCard(card, event.nativeEvent)}
              onKeyDown={(event) => onActivate(event, () => host.openCard(card, event.nativeEvent))}
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

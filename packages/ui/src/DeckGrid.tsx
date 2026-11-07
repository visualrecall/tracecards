import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import type { Card, Deck } from "@tracecards/core";
import {
  type CSSProperties,
  type KeyboardEvent,
  memo,
  type MouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { CardFace } from "./CardFace";
import { cardMenu, deleteCard, moveCard, moveProblem, saveCardRanks } from "./cardActions";
import { gridColumns, type Layout, rowMoveTarget } from "./cardRows";
import {
  type DragEndHandler,
  type DragMoveHandler,
  type DragOverHandler,
  type DragStartHandler,
  PLUGINS,
  SENSORS,
  SORT_TRANSITION,
} from "./dnd";
import { reorderMove } from "./gridNavigation";
import { type Host, useHost } from "./host";
import { CARDS_PER_PAGE, cardMove, cardMoveTarget, pageOf } from "./paging";
import {
  type DropZone,
  FLIGHT_MS,
  type Flight,
  flightInto,
  isNear,
  NEAR_PAD_DWELL_MS,
  nearestTile,
  type PadDrop,
  type Point,
  SHRUNK_SCALE,
} from "./padDrop";
import { usePendingOrder } from "./usePendingOrder";

/** The click or key press that opens a card, so modifier keys can be honoured. */
type OpenEvent = Parameters<Host["openCard"]>[1];

/** A card for the grid to turn to. A new card is also selected and pops in. */
export interface Reveal {
  path: string;
  isNew: boolean;
}

interface DeckGridProps {
  deck: Deck;
  /** All decks, which the card menu offers to move cards to. */
  decks: readonly Deck[];
  layout: Layout;
  /** The page of cards to show, in the pad layout. */
  page: number;
  onPageChange: (page: number) => void;
  /** A card in this deck to turn to, or null. */
  reveal: Reveal | null;
  /** Called once `reveal` has been shown. */
  onRevealed: () => void;
  /**
   * Called as a dragged card comes near the deck pad or over a deck list, and over their decks,
   * and with null after.
   */
  onPadDropChange: (drop: PadDrop | null) => void;
}

/** The card in the tab order, and where it was, for when it leaves the deck. */
interface Cursor {
  path: string;
  index: number;
}

/** A card being dragged, and where it stands with the deck pad. */
interface CardDrag extends PadDrop {
  path: string;
  /** Where the card was grabbed, from its top left corner. */
  grab: Point;
  /** The card's width and height. */
  size: Point;
}

/** The deck pad or deck list a dragged card is at, and its element. */
interface ZoneElement {
  zone: DropZone;
  element: Element;
}

/**
 * A deck's cards. In the pad layout, one page of them, laid out in the grid of the screen around
 * the deck pad; in the grid layout, all of them, in rows that scroll. Arrow keys or h j k l move
 * between cards as `cardMoveTarget` or `rowMoveTarget` describes, Page Up and Page Down turn the
 * page or move two rows, Enter or Space opens a card, and Esc goes back to deck mode (see
 * `GridScreen`). Only the current card is in the tab order, so Tab leaves the grid in one step.
 * Cards can be dragged to reorder them among the cards showing, or moved with Alt and the arrow
 * keys, which can take them onto another page. Dropping a card on another deck's tile in the pad
 * moves it there, and so does dropping it on a deck in a deck list (`DeckList`).
 * Right-clicking a card shows its menu.
 */
export function DeckGrid({
  deck,
  decks,
  layout,
  page,
  onPageChange,
  reveal,
  onRevealed,
  onPadDropChange,
}: DeckGridProps) {
  const host = useHost();
  const list = useRef<HTMLUListElement>(null);
  const items = useRef(new Map<string, HTMLLIElement>());
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [popping, setPopping] = useState<string | null>(null);
  const [cardDrag, setCardDrag] = useState<CardDrag | null>(null);
  // The card dropped on a deck's tile, hidden until it has gone from the deck.
  const [dropped, setDropped] = useState<string | null>(null);
  // Changed to draw the list afresh (see `dropOnDeck`).
  const [listKey, setListKey] = useState(0);
  const [flight, setFlight] = useState<Flight | null>(null);
  const landed = useCallback(() => setFlight(null), []);
  const drag = useRef<{ card: CardDrag | null; point: Point; timer: number | null }>({
    card: null,
    point: { x: 0, y: 0 },
    timer: null,
  });
  const [shown, reorder] = usePendingOrder(
    deck.cards,
    (card) => card.path,
    (updates) => saveCardRanks(host, updates),
  );
  const paged = layout === "pad";
  const start = paged ? page * CARDS_PER_PAGE : 0;
  const pageCards = paged ? shown.slice(start, start + CARDS_PER_PAGE) : shown;
  /** The page the card at `index` is on. In the grid layout, every card is on the one showing. */
  const pageAt = (index: number) => (paged ? pageOf(index) : page);
  const current =
    pageCards.find((card) => card.path === cursor?.path) ??
    // When the card has left the deck, the one that took its place.
    (cursor && pageAt(cursor.index) === page
      ? pageCards[Math.min(cursor.index - start, pageCards.length - 1)]
      : undefined) ??
    pageCards[0];
  // Set when the keyboard moves a card: React moves its element, which can lose focus.
  const refocus = useRef(false);
  // The card being moved to another deck or deleted, whose element takes the focus with it.
  const leaving = useRef<string | null>(null);

  if (dropped !== null && !shown.some((card) => card.path === dropped)) setDropped(null);

  // The cards' handlers stay the same from one render to the next, so a card draws again only
  // when its own props change: in the grid layout, all of a deck's cards are showing.

  // Whichever card gets the focus is the current one.
  const onCardFocus = useCallback(
    (card: Card) => setCursor({ path: card.path, index: shown.indexOf(card) }),
    [shown],
  );

  const open = useCallback((card: Card, event: OpenEvent) => host.openCard(card, event), [host]);

  const onPopped = useCallback(() => setPopping(null), []);

  /** Focuses the card. In rows that scroll, they scroll only as far as it takes to show it. */
  const focusCard = useCallback(
    (path: string) => {
      const element = items.current.get(path);
      if (paged) element?.focus();
      else {
        element?.focus({ preventScroll: true });
        element?.scrollIntoView({ block: "nearest" });
      }
    },
    [paged],
  );

  /** Called as the card is about to leave the deck. */
  const leave = (card: Card) => () => {
    leaving.current = card.path;
  };

  const onMenu = useCallback(
    (card: Card, event: MouseEvent) => {
      event.preventDefault();
      host.showMenu(cardMenu(host, decks, card, leave(card)), event.nativeEvent);
    },
    [host, decks],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (!current) return;
    // Stops browsing the cards: the screen takes the focus until Space.
    if (event.key === "Escape") {
      event.preventDefault();
      list.current?.closest<HTMLElement>(".tracecards-grid-screen")?.focus({ preventScroll: true });
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open(current, event.nativeEvent);
      return;
    }
    // As "Delete…" in its menu. A Mac's delete key is Backspace.
    const { key, altKey, ctrlKey, metaKey, shiftKey } = event;
    if ((key === "Delete" || key === "Backspace") && !(altKey || ctrlKey || metaKey || shiftKey)) {
      event.preventDefault();
      void deleteCard(host, current, leave(current));
      return;
    }
    const reorderStep = reorderMove(event.nativeEvent);
    const step = reorderStep ?? cardMove(event.nativeEvent);
    if (!step) return;
    event.preventDefault();
    const index = shown.indexOf(current);
    const target = paged
      ? cardMoveTarget(index, shown.length, step)
      : rowMoveTarget(index, shown.length, gridColumns(event.currentTarget), step);
    if (reorderStep) {
      refocus.current = true;
      setCursor({ path: current.path, index: target });
      reorder(index, target);
      if (pageAt(target) !== page) onPageChange(pageAt(target));
      return;
    }
    const next = shown[target];
    if (!next) return;
    setCursor({ path: next.path, index: target });
    if (pageAt(target) === page) focusCard(next.path);
    else {
      refocus.current = true;
      onPageChange(pageOf(target));
    }
  };

  useEffect(() => {
    const left = leaving.current !== null && !shown.some((card) => card.path === leaving.current);
    if (left) {
      leaving.current = null;
      // Only if the focus was in the grid, which it leaves when the card's element goes.
      const focused = list.current?.ownerDocument.activeElement;
      if (focused === list.current?.ownerDocument.body) refocus.current = true;
    }
    if (!refocus.current || !current) return;
    refocus.current = false;
    focusCard(current.path);
  }, [shown, current, focusCard]);

  // Turn to the card's page, or scroll to it. A new card then becomes the current card, takes the
  // focus and plays the pop.
  const revealPath = reveal?.path ?? null;
  const revealNew = reveal?.isNew ?? false;
  const revealIndex =
    revealPath === null ? -1 : shown.findIndex((card) => card.path === revealPath);
  const revealHere = revealPath !== null && revealIndex !== -1 && pageAt(revealIndex) === page;
  if (revealHere && revealNew && (cursor?.path !== revealPath || popping !== revealPath)) {
    setCursor({ path: revealPath, index: revealIndex });
    setPopping(revealPath);
  }
  useEffect(() => {
    if (revealPath === null || revealIndex === -1) return;
    if (!revealHere) {
      onPageChange(pageOf(revealIndex));
      return;
    }
    const element = items.current.get(revealPath);
    if (!paged) element?.scrollIntoView({ block: "nearest" });
    if (revealNew) element?.focus({ preventScroll: true });
    onRevealed();
  }, [revealPath, revealNew, revealIndex, revealHere, paged, onPageChange, onRevealed]);

  const pad = () =>
    list.current?.closest(".tracecards-grid")?.querySelector(".tracecards-deck-pad") ?? null;

  const updateDrag = (next: CardDrag | null) => {
    drag.current.card = next;
    setCardDrag(next);
    onPadDropChange(next);
  };

  const stopDwelling = () => {
    if (drag.current.timer !== null) window.clearTimeout(drag.current.timer);
    drag.current.timer = null;
  };

  /**
   * Where a card dragged to `point` would be dropped: near the deck pad, or over a deck list,
   * such as the Decks panel in the sidebar.
   */
  const dropZoneAt = (point: Point): ZoneElement | null => {
    const padElement = pad();
    if (padElement && isNear(padElement.getBoundingClientRect(), point)) {
      return { zone: "pad", element: padElement };
    }
    const lists = list.current?.ownerDocument.querySelectorAll(".tracecards-deck-rows") ?? [];
    const rows = [...lists].find((element) => isNear(element.getBoundingClientRect(), point, 0));
    return rows ? { zone: "list", element: rows } : null;
  };

  /**
   * The deck a card dropped at `point`, in the pad or deck list it's at, would go to: the pad's
   * tile nearest the point, or the deck list's row under it. Never this deck.
   */
  const dropAt = ({ zone, element }: ZoneElement, point: Point): PadDrop => {
    const targets = [...element.querySelectorAll<HTMLElement>("[data-deck]")].flatMap((tile) => {
      const name = tile.dataset.deck;
      return name === undefined || name === deck.name
        ? []
        : [{ name, rect: tile.getBoundingClientRect() }];
    });
    const target =
      zone === "pad"
        ? nearestTile(targets, point)
        : targets.find(({ rect }) => isNear(rect, point, 0));
    return { zone, target: target?.name ?? null };
  };

  const onDragStart: DragStartHandler = (event) => {
    const { source, position } = event.operation;
    if (!isSortable(source) || !source.element) return;
    const rect = source.element.getBoundingClientRect();
    const point = position.current;
    drag.current.point = point;
    updateDrag({
      path: String(source.id),
      grab: { x: point.x - rect.left, y: point.y - rect.top },
      size: { x: rect.width, y: rect.height },
      zone: null,
      target: null,
    });
  };

  const onDragMove: DragMoveHandler = (event) => {
    const card = drag.current.card;
    if (!card) return;
    // `to` is where the pointer is now; the operation's position catches up after the event.
    const point = event.to ?? event.operation.position.current;
    drag.current.point = point;
    const zone = dropZoneAt(point);
    if (!zone) {
      stopDwelling();
      if (card.zone !== null) updateDrag({ ...card, zone: null, target: null });
      return;
    }
    if (card.zone !== null) {
      const drop = dropAt(zone, point);
      if (drop.zone !== card.zone || drop.target !== card.target) updateDrag({ ...card, ...drop });
      return;
    }
    // After a moment near the pad or over a deck list, so passing by doesn't
    // shrink the card.
    drag.current.timer ??= window.setTimeout(() => {
      drag.current.timer = null;
      const latest = drag.current.card;
      const now = dropZoneAt(drag.current.point);
      if (latest && now) updateDrag({ ...latest, ...dropAt(now, drag.current.point) });
    }, NEAR_PAD_DWELL_MS);
  };

  // Near the pad or over a deck list, the other cards don't make way for the dragged one.
  const onDragOver: DragOverHandler = (event) => {
    if (drag.current.card?.zone) event.preventDefault();
  };

  const onDragEnd: DragEndHandler = (event) => {
    const card = drag.current.card;
    stopDwelling();
    updateDrag(null);
    const { source } = event.operation;
    if (event.canceled || !isSortable(source)) return;
    const moving = shown.find((candidate) => candidate.path === String(source.id));
    const target = card?.zone ? decks.find((candidate) => candidate.name === card.target) : null;
    if (moving && card && target) {
      dropOnDeck(moving, target, card);
      return;
    }
    setCursor({ path: String(source.id), index: start + source.index });
    reorder(start + source.initialIndex, start + source.index);
  };

  /**
   * Moves a card dropped on a deck there. While the card was dragged, dnd-kit moved the
   * other cards' elements to make way; drawing the list afresh puts them back in the deck's order.
   */
  const dropOnDeck = (card: Card, target: Deck, { size }: CardDrag) => {
    setListKey((key) => key + 1);
    const problem = moveProblem(card, target);
    if (problem) {
      host.notify(problem);
      return;
    }
    const tile = dropZoneAt(drag.current.point)?.element.querySelector(
      `[data-deck="${CSS.escape(target.name)}"]`,
    );
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (tile && !reducedMotion) {
      setFlight(flightInto(tile.getBoundingClientRect(), drag.current.point, size));
    }
    setDropped(card.path);
    void moveCard(host, card, target, leave(card)).then((moved) => {
      if (!moved) setDropped(null);
    });
  };

  return (
    <DragDropProvider
      sensors={SENSORS}
      plugins={PLUGINS}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <ul
        key={listKey}
        ref={list}
        className={paged ? "tracecards-cards" : "tracecards-cards is-rows"}
        role="listbox"
        aria-label={deck.name}
        onKeyDown={onKeyDown}
      >
        {pageCards.map((card, index) => (
          <CardItem
            key={card.path}
            card={card}
            index={index}
            current={card === current}
            popping={card.path === popping}
            dropped={card.path === dropped}
            drag={card.path === cardDrag?.path ? cardDrag : null}
            items={items}
            onOpen={open}
            onFocus={onCardFocus}
            onMenu={onMenu}
            onPopped={onPopped}
          />
        ))}
      </ul>
      {flight && <DropProxy flight={flight} onLanded={landed} />}
    </DragDropProvider>
  );
}

/** The block that flies into a deck's tile when a card is dropped on it. */
function DropProxy({ flight, onLanded }: { flight: Flight; onLanded: () => void }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const animation = element.current?.animate(
      [
        { transform: "none" },
        { transform: `translate(${flight.by.x}px, ${flight.by.y}px) scale(0)` },
      ],
      { duration: FLIGHT_MS, easing: "ease-in", fill: "forwards" },
    );
    animation?.addEventListener("finish", onLanded);
    return () => animation?.cancel();
  }, [flight, onLanded]);
  const { left, top, width, height } = flight;
  return (
    <div
      ref={element}
      className="tracecards-drop-proxy"
      style={{ left, top, width, height }}
      aria-hidden="true"
    />
  );
}

interface CardItemProps {
  card: Card;
  index: number;
  /** Whether this is the card in the tab order. */
  current: boolean;
  /** Whether the card has just been created and plays the pop. */
  popping: boolean;
  /** Whether the card has been dropped on another deck's tile, and is hidden. */
  dropped: boolean;
  /** The drag, when this card is being dragged. */
  drag: CardDrag | null;
  /** Where cards register their element, by path, for keyboard navigation. */
  items: RefObject<Map<string, HTMLLIElement>>;
  onOpen: (card: Card, event: OpenEvent) => void;
  onFocus: (card: Card) => void;
  onMenu: (card: Card, event: MouseEvent) => void;
  onPopped: () => void;
}

const CardItem = memo(function CardItem({
  card,
  index,
  current,
  popping,
  dropped,
  drag,
  items,
  onOpen,
  onFocus,
  onMenu,
  onPopped,
}: CardItemProps) {
  const { ref } = useSortable({ id: card.path, index, transition: SORT_TRANSITION });
  const { path } = card;
  const itemRef = useCallback(
    (element: HTMLLIElement | null) => {
      ref(element);
      if (!element) return;
      items.current.set(path, element);
      return () => {
        ref(null);
        items.current.delete(path);
      };
    },
    [ref, items, path],
  );

  return (
    <li
      ref={itemRef}
      className={[
        "tracecards-card",
        popping && "is-popping",
        dropped && "is-dropped",
        drag?.zone && "is-near-deck",
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        drag
          ? ({
              "--tracecards-grab-x": `${drag.grab.x}px`,
              "--tracecards-grab-y": `${drag.grab.y}px`,
              "--tracecards-near-scale": SHRUNK_SCALE,
            } as CSSProperties)
          : undefined
      }
      role="option"
      aria-selected={current}
      tabIndex={current ? 0 : -1}
      // Clicking leaves the mode as it is: it doesn't select the card.
      onMouseDown={(event) => event.preventDefault()}
      onFocus={() => onFocus(card)}
      onClick={(event) => onOpen(card, event.nativeEvent)}
      onAuxClick={(event) => {
        if (event.button === 1) onOpen(card, event.nativeEvent);
      }}
      onContextMenu={(event) => onMenu(card, event)}
      onAnimationEnd={popping ? onPopped : undefined}
    >
      <CardFace card={card} />
    </li>
  );
});

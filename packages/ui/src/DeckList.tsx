import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import type { Deck } from "@tracecards/core";
import {
  type AnimationEvent,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { rowMoveTarget } from "./cardRows";
import { deckMenu, newDeck, placeDeck, saveDeckRanks, shownDeck } from "./deckActions";
import { DeckToken, prefersLessMotion, type TokenFlight } from "./DeckToken";
import {
  type DragEndHandler,
  type DragMoveHandler,
  type DragOverHandler,
  type DragStartHandler,
  PLUGINS,
  SENSORS,
  SORT_TRANSITION,
  slideFrom,
  unsort,
} from "./dnd";
import { type GridMove, gridMove, reorderMove } from "./gridNavigation";
import { useHost } from "./host";
import { Icon } from "./Icon";
import { ICONS } from "./icons";
import {
  type DeckDrop,
  isNear,
  landingKeyframes,
  type PadDrop,
  type Point,
  returnKeyframes,
  slotAt,
  TOKEN_LAND_MS,
  TOKEN_RETURN_MS,
  tokenShift,
} from "./padDrop";
import type { Store, VaultSnapshot } from "./store";
import { usePendingOrder } from "./usePendingOrder";

interface DeckListProps {
  decks: readonly Deck[];
  /** The deck showing, which is highlighted. */
  selected: string | undefined;
  onSelect: (name: string) => void;
  /** A card being dragged over the grid, and the deck it would be dropped on, or null. */
  cardDrop: PadDrop | null;
  /**
   * Called as a deck dragged out of the list comes near a deck pad and over its slots, and once
   * it's dropped in one, until it's saved there. Called with null when it's back over the list,
   * or let go anywhere else.
   */
  onDeckDropChange?: (drop: DeckDrop | null) => void;
}

/** A deck being dragged from the list. */
interface RowDrag {
  deck: Deck;
  /** Where the row was grabbed, from its top left corner. */
  grab: Point;
  /** How far the row's label moves to become the pill beside the pointer, near a pad. */
  shift: Point;
  point: Point;
  /** What the pads have been told: null while the deck is over the list. */
  drop: DeckDrop | null;
}

/**
 * Every deck, in order, with its icon, name and card count. Clicking a deck selects it, and
 * right-clicking shows its menu. Decks can be dragged to reorder them, and cards dragged from the
 * grid can be dropped on them (`DeckGrid` finds the rows by their `data-deck`). The + button
 * creates a deck. With the focus, ↑ and ↓ or j and k select the deck above or below, Home and End
 * the first and last, and Alt with ↑ or ↓ moves the selected deck.
 *
 * A deck dragged out of the list can be dropped in a slot of the deck pad (`DeckPad` shows where
 * it would go, and finds its slots by their `data-slot`). Near the pad, the row shrinks into a
 * pill of its icon and name beside the pointer. Dropped in a slot, the pill is drawn into it and
 * the deck is selected. A deck that was in the slot comes off the pad and flies back to its row here, which
 * flashes; it isn't moved to another slot. A deck that was on the pad leaves its old slot empty.
 * Let go anywhere else out of the list, the row slides back and the order stays as it was.
 */
function DeckList({ decks, selected, onSelect, cardDrop, onDeckDropChange }: DeckListProps) {
  const host = useHost();
  const root = useRef<HTMLDivElement>(null);
  const rows = useRef<HTMLDivElement>(null);
  const [shown, reorder] = usePendingOrder(
    decks,
    (deck) => deck.name,
    (updates) => saveDeckRanks(host, updates),
  );
  // Set when the keyboard selects or moves a deck, whose row then takes the focus.
  const refocus = useRef(false);
  const drag = useRef<RowDrag | null>(null);
  // What the pads were last told, so a save that finishes late doesn't clear a newer drag.
  const published = useRef<DeckDrop | null>(null);
  // The deck dragged near a pad, whose row is a pill, and how far its label moves.
  const [token, setToken] = useState<{ name: string; shift: Point } | null>(null);
  // Changed to draw the rows afresh after a drop on the pad (see `dropOnPad`).
  const [rowsKey, setRowsKey] = useState(0);
  const [landing, setLanding] = useState<TokenFlight | null>(null);
  const [leaving, setLeaving] = useState<TokenFlight | null>(null);
  // The deck that has just come off the pad, whose row flashes.
  const [returned, setReturned] = useState<string | null>(null);
  // A deck let go out of the list, but not on the pad: where its row slides back from.
  const [settle, setSettle] = useState<{ name: string; from: Point } | null>(null);
  useLayoutEffect(() => {
    if (!settle) return;
    const row = rows.current?.querySelector(`[data-deck="${CSS.escape(settle.name)}"]`);
    if (row) slideFrom(row, settle.from);
  }, [settle]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = shown.findIndex((deck) => deck.name === selected);
    // The decks are a grid of one column, where left and right do nothing.
    const target = (move: GridMove | null) =>
      move && move !== "left" && move !== "right"
        ? rowMoveTarget(index, shown.length, 1, move)
        : null;
    const reorderTarget = target(reorderMove(event.nativeEvent));
    if (reorderTarget !== null) {
      event.preventDefault();
      refocus.current = true;
      reorder(index, reorderTarget);
      return;
    }
    const next = shown[target(gridMove(event.nativeEvent)) ?? -1];
    if (!next) return;
    event.preventDefault();
    refocus.current = true;
    onSelect(next.name);
  };

  useEffect(() => {
    if (!refocus.current || selected === undefined) return;
    refocus.current = false;
    rows.current?.querySelector<HTMLElement>(`[data-deck="${CSS.escape(selected)}"]`)?.focus();
  }, [shown, selected]);

  const publish = (drop: DeckDrop | null) => {
    published.current = drop;
    onDeckDropChange?.(drop);
  };

  /** The deck pads in the list's window that are showing. */
  const pads = (): HTMLElement[] => {
    const doc = root.current?.ownerDocument;
    if (!doc) return [];
    return [...doc.querySelectorAll<HTMLElement>(".tracecards-deck-pad[data-pad]")].filter(
      // A pad in a tab that isn't showing has no size.
      (pad) => pad.getBoundingClientRect().width > 0,
    );
  };

  /** What the pads should show for `deck` dragged to `point`: null while it's over the list. */
  const dropAt = (deck: Deck, point: Point): DeckDrop | null => {
    const list = root.current?.getBoundingClientRect();
    if (!list || isNear(list, point, 0)) return null;
    const pad = pads().find((element) => isNear(element.getBoundingClientRect(), point));
    const slots = [...(pad?.querySelectorAll<HTMLElement>("[data-slot]") ?? [])].map((tile) => ({
      slot: Number(tile.dataset.slot),
      deck: tile.dataset.deck,
      rect: tile.getBoundingClientRect(),
    }));
    return {
      deck: deck.name,
      pad: pad?.dataset.pad ?? null,
      slot: slotAt(slots, point, deck.name)?.slot ?? null,
      landing: false,
    };
  };

  const onDragStart: DragStartHandler = (event) => {
    const { source, position } = event.operation;
    if (!isSortable(source) || !source.element) return;
    const deck = shown.find((item) => item.name === String(source.id));
    if (!deck) return;
    const rect = source.element.getBoundingClientRect();
    const label = labelOf(source.element)?.getBoundingClientRect() ?? rect;
    // As the pill, the label is at the top of the row's content (see the styles).
    const top = parseFloat(getComputedStyle(source.element).paddingTop) || 0;
    const point = position.current;
    const grab = { x: point.x - rect.left, y: point.y - rect.top };
    const shift = tokenShift(grab, { x: label.left - rect.left, y: top });
    drag.current = { deck, grab, shift, point, drop: null };
  };

  const onDragMove: DragMoveHandler = (event, manager) => {
    const current = drag.current;
    if (!current) return;
    // `to` is where the pointer is now; the operation's position catches up after the event.
    const point = event.to ?? event.operation.position.current;
    current.point = point;
    const drop = dropAt(current.deck, point);
    // Out of the list, the other decks go back to their places.
    if (drop && !current.drop) unsort(manager);
    if (sameDrop(drop, current.drop)) return;
    current.drop = drop;
    publish(drop);
    const { name } = current.deck;
    const { shift } = current;
    setToken((was) => (drop?.pad ? (was ?? { name, shift }) : null));
  };

  // Out of the list, the other rows don't make way for the dragged one.
  const onDragOver: DragOverHandler = (event) => {
    if (drag.current?.drop) event.preventDefault();
  };

  const onDragEnd: DragEndHandler = (event) => {
    const current = drag.current;
    drag.current = null;
    setToken(null);
    const drop = current?.drop;
    if (!event.canceled && current && drop?.pad && drop.slot !== null) {
      // The pill's size, before the row goes back to a row.
      const pill = labelOf(event.operation.source?.element)?.getBoundingClientRect();
      const size = { x: pill?.width ?? 0, y: pill?.height ?? 0 };
      dropOnPad(current, size, drop, drop.pad, drop.slot);
      return;
    }
    publish(null);
    const { source } = event.operation;
    if (event.canceled || !isSortable(source)) return;
    if (current?.drop) {
      // Let go out of the list: dnd-kit may have moved the rows on the way out, so they're drawn
      // afresh in their order, and the row slides back from where it was let go.
      setRowsKey((key) => key + 1);
      const { deck, point, grab } = current;
      setSettle({ name: deck.name, from: { x: point.x - grab.x, y: point.y - grab.y } });
      return;
    }
    reorder(source.initialIndex, source.index);
  };

  /**
   * Drops the deck in `slot` of the pad `padId`: its pill, of `size`, is drawn into the slot, then the pad
   * shows the deck there while it's saved, the deck is selected, and a deck it replaces flies back
   * to its row. While the deck was dragged, dnd-kit may have moved the other rows to make way;
   * drawing them afresh puts them back, and keeps dnd-kit from sliding the dragged row back in.
   */
  const dropOnPad = (
    { deck, point }: RowDrag,
    size: Point,
    drop: DeckDrop,
    padId: string,
    slot: number,
  ) => {
    setRowsKey((key) => key + 1);
    const tile = pads()
      .find((pad) => pad.dataset.pad === padId)
      ?.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
    const occupant = decks.find((item) => item.name === tile?.dataset.deck);
    const tileRect = tile?.getBoundingClientRect();
    const body = root.current?.ownerDocument.body;
    const motion = !prefersLessMotion();

    const land = () => {
      const landed: DeckDrop = { ...drop, landing: true };
      publish(landed);
      onSelect(deck.name);
      const row =
        occupant && rows.current?.querySelector(`[data-deck="${CSS.escape(occupant.name)}"]`);
      const label = labelOf(row)?.getBoundingClientRect();
      if (occupant && label && tileRect && body && motion) {
        setLeaving({
          deck: occupant,
          frames: returnKeyframes(tileRect, label),
          duration: TOKEN_RETURN_MS,
          easing: "cubic-bezier(0.4, 0, 0.2, 1)",
          container: body,
        });
      }
      void placeDeck(host, deck, occupant, slot).then(() => {
        if (published.current === landed) publish(null);
      });
    };

    if (!tileRect || !body || !motion) {
      land();
      return;
    }
    setLanding({
      deck,
      frames: landingKeyframes(point, size, tileRect),
      duration: TOKEN_LAND_MS,
      easing: "ease-in",
      container: body,
    });
    // Not when the pill's animation ends: the list can close meanwhile, and the drop still lands.
    window.setTimeout(land, TOKEN_LAND_MS);
  };

  const onMenu = (deck: Deck, event: MouseEvent) => {
    event.preventDefault();
    host.showMenu(deckMenu(host, decks, deck), event.nativeEvent);
  };

  const create = async () => {
    const name = await newDeck(host, decks);
    if (name) onSelect(name);
  };

  return (
    <div ref={root} className="tracecards-deck-list">
      <div className="tracecards-deck-list-header">
        <span className="tracecards-deck-list-title">Decks</span>
        <button
          type="button"
          className="clickable-icon"
          aria-label="New deck"
          onClick={() => void create()}
        >
          <Icon name={ICONS.add} />
        </button>
      </div>
      <DragDropProvider
        sensors={SENSORS}
        plugins={PLUGINS}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div
          key={rowsKey}
          ref={rows}
          className="tracecards-deck-rows"
          role="listbox"
          aria-label="Decks"
          onKeyDown={onKeyDown}
        >
          {shown.map((deck, index) => (
            <DeckRow
              key={deck.name}
              deck={deck}
              index={index}
              selected={deck.name === selected}
              dropTarget={cardDrop?.zone === "list" && cardDrop.target === deck.name}
              token={token?.name === deck.name ? token.shift : null}
              returned={deck.name === returned}
              onReturned={() => setReturned(null)}
              onSelect={onSelect}
              onMenu={onMenu}
            />
          ))}
        </div>
      </DragDropProvider>
      {landing && (
        <DeckToken flight={landing} variant="is-carried" onDone={() => setLanding(null)} />
      )}
      {leaving && (
        <DeckToken
          flight={leaving}
          onDone={({ deck }) => {
            setLeaving(null);
            setReturned(deck.name);
          }}
        />
      )}
    </div>
  );
}

/** A row's label: its icon and name, which become the pill near the pad. */
function labelOf(row: Element | null | undefined): Element | null | undefined {
  return row?.querySelector(".tracecards-deck-row-label");
}

function sameDrop(a: DeckDrop | null, b: DeckDrop | null): boolean {
  return a === b || (a !== null && b !== null && a.pad === b.pad && a.slot === b.slot);
}

interface DeckRowProps {
  deck: Deck;
  index: number;
  selected: boolean;
  /** Whether a card dragged from the grid would be dropped on this deck. */
  dropTarget: boolean;
  /** Dragged near a pad: how far the label moves to become the pill. Null otherwise. */
  token: Point | null;
  /** Whether the deck has just come off the pad, so its row flashes. */
  returned: boolean;
  onReturned: () => void;
  onSelect: (name: string) => void;
  onMenu: (deck: Deck, event: MouseEvent) => void;
}

function DeckRow({
  deck,
  index,
  selected,
  dropTarget,
  token,
  returned,
  onReturned,
  onSelect,
  onMenu,
}: DeckRowProps) {
  const { ref, isDragging } = useSortable({ id: deck.name, index, transition: SORT_TRANSITION });
  const onAnimationEnd = (event: AnimationEvent) => {
    if (event.target === event.currentTarget) onReturned();
  };
  return (
    <div
      ref={ref}
      role="option"
      className={[
        "tracecards-deck-row",
        isDragging && "is-dragging",
        dropTarget && "is-drop-target",
        token && "is-near-pad",
        returned && "is-returned",
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        token
          ? ({
              "--tracecards-token-x": `${token.x}px`,
              "--tracecards-token-y": `${token.y}px`,
            } as CSSProperties)
          : undefined
      }
      data-deck={deck.name}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      onClick={() => onSelect(deck.name)}
      onContextMenu={(event) => onMenu(deck, event)}
      onAnimationEnd={returned ? onAnimationEnd : undefined}
    >
      <span className="tracecards-deck-row-label">
        <Icon name={deck.icon ?? ICONS.deck} />
        <span className="tracecards-deck-row-name">{deck.name}</span>
      </span>
      <span className="tracecards-deck-row-count">{deck.cards.length}</span>
    </div>
  );
}

interface DeckListPanelProps {
  store: Store<VaultSnapshot>;
  /** The deck the grid shows, by name. Null is the first deck. */
  selection: Store<string | null>;
  /** A card being dragged in the grid, and the deck it would be dropped on, or null. */
  cardDrop: Store<PadDrop | null>;
  /** Called as a deck dragged out of the list nears a deck pad, as `DeckList` says. */
  onDeckDropChange?: (drop: DeckDrop | null) => void;
  onSelect: (name: string) => void;
}

/**
 * The deck list for a sidebar, following the grid elsewhere in the app: it
 * highlights the deck the grid shows, and the deck a card dragged there would be dropped on.
 */
export function DeckListPanel({
  store,
  selection,
  cardDrop,
  onDeckDropChange,
  onSelect,
}: DeckListPanelProps) {
  const { folder, vault } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const selected = useSyncExternalStore(selection.subscribe, selection.getSnapshot);
  const drop = useSyncExternalStore(cardDrop.subscribe, cardDrop.getSnapshot);
  if (!vault) {
    return <p className="tracecards-message">The folder “{folder}” doesn’t exist yet.</p>;
  }
  return (
    <DeckList
      decks={vault.decks}
      selected={shownDeck(vault.decks, selected)?.name}
      onSelect={onSelect}
      cardDrop={drop}
      onDeckDropChange={onDeckDropChange}
    />
  );
}

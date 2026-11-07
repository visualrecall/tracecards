import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import type { Deck } from "@tracecards/core";
import {
  type AnimationEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { deckMenu, fillSlot, offPadDecks, PAD_SLOTS, padSlots, placeInSlot } from "./deckActions";
import { padMoveTarget } from "./deckMode";
import { type DragEndHandler, PLUGINS, SENSORS, SORT_TRANSITION } from "./dnd";
import { reorderMove } from "./gridNavigation";
import { useHost } from "./host";
import { Icon } from "./Icon";
import { ICONS } from "./icons";
import { PageIndicator } from "./PageIndicator";
import type { DeckDrop, PadDrop } from "./padDrop";
import type { Store } from "./store";
import { usePendingSlots } from "./usePendingSlots";

interface DeckPadProps {
  decks: Deck[];
  selected: string;
  onSelect: (name: string) => void;
  /** The page of the selected deck's cards that is showing, and how many there are. */
  page: number;
  pages: number;
  onPageChange: (page: number) => void;
  /** A card being dragged over the grid, near the pad, over a deck list or neither, or null. */
  cardDrop: PadDrop | null;
  /** A deck dragged out of a deck list, such as the Decks panel, or null. */
  deckDrop: Store<DeckDrop | null>;
}

/**
 * The deck pad: eight slots, four to a row, holding the decks the user has
 * attached, each in its own slot. An empty slot, shown as a "+" tile, attaches a deck that isn't
 * on the pad there or creates one there: a search dialog when there are decks to attach. "Detach
 * from pad" in a tile's menu empties its slot and keeps the deck; the other decks stay where they
 * are. The selected deck's tile shows which page of its cards is showing, and clicking it again
 * turns to the next page.
 *
 * Only the selected tile is in the tab order, and on it the screen's deck-mode keys apply (see
 * `GridScreen`). Alt with the arrow keys moves the selected deck. Clicking a tile doesn't take the
 * focus, so the keys stay in the mode they were in. Decks can be dragged to other
 * slots, empty ones too: the slots between slide along by one. Right-clicking a
 * tile shows the deck's menu. While a card is dragged near the
 * pad, the decks it can be dropped on brighten and the one it would go to glows.
 *
 * A deck dragged out of a deck list can be dropped in any slot but its own (`DeckList` does the
 * dragging and saving). The empty slots show their "+" once it leaves the list. Near the pad, the
 * slot it would go in is framed and grows, and the deck slides into it; a deck there slides out,
 * under a tag saying it will be replaced. Once dropped, the deck shows in its slot while it's
 * saved, and its tile pops.
 */
export function DeckPad({
  decks,
  selected,
  onSelect,
  page,
  pages,
  onPageChange,
  cardDrop,
  deckDrop: deckDropStore,
}: DeckPadProps) {
  const host = useHost();
  const padId = useId();
  const tabs = useRef<HTMLDivElement>(null);
  const [slots, move] = usePendingSlots(padSlots(decks), (updates) => host.updateDecks(updates));
  const emptyLabel = offPadDecks(decks).length > 0 ? "Attach or create a deck" : "New deck";
  // Set when the keyboard moves a deck: React moves its tile, which can lose focus.
  const refocus = useRef(false);

  // A deck dragged out of a deck list: whether it's near this pad, and the slot it's over or has
  // been dropped in.
  const deckDrop = useSyncExternalStore(deckDropStore.subscribe, deckDropStore.getSnapshot);
  const dragged = deckDrop ? decks.find((deck) => deck.name === deckDrop.deck) : undefined;
  const carried = deckDrop && !deckDrop.landing ? dragged : undefined;
  const here = deckDrop?.pad === padId ? deckDrop : null;
  const target = here && !here.landing ? here.slot : null;
  const landing = here?.landing ? here.slot : null;
  // The deck that has just landed, whose tile pops.
  const [landed, setLanded] = useState<string | null>(null);
  const [lastDrop, setLastDrop] = useState(deckDrop);
  if (deckDrop !== lastDrop) {
    setLastDrop(deckDrop);
    if (deckDrop?.landing && deckDrop.pad === padId) setLanded(deckDrop.deck);
  }

  const shown = dragged && landing !== null ? placeInSlot(slots, dragged, landing) : slots;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = reorderMove(event.nativeEvent);
    if (!step) return;
    event.preventDefault();
    const index = slots.findIndex((deck) => deck?.name === selected);
    if (index < 0) return;
    refocus.current = true;
    move(index, padMoveTarget(step, index, PAD_SLOTS));
  };

  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    tabs.current?.querySelector<HTMLElement>(`[data-deck="${CSS.escape(selected)}"]`)?.focus();
  }, [slots, selected]);

  const onDragEnd: DragEndHandler = (event) => {
    const { source } = event.operation;
    if (event.canceled || !isSortable(source)) return;
    move(source.initialIndex, source.index);
  };

  const activate = (deck: Deck) => {
    if (deck.name !== selected) onSelect(deck.name);
    else if (pages > 1) onPageChange((page + 1) % pages);
  };

  const onMenu = (deck: Deck, event: MouseEvent) => {
    event.preventDefault();
    const detached = (next: Deck | undefined) => {
      if (deck.name === selected && next) onSelect(next.name);
    };
    host.showMenu(deckMenu(host, decks, deck, detached), event.nativeEvent);
  };

  return (
    <DragDropProvider sensors={SENSORS} plugins={PLUGINS} onDragEnd={onDragEnd}>
      <div
        className={[
          "tracecards-deck-pad",
          cardDrop?.zone === "pad" && "is-card-drop",
          carried && "is-deck-drag",
          carried && here && "is-deck-drop",
        ]
          .filter(Boolean)
          .join(" ")}
        data-pad={padId}
      >
        <div
          ref={tabs}
          className="tracecards-deck-tabs"
          role="tablist"
          aria-label="Decks"
          onKeyDown={onKeyDown}
        >
          {shown.map((deck, index) =>
            deck ? (
              <DeckTile
                key={deck.name}
                deck={deck}
                index={index}
                selected={deck.name === selected}
                onActivate={activate}
                onMenu={onMenu}
                drop={
                  cardDrop?.zone !== "pad" || deck.name === selected
                    ? null
                    : deck.name === cardDrop.target
                      ? "target"
                      : "candidate"
                }
                incoming={carried?.name === deck.name ? undefined : carried}
                deckDrop={
                  carried?.name === deck.name ? "source" : target === index ? "target" : null
                }
                landed={deck.name === landed}
                onLanded={() => setLanded(null)}
                indicator={
                  deck.name === selected ? <PageIndicator page={page} pages={pages} /> : null
                }
              />
            ) : (
              <EmptySlot
                key={`empty:${index}`}
                index={index}
                label={emptyLabel}
                incoming={carried}
                deckTarget={target === index}
                onFill={() => void fillSlot(host, decks, index, onSelect)}
              />
            ),
          )}
        </div>
      </div>
    </DragDropProvider>
  );
}

/** A deck's icon and name on its tile, or on the tile it's dragged over (`incoming`). */
function DeckFace({ deck, incoming = false }: { deck: Deck; incoming?: boolean }) {
  return (
    <span
      className={incoming ? "tracecards-deck-face is-incoming" : "tracecards-deck-face"}
      aria-hidden={incoming || undefined}
    >
      <Icon name={deck.icon ?? ICONS.deck} />
      <span className="tracecards-deck-name">{deck.name}</span>
    </span>
  );
}

interface EmptySlotProps {
  index: number;
  label: string;
  /** A deck dragged out of a deck list, which shows faintly here when it's over this slot. */
  incoming: Deck | undefined;
  /** Whether that deck would be dropped here. */
  deckTarget: boolean;
  onFill: () => void;
}

/**
 * An empty slot, as a faint "+" tile that fills it. It can't be dragged, but a deck can be dragged
 * onto it. Its id has a `:`, which deck names can't, so it's never a deck's.
 */
function EmptySlot({ index, label, incoming, deckTarget, onFill }: EmptySlotProps) {
  const { ref } = useSortable({
    id: `empty:${index}`,
    index,
    transition: SORT_TRANSITION,
    disabled: { draggable: true },
  });
  return (
    <button
      ref={ref}
      type="button"
      className={
        deckTarget
          ? "tracecards-deck-tile is-empty is-deck-target"
          : "tracecards-deck-tile is-empty"
      }
      data-slot={index}
      aria-label={label}
      // Like the deck tiles, a click doesn't take the focus, so the keys keep their mode and the
      // tile goes back to faint once the dialog closes.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onFill}
    >
      <span className="tracecards-deck-faces">
        <span className="tracecards-deck-face">
          <Icon name={ICONS.add} />
        </span>
        {incoming && <DeckFace deck={incoming} incoming />}
      </span>
    </button>
  );
}

interface DeckTileProps {
  deck: Deck;
  index: number;
  selected: boolean;
  /** Clicked: selects the deck, or turns the page when it's already selected. */
  onActivate: (deck: Deck) => void;
  /** The page indicator, on the selected tile. */
  indicator: ReactNode;
  onMenu: (deck: Deck, event: MouseEvent) => void;
  /** While a card is dragged near the pad: whether it can be dropped here, or would be. */
  drop: "candidate" | "target" | null;
  /** Another deck dragged out of a deck list, which slides in here when it's over this slot. */
  incoming: Deck | undefined;
  /** While a deck is dragged out of a deck list: whether it's this one, or would replace it. */
  deckDrop: "source" | "target" | null;
  /** Whether the deck has just been dropped here from a deck list, so its tile pops. */
  landed: boolean;
  onLanded: () => void;
}

function DeckTile({
  deck,
  index,
  selected,
  onActivate,
  onMenu,
  indicator,
  drop,
  incoming,
  deckDrop,
  landed,
  onLanded,
}: DeckTileProps) {
  const { ref, isDragging } = useSortable({ id: deck.name, index, transition: SORT_TRANSITION });
  const { name } = deck;

  const onAnimationEnd = (event: AnimationEvent) => {
    if (event.target === event.currentTarget) onLanded();
  };

  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      className={[
        "tracecards-deck-tile",
        isDragging && "is-dragging",
        drop && `is-drop-${drop}`,
        deckDrop && `is-deck-${deckDrop}`,
        landed && "is-landed",
      ]
        .filter(Boolean)
        .join(" ")}
      data-deck={name}
      data-slot={index}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onActivate(deck)}
      onContextMenu={(event) => onMenu(deck, event)}
      onAnimationEnd={landed ? onAnimationEnd : undefined}
    >
      <span className="tracecards-deck-faces">
        <DeckFace deck={deck} />
        {incoming && <DeckFace deck={incoming} incoming />}
      </span>
      {indicator}
      {deckDrop === "target" && (
        <span className="tracecards-deck-tag" aria-hidden="true">
          Replaces <b>{name}</b>
        </span>
      )}
    </button>
  );
}

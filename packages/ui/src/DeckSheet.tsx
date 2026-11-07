import type { Deck } from "@tracecards/core";
import type { MouseEvent } from "react";
import { deckMenu, fillSlot, newDeck, offPadDecks, padSlots } from "./deckActions";
import { useHost } from "./host";
import { Icon } from "./Icon";
import { ICONS } from "./icons";

interface DeckSheetProps {
  decks: readonly Deck[];
  /** The deck showing, which is highlighted. */
  selected: string;
  onSelect: (name: string) => void;
  /** Closes the sheet. */
  close: () => void;
}

/**
 * Every deck, in the sheet the deck button opens on phones: the pad's eight slots, with their
 * names, then the decks off the pad, then a new deck. Tapping a deck shows it; an empty slot takes
 * a deck, as on the pad; a long press shows a deck's menu.
 */
export function DeckSheet({ decks, selected, onSelect, close }: DeckSheetProps) {
  const host = useHost();
  const slots = padSlots(decks);
  const off = offPadDecks(decks);

  const choose = (name: string) => {
    close();
    onSelect(name);
  };

  const menu = (deck: Deck) => (event: MouseEvent) => {
    event.preventDefault();
    close();
    host.showMenu(deckMenu(host, decks, deck), event.nativeEvent);
  };

  return (
    <div className="tracecards-deck-sheet">
      <h3 className="tracecards-phone-section">On the pad</h3>
      <div className="tracecards-deck-sheet-pad">
        {slots.map((deck, slot) =>
          deck ? (
            <button
              key={deck.name}
              type="button"
              className="tracecards-deck-sheet-tile"
              aria-current={deck.name === selected ? "true" : undefined}
              onClick={() => choose(deck.name)}
              onContextMenu={menu(deck)}
            >
              <Icon name={deck.icon ?? ICONS.deck} />
              <span className="tracecards-deck-sheet-name">{deck.name}</span>
            </button>
          ) : (
            <button
              key={`slot-${slot}`}
              type="button"
              className="tracecards-deck-sheet-tile is-empty"
              aria-label="Put a deck here"
              onClick={() => {
                close();
                void fillSlot(host, decks, slot, onSelect);
              }}
            >
              <Icon name={ICONS.add} />
            </button>
          ),
        )}
      </div>
      {off.length > 0 && <h3 className="tracecards-phone-section">Other decks</h3>}
      <div className="tracecards-deck-sheet-rows">
        {off.map((deck) => (
          <button
            key={deck.name}
            type="button"
            className="tracecards-deck-sheet-row"
            aria-current={deck.name === selected ? "true" : undefined}
            onClick={() => choose(deck.name)}
            onContextMenu={menu(deck)}
          >
            <Icon name={deck.icon ?? ICONS.deck} />
            <span className="tracecards-deck-sheet-name">{deck.name}</span>
            <span className="tracecards-deck-sheet-count">{deck.cards.length}</span>
          </button>
        ))}
        <button
          type="button"
          className="tracecards-deck-sheet-row is-new"
          onClick={() => {
            close();
            void newDeck(host, decks).then((name) => {
              if (name) onSelect(name);
            });
          }}
        >
          <Icon name={ICONS.add} />
          <span className="tracecards-deck-sheet-name">New deck…</span>
        </button>
      </div>
    </div>
  );
}

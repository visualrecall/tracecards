import type { Deck } from "@tracecards/core";
import { useEffectEvent, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { ICONS } from "./icons";

/**
 * A deck's pill flying, when a deck from a deck list is dropped on the deck pad: into the slot it
 * goes to, or a deck it replaced back to its row (see `padDrop.ts`).
 */
export interface TokenFlight {
  deck: Deck;
  frames: Keyframe[];
  duration: number;
  easing: string;
  /** Where it's drawn: the document's body, so the app's panes don't clip it. */
  container: HTMLElement;
}

interface DeckTokenProps {
  flight: TokenFlight;
  /** "is-carried" for the deck that was dragged, in the accent colour. */
  variant?: "is-carried";
  onDone: (flight: TokenFlight) => void;
}

/** A deck's pill, its icon and name, flying across the app, drawn in the document's body. */
export function DeckToken({ flight, variant, onDone }: DeckTokenProps) {
  const element = useRef<HTMLDivElement>(null);
  const done = useEffectEvent(() => onDone(flight));
  // Before the token is first drawn, so it doesn't show at the top left for a moment.
  useLayoutEffect(() => {
    const { frames, duration, easing } = flight;
    const animation = element.current?.animate(frames, { duration, easing, fill: "forwards" });
    animation?.addEventListener("finish", done);
    return () => animation?.cancel();
  }, [flight]);
  return createPortal(
    <div
      ref={element}
      className={variant ? `tracecards-deck-token ${variant}` : "tracecards-deck-token"}
      aria-hidden="true"
    >
      <Icon name={flight.deck.icon ?? ICONS.deck} />
      <span className="tracecards-deck-token-name">{flight.deck.name}</span>
    </div>,
    flight.container,
  );
}

/** Whether the user has asked for less motion, in which case decks don't fly. */
export function prefersLessMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

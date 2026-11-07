import type { Card } from "@tracecards/core";
import type { ReactNode } from "react";
import { Cover } from "./Cover";
import { useShownTitle } from "./titleCase";

interface CardFaceProps {
  card: Card;
  /** Shown instead of the card's own cover, as the card form does. */
  cover?: ReactNode;
  /** Shown instead of the card's title and description, as the opened card does. */
  text?: ReactNode;
}

/**
 * The front of a card: cover, title and description, laid out like a playing card. Its size
 * comes from `--tracecards-card-width`, and everything in it scales with that width.
 */
export function CardFace({ card, cover, text }: CardFaceProps) {
  const title = useShownTitle(card.title);
  return (
    <div className="tracecards-card-face">
      {cover ?? <Cover card={card} />}
      <div className="tracecards-card-text">
        {text ?? (
          <>
            <div className="tracecards-card-title">{title}</div>
            {card.description && (
              <div className="tracecards-card-description">{card.description}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

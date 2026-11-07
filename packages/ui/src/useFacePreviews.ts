import type { Card } from "@tracecards/core";
import { useEffect, useRef, useState } from "react";
import { FACE_THEMES, type FaceTheme, useHost } from "./host";
import { facePreview } from "./printRender";

/**
 * Small pictures of the cards' fronts, drawn as they'll print, in `theme`: an object URL for each
 * card once it's drawn, undefined until then. Each card is drawn in both themes at once, so
 * switching between them shows the other straight away.
 */
export function useFacePreviews(cards: readonly Card[], theme: FaceTheme): (string | undefined)[] {
  const { printing } = useHost();
  const [drawn, setDrawn] = useState<ReadonlyMap<string, string>>(() => new Map());
  // Every URL made, to revoke them all when the dialog closes, and to skip cards already drawn.
  const made = useRef(new Map<string, string>());
  const closed = useRef(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      for (const card of cards) {
        if (FACE_THEMES.every((each) => made.current.has(key(card, each)))) continue;
        const cover = await printing.coverBitmap(card);
        try {
          if (!live) return;
          for (const each of FACE_THEMES) {
            const url = await facePreview(card, cover, each);
            // Drawn meanwhile, by the run this one replaced, or not wanted now the dialog's closed.
            if (closed.current || made.current.has(key(card, each))) URL.revokeObjectURL(url);
            else made.current.set(key(card, each), url);
          }
        } finally {
          cover?.close();
        }
        if (live) setDrawn(new Map(made.current));
      }
    })();
    return () => {
      live = false;
    };
  }, [cards, printing]);

  useEffect(() => {
    const urls = made.current;
    closed.current = false;
    return () => {
      closed.current = true;
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  return cards.map((card) => drawn.get(key(card, theme)));
}

const key = (card: Card, theme: FaceTheme) => `${theme}\n${card.path}`;

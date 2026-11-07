/**
 * A card's shape and full size, in CSS pixels: a bridge playing card, 2¼ × 3½ inches at 100
 * pixels to the inch. Everything that sizes cards follows it: the styles,
 * through the variables `cardSizeVariables` gives, and cards on Obsidian's canvases.
 */
export const CARD_SIZE = { width: 225, height: 350 } as const;

/**
 * The size of a card's text at the card's full size, about 15.1px. It scales with the card.
 * That's 16px for every 370 pixels of a card's height, at a height of 350.
 */
export const CARD_TEXT_SIZE = (16 * CARD_SIZE.height) / 370;

/**
 * The text size, the `em` the face's text is set in, for a face `width` wide: the same share of
 * the width at every size. The print images are drawn with it, so a printed card sets its text as
 * the screen does.
 */
export function faceEm(width: number): number {
  return (width * CARD_TEXT_SIZE) / CARD_SIZE.width;
}

/**
 * How the face sets its title and description, as the card styles (`.tracecards-card-text`,
 * `-title` and `-description`) have them, which a test keeps the same. Sizes and spacing are in em
 * of the face's text size, except the description's `gap` and `fade`, which are in em of the
 * description's own size, as in the styles.
 */
export const FACE_TEXT = {
  /** The padding round the text. */
  padding: { top: 0.625, side: 0.8, bottom: 0.8 },
  title: { size: 1.1, lineHeight: 1.2, maxLines: 3 },
  /** Fills what the title leaves and fades out where it's cut off. */
  description: { size: 0.85, lineHeight: 1.4, gap: 0.45, fade: 1.4 },
} as const;

/**
 * The CSS variables the styles size cards by, for the app to set on each window's body:
 * `--tracecards-card-ratio` (width over height), `--tracecards-card-max-width`, the full width,
 * and `--tracecards-card-text-scale`, the text size over the width. `--tracecards-card-width`,
 * which each screen sets to the width its cards get, starts at the full width.
 */
export function cardSizeVariables(): Record<string, string> {
  const { width, height } = CARD_SIZE;
  return {
    "--tracecards-card-ratio": String(width / height),
    "--tracecards-card-max-width": `${width}px`,
    "--tracecards-card-width": `${width}px`,
    "--tracecards-card-text-scale": String(CARD_TEXT_SIZE / width),
  };
}

/**
 * The face's font family, as the styles set it: Inter, bundled with the styles, then the system's
 * fonts for what Inter doesn't have. The print images are drawn in it too.
 */
export const FACE_FONT =
  '"Tracecards Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** The weights the face sets its title and description in. */
export const FACE_WEIGHTS = { title: 600, description: 400 } as const;

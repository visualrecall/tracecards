export type GridMove = "left" | "right" | "up" | "down" | "first" | "last";

const KEYS: Record<string, GridMove> = {
  ArrowLeft: "left",
  h: "left",
  ArrowRight: "right",
  l: "right",
  ArrowUp: "up",
  k: "up",
  ArrowDown: "down",
  j: "down",
  Home: "first",
  End: "last",
};

/** The move a key press asks for: arrow keys, h j k l, Home or End, without modifier keys. */
export function gridMove(event: KeyboardEvent): GridMove | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  return KEYS[event.key] ?? null;
}

const ARROWS: Record<string, GridMove> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

/**
 * The move Alt with an arrow key asks for, which moves the focused item itself. Only arrows:
 * on a Mac, Option turns h j k l into other characters.
 */
export function reorderMove(event: KeyboardEvent): GridMove | null {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  return ARROWS[event.key] ?? null;
}

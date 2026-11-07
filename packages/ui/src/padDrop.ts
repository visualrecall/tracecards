// Dropping a card on a deck's tile in the pad: a card dragged near the pad shrinks,
// the decks it can go to brighten, and the nearest one lights up as the target.

/** How close to the pad the pointer has to come, and for how long, before the card shrinks. */
export const NEAR_PAD_PX = 15;
export const NEAR_PAD_DWELL_MS = 50;
/** How close to a tile's centre the pointer has to be for the tile to be the target. */
export const TILE_REACH_PX = 50;
/** The size of a card near the pad, and of the proxy that flies into the tile. */
export const SHRUNK_SCALE = 0.2;

export interface Point {
  x: number;
  y: number;
}

/** Where a dragged card can be dropped on a deck: near the deck pad, or over a deck list. */
export type DropZone = "pad" | "list";

/** Where a card dragged over the grid stands with the pad and the deck lists. */
export interface PadDrop {
  /** The pad or deck list the card is at, and so shrunk, or null. Only that one lights up. */
  zone: DropZone | null;
  /** The deck it would go to if dropped now. */
  target: string | null;
}

type Rect = Pick<DOMRect, "left" | "top" | "right" | "bottom">;

/** Whether `point` is inside `rect` or within `margin` of it. */
export function isNear(rect: Rect, point: Point, margin = NEAR_PAD_PX): boolean {
  return (
    point.x >= rect.left - margin &&
    point.x <= rect.right + margin &&
    point.y >= rect.top - margin &&
    point.y <= rect.bottom + margin
  );
}

/** The tile whose centre is nearest `point`, if it's within `reach`. */
export function nearestTile<T extends { rect: Rect }>(
  tiles: readonly T[],
  point: Point,
  reach = TILE_REACH_PX,
): T | undefined {
  let nearest: T | undefined;
  let nearestDistance = reach;
  for (const tile of tiles) {
    const { x, y } = centre(tile.rect);
    const distance = Math.hypot(point.x - x, point.y - y);
    if (distance <= nearestDistance) {
      nearest = tile;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/** A small card-coloured block flying into a tile while the card leaves. */
export interface Flight {
  /** Where it starts, centred on the pointer, as a fifth of the card's size. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** How far it goes, to the tile's centre, where it shrinks away. */
  by: Point;
}

export const FLIGHT_MS = 350;

/** The flight from `from`, for a card of `cardSize`, into the tile at `tile`. */
export function flightInto(tile: Rect, from: Point, cardSize: Point): Flight {
  const to = centre(tile);
  const width = cardSize.x * SHRUNK_SCALE;
  const height = cardSize.y * SHRUNK_SCALE;
  return {
    left: from.x - width / 2,
    top: from.y - height / 2,
    width,
    height,
    by: { x: to.x - from.x, y: to.y - from.y },
  };
}

// Dropping a deck from a deck list, such as the Decks panel, in a slot of the pad. Near the pad,
// the deck's row shrinks into a pill of its icon and name beside the pointer, so the slots stay in
// view. The slot it's over is framed, with the deck sliding in and the deck there, if any, sliding
// out. On the drop, the pill is drawn into the slot, and a deck taken off the pad flies back to its
// row.

/**
 * A deck dragged from a deck list toward a deck pad, which shows where it would go. The deck
 * list is in another part of the app, such as a sidebar, so the two share this.
 */
export interface DeckDrop {
  /** The deck's name. */
  deck: string;
  /** The pad it's near, by the pad's `data-pad`, or null. */
  pad: string | null;
  /** The slot of that pad it would go in (from 0), or null. */
  slot: number | null;
  /** Set once it's dropped there, while its slot is saved: the pad shows it in the slot. */
  landing: boolean;
}

/** How far right of the pointer and below it the pill a dragged deck becomes near the pad starts. */
export const TOKEN_OFFSET = 14;
/** How long the pill takes to be drawn into the slot, and a deck taken off to fly back. */
export const TOKEN_LAND_MS = 240;
export const TOKEN_RETURN_MS = 650;
/**
 * How far the flight back to the deck list bends upward: its curve's control point is this far
 * above the higher of its two ends.
 */
const ARC_RISE_PX = 90;
/**
 * How far from a slot's edge the pointer can be for a deck to go in it: across the gaps between
 * slots, and as far out of the pad as counts as near it (`NEAR_PAD_PX` and the pad's padding).
 */
const SLOT_REACH_PX = 20;

/**
 * The slot a deck dragged to `point` would go in: the one under the pointer, or else the one
 * whose edge is nearest, within reach, so crossing a gap between slots keeps one framed. Never
 * the deck's own slot, where dropping changes nothing.
 */
export function slotAt<T extends { rect: Rect; deck: string | undefined }>(
  slots: readonly T[],
  point: Point,
  deck: string,
): T | undefined {
  let nearest: T | undefined;
  let nearestDistance = SLOT_REACH_PX;
  for (const slot of slots) {
    const distance = distanceTo(slot.rect, point);
    // Ties, as in a gap between two slots or where a grown slot overlaps another, go to the first.
    if (distance < nearestDistance || (nearest === undefined && distance === nearestDistance)) {
      nearest = slot;
      nearestDistance = distance;
    }
  }
  return nearest?.deck === deck ? undefined : nearest;
}

/** How far `point` is from `rect`: 0 inside it. */
function distanceTo(rect: Rect, point: Point): number {
  const x = Math.max(rect.left - point.x, 0, point.x - rect.right);
  const y = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
  return Math.hypot(x, y);
}

/**
 * How far the label of a deck's row (its icon and name) moves to become the pill, for a row
 * grabbed at `grab` from its top left corner, whose label starts at `label` from there too.
 */
export function tokenShift(grab: Point, label: Point): Point {
  return { x: grab.x + TOKEN_OFFSET - label.x, y: grab.y + TOKEN_OFFSET - label.y };
}

/**
 * The pill, of `size`, beside the pointer at `point`, drawn into the slot at `slot`. Like
 * `returnKeyframes`, the keyframes place the pill's centre, for a pill at the top left corner of
 * the window.
 */
export function landingKeyframes(point: Point, size: Point, slot: Rect): Keyframe[] {
  const from = { x: point.x + TOKEN_OFFSET + size.x / 2, y: point.y + TOKEN_OFFSET + size.y / 2 };
  return [
    { transform: centredAt(from) },
    { transform: `${centredAt(centre(slot))} scale(0)`, opacity: 0.6 },
  ];
}

/**
 * A deck taken off the pad, as a pill, flying from the slot at `slot` back to its row's label at
 * `label`, in an arc. It grows as it leaves the slot, shrinks a little on the way and fades as it
 * reaches the row.
 */
export function returnKeyframes(slot: Rect, label: Rect, steps = 20): Keyframe[] {
  const from = centre(slot);
  const to = centre(label);
  const control = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - ARC_RISE_PX };
  return Array.from({ length: steps + 1 }, (_, step) => {
    const k = step / steps;
    const x = (1 - k) ** 2 * from.x + 2 * (1 - k) * k * control.x + k ** 2 * to.x;
    const y = (1 - k) ** 2 * from.y + 2 * (1 - k) * k * control.y + k ** 2 * to.y;
    const scale = k < 0.15 ? 0.5 + (k / 0.15) * 0.5 : 1 - ((k - 0.15) / 0.85) * 0.35;
    const opacity = k < 0.1 ? k / 0.1 : k > 0.88 ? 1 - ((k - 0.88) / 0.12) * 0.7 : 1;
    return { transform: `${centredAt({ x, y })} scale(${scale})`, opacity };
  });
}

/** A transform that puts the centre of an element at the window's top left corner at `point`. */
function centredAt({ x, y }: Point): string {
  return `translate(${x}px, ${y}px) translate(-50%, -50%)`;
}

function centre(rect: Rect): Point {
  return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
}

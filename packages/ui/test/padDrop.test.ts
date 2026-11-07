import { describe, expect, it } from "vitest";
import {
  flightInto,
  isNear,
  landingKeyframes,
  nearestTile,
  returnKeyframes,
  slotAt,
  TOKEN_OFFSET,
  tokenShift,
} from "../src/padDrop";

const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

describe("isNear", () => {
  const pad = rect(100, 100, 200, 100);

  it("counts points inside the pad and within 15px of it", () => {
    expect(isNear(pad, { x: 150, y: 150 })).toBe(true);
    expect(isNear(pad, { x: 85, y: 150 })).toBe(true);
    expect(isNear(pad, { x: 150, y: 215 })).toBe(true);
  });

  it("doesn't count points further away", () => {
    expect(isNear(pad, { x: 84, y: 150 })).toBe(false);
    expect(isNear(pad, { x: 150, y: 216 })).toBe(false);
  });
});

describe("nearestTile", () => {
  const tiles = [
    { name: "a", rect: rect(0, 0, 100, 100) },
    { name: "b", rect: rect(110, 0, 100, 100) },
  ];

  it("picks the tile whose centre is nearest", () => {
    expect(nearestTile(tiles, { x: 100, y: 50 })?.name).toBe("a");
    expect(nearestTile(tiles, { x: 120, y: 50 })?.name).toBe("b");
  });

  it("picks none when no centre is within 50px", () => {
    expect(nearestTile(tiles, { x: 50, y: 101 })).toBeUndefined();
    expect(nearestTile(tiles, { x: 50, y: 100 })?.name).toBe("a");
  });
});

describe("flightInto", () => {
  it("starts a fifth of the card's size around the pointer and goes to the tile's centre", () => {
    expect(flightInto(rect(200, 100, 100, 100), { x: 100, y: 100 }, { x: 225, y: 350 })).toEqual({
      left: 77.5,
      top: 65,
      width: 45,
      height: 70,
      by: { x: 150, y: 50 },
    });
  });
});

describe("slotAt", () => {
  // Two slots of 100 by 140, 4px apart: an empty one, and one holding deck "B".
  const slots = [
    { slot: 0, deck: undefined, rect: rect(0, 0, 100, 140) },
    { slot: 1, deck: "B", rect: rect(104, 0, 100, 140) },
  ];

  it("picks the slot under the pointer, even far from its centre", () => {
    expect(slotAt(slots, { x: 5, y: 135 }, "A")?.slot).toBe(0);
    expect(slotAt(slots, { x: 110, y: 5 }, "A")?.slot).toBe(1);
  });

  it("picks the slot whose edge is nearest when the pointer is between or beside them", () => {
    expect(slotAt(slots, { x: 102, y: 70 }, "A")?.slot).toBe(0);
    expect(slotAt(slots, { x: 103, y: 70 }, "A")?.slot).toBe(1);
    expect(slotAt(slots, { x: 50, y: 160 }, "A")?.slot).toBe(0);
  });

  it("picks none further than 20px from every slot", () => {
    expect(slotAt(slots, { x: 50, y: 161 }, "A")).toBeUndefined();
  });

  it("never picks the deck's own slot", () => {
    expect(slotAt(slots, { x: 150, y: 70 }, "B")).toBeUndefined();
  });
});

describe("the deck's pill", () => {
  /** Where a keyframe puts the pill's centre. */
  const centreOf = (frame: Keyframe | undefined) => {
    const [, x, y] =
      /^translate\((.+?)px, (.+?)px\) translate\(-50%, -50%\)/.exec(String(frame?.transform)) ?? [];
    return { x: Number(x), y: Number(y) };
  };

  it("moves the row's label to beside the pointer", () => {
    expect(tokenShift({ x: 100, y: 10 }, { x: 8, y: 4 })).toEqual({
      x: 100 + TOKEN_OFFSET - 8,
      y: 10 + TOKEN_OFFSET - 4,
    });
  });

  it("is drawn from beside the pointer into the slot's centre", () => {
    const frames = landingKeyframes({ x: 10, y: 20 }, { x: 120, y: 26 }, rect(100, 100, 100, 140));
    expect(centreOf(frames[0])).toEqual({ x: 10 + TOKEN_OFFSET + 60, y: 20 + TOKEN_OFFSET + 13 });
    expect(centreOf(frames.at(-1))).toEqual({ x: 150, y: 170 });
    expect(String(frames.at(-1)?.transform)).toMatch(/scale\(0\)$/);
  });

  it("flies back from the slot to the row, bending upward", () => {
    const frames = returnKeyframes(rect(500, 400, 100, 140), rect(20, 100, 120, 16));
    expect(centreOf(frames[0])).toEqual({ x: 550, y: 470 });
    expect(centreOf(frames.at(-1))).toEqual({ x: 80, y: 108 });
    // Halfway, it's above the straight line between the two.
    expect(centreOf(frames[10]).y).toBeLessThan((470 + 108) / 2);
  });
});

import { describe, expect, it } from "vitest";
import { cardMoveTarget, pageCount, pageOf, WheelPager } from "../src/paging";

describe("pages", () => {
  it("holds six cards each", () => {
    expect([0, 1, 6, 7, 12, 13].map(pageCount)).toEqual([1, 1, 1, 2, 2, 3]);
    expect([0, 5, 6, 11, 12].map(pageOf)).toEqual([0, 0, 1, 1, 2]);
  });
});

describe("cardMoveTarget", () => {
  // A page's cards:   0 1 2 3
  //                   4 [pad] 5
  const from = (index: number, count: number) => (move: Parameters<typeof cardMoveTarget>[2]) =>
    cardMoveTarget(index, count, move);

  it("keeps left and right on the page", () => {
    expect(from(6, 14)("left")).toBe(6);
    expect(from(5, 14)("right")).toBe(5);
    expect(from(3, 14)("right")).toBe(4);
    expect(from(13, 14)("right")).toBe(13);
  });

  it("goes down around the pad, looking left first", () => {
    expect([0, 1, 2, 3].map((index) => from(index, 14)("down"))).toEqual([4, 4, 5, 5]);
    // A page of five cards has no card right of the pad.
    expect([1, 2, 3].map((index) => from(index, 5)("down"))).toEqual([4, 4, 3]);
  });

  it("goes down onto the next page in the same column, within its cards", () => {
    expect(from(4, 14)("down")).toBe(6);
    expect(from(5, 14)("down")).toBe(9);
    // The last page has two cards.
    expect(from(11, 14)("down")).toBe(13);
  });

  it("goes up onto the previous page's second row", () => {
    expect([6, 7, 8, 9].map((index) => from(index, 14)("up"))).toEqual([4, 4, 5, 5]);
    expect(from(10, 14)("up")).toBe(6);
    expect(from(11, 14)("up")).toBe(9);
  });

  it("stays at the deck's ends", () => {
    expect(from(1, 14)("up")).toBe(1);
    expect(from(13, 14)("down")).toBe(13);
    expect(from(2, 4)("down")).toBe(2);
  });

  it("turns pages with Page Up and Page Down", () => {
    expect(from(1, 14)("nextPage")).toBe(7);
    expect(from(11, 14)("nextPage")).toBe(13);
    expect(from(13, 14)("nextPage")).toBe(13);
    expect(from(7, 14)("previousPage")).toBe(1);
    expect(from(1, 14)("previousPage")).toBe(1);
  });
});

describe("WheelPager", () => {
  /** The turns for wheel events given as [deltaY, time] pairs. */
  const turns = (events: [number, number][]) => {
    const pager = new WheelPager();
    return events.map(([deltaY, time]) => pager.turn(deltaY, time));
  };

  it("turns on the first event, then ignores events for 200ms", () => {
    expect(
      turns([
        [100, 0],
        [100, 50],
        [100, 199],
        [100, 200],
        [-100, 300],
        [-100, 450],
      ]),
    ).toEqual([1, 0, 0, 1, 0, -1]);
  });

  it("turns every 200ms during a long trackpad swipe", () => {
    const swipe: [number, number][] = Array.from({ length: 60 }, (_, i) => [40 - i / 2, i * 16]);
    expect(turns(swipe).filter((turn) => turn !== 0)).toEqual([1, 1, 1, 1, 1]);
  });
});

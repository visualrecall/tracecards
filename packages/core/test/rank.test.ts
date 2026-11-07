import { describe, expect, it } from "vitest";
import { planReorder, rankAtEnd } from "../src";

/** Items with these ranks, in display order. `undefined` is an item without a rank. */
const items = (...ranks: (number | undefined)[]) => ranks.map((rank) => ({ rank }));

describe("planReorder", () => {
  it.each([
    ["between ranked neighbours", items(1, 2, 3), 0, 1, [{ index: 0, rank: 2.5 }]],
    ["to the start", items(1, 2, 3), 2, 0, [{ index: 2, rank: 0 }]],
    ["to the end", items(1, 2, 3), 0, 2, [{ index: 0, rank: 4 }]],
    ["after a fractional rank", items(1, 2.5, 3), 0, 2, [{ index: 0, rank: 4 }]],
    ["before a fractional rank", items(0.5, 2), 1, 0, [{ index: 1, rank: 0 }]],
    ["into the ranked ones", items(1, 2, undefined, undefined), 3, 1, [{ index: 3, rank: 1.5 }]],
    ["right after the ranked ones", items(1, undefined, undefined), 2, 1, [{ index: 2, rank: 2 }]],
    [
      "first of unranked items",
      items(undefined, undefined, undefined),
      2,
      0,
      [{ index: 2, rank: 1 }],
    ],
  ])("writes one rank when moving %s", (_, list, from, to, writes) => {
    expect(planReorder(list, from, to)).toEqual(writes);
  });

  it("ranks the unranked items that end up before the moved one", () => {
    expect(planReorder(items(undefined, undefined, undefined, undefined), 0, 2)).toEqual([
      { index: 1, rank: 1 },
      { index: 2, rank: 2 },
      { index: 0, rank: 3 },
    ]);
    expect(planReorder(items(1, undefined, undefined), 1, 2)).toEqual([
      { index: 2, rank: 2 },
      { index: 1, rank: 3 },
    ]);
  });

  it.each([
    [1, 2, 1.5],
    [1, 1.5, 1.3],
    [1, 1.1, 1.05],
    [-1, 1, 0],
    [1, 5, 3],
    [0.123, 0.124, 0.1235],
  ])("picks the shortest number between %d and %d", (low, high, rank) => {
    expect(planReorder(items(low, high, 10), 2, 1)).toEqual([{ index: 2, rank }]);
  });

  it("renumbers when no number fits between the neighbours", () => {
    expect(planReorder(items(1, 1, 1), 2, 1)).toEqual([
      { index: 2, rank: 2 },
      { index: 1, rank: 3 },
    ]);
    expect(planReorder(items(1, 1.000000001, undefined), 2, 1)).toEqual([
      { index: 2, rank: 2 },
      { index: 1, rank: 3 },
    ]);
  });

  it("renumbers ranked items after the moved one too, but not unranked ones", () => {
    expect(planReorder(items(1, 1, 7, undefined, undefined), 3, 1)).toEqual([
      { index: 3, rank: 2 },
      { index: 1, rank: 3 },
      { index: 2, rank: 4 },
    ]);
  });

  it("writes nothing when the item stays or a position is out of range", () => {
    expect(planReorder(items(1, 2), 1, 1)).toEqual([]);
    expect(planReorder(items(1, 2), 0, 2)).toEqual([]);
    expect(planReorder(items(1, 2), -1, 0)).toEqual([]);
  });
});

describe("rankAtEnd", () => {
  it("gives the whole number after the last item's rank", () => {
    expect(rankAtEnd([{ rank: 1 }, { rank: 2.5 }])).toBe(3);
  });

  it("gives no rank when the last item has none, so the added item sorts among the unranked", () => {
    expect(rankAtEnd([{ rank: 1 }, {}])).toBeUndefined();
  });

  it("gives no rank in an empty deck", () => {
    expect(rankAtEnd([])).toBeUndefined();
  });
});

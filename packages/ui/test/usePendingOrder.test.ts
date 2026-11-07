import { describe, expect, it } from "vitest";
import { planMove } from "../src/usePendingOrder";

interface Item {
  name: string;
  rank?: number;
}

const key = (item: Item) => item.name;
const ranked = (...names: string[]): Item[] =>
  names.map((name, index) => ({ name, rank: index + 1 }));

describe("planMove", () => {
  it("plans one rank write for a move between ranked items", () => {
    const plan = planMove(ranked("a", "b", "c"), key, undefined, 2, 0);
    expect(plan?.order).toEqual(["c", "a", "b"]);
    expect(plan?.updates.map(({ item, rank }) => [item.name, rank])).toEqual([["c", 0]]);
  });

  it("plans a second move from the ranks the first saved, before the items have them", () => {
    const items = ranked("a", "b", "c");
    const first = planMove(items, key, undefined, 2, 0);
    // The vault hasn't been read again: the items still have their old ranks, shown in the new
    // order.
    const shown = ["c", "a", "b"].map((name) => items.find((item) => item.name === name)!);
    const second = planMove(shown, key, first?.ranks, 2, 1);
    expect(second?.order).toEqual(["c", "b", "a"]);
    // Between c (0, just saved) and a (1), not between c's old rank 3 and a.
    expect(second?.updates.map(({ item, rank }) => [item.name, rank])).toEqual([["b", 0.5]]);
    expect([...(second?.ranks ?? [])]).toEqual([
      ["c", 0],
      ["b", 0.5],
    ]);
  });

  it("plans nothing for a move onto the same place", () => {
    expect(planMove(ranked("a", "b"), key, undefined, 1, 1)).toBeNull();
  });
});

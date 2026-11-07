import { describe, expect, it } from "vitest";
import { rowMoveTarget } from "../src/cardRows";
import type { CardMove } from "../src/paging";

describe("rowMoveTarget", () => {
  // Ten cards in rows of four:  0 1 2 3
  //                             4 5 6 7
  //                             8 9
  const from = (index: number) => (move: CardMove) => rowMoveTarget(index, 10, 4, move);

  it("goes through the cards in order with left and right, across rows", () => {
    expect(from(3)("right")).toBe(4);
    expect(from(4)("left")).toBe(3);
    expect(from(0)("left")).toBe(0);
    expect(from(9)("right")).toBe(9);
  });

  it("goes up and down by row", () => {
    expect(from(1)("down")).toBe(5);
    expect(from(5)("up")).toBe(1);
    expect(from(2)("up")).toBe(2);
  });

  it("goes down onto the last card when the row below is shorter", () => {
    expect(from(6)("down")).toBe(9);
    expect(from(9)("down")).toBe(9);
  });

  it("moves two rows with Page Up and Page Down, stopping at the ends", () => {
    expect(from(1)("nextPage")).toBe(9);
    expect(from(0)("nextPage")).toBe(8);
    expect(from(5)("nextPage")).toBe(9);
    expect(from(9)("previousPage")).toBe(1);
    expect(from(5)("previousPage")).toBe(1);
  });

  it("goes to the ends with Home and End", () => {
    expect(from(5)("first")).toBe(0);
    expect(from(5)("last")).toBe(9);
  });

  it("works with one column", () => {
    expect(rowMoveTarget(1, 3, 1, "down")).toBe(2);
    expect(rowMoveTarget(1, 3, 1, "right")).toBe(2);
  });
});

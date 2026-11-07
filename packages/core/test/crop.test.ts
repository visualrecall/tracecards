import { describe, expect, it } from "vitest";
import { type CoverCrop, fitCrop } from "../src";

const COVER = 3 / 2;

describe("fitCrop", () => {
  it.each<[string, CoverCrop | undefined, number, number, CoverCrop]>([
    ["whole image that already fits", undefined, 300, 200, [0, 0, 1, 1]],
    ["whole wide image", undefined, 200, 100, [0.125, 0, 0.75, 1]],
    ["whole square image", undefined, 100, 100, [0, 1 / 6, 1, 2 / 3]],
    ["crop that already fits", [0.25, 0.25, 0.5, 1 / 3], 400, 400, [0.25, 0.25, 0.5, 1 / 3]],
    [
      "crop narrower than the frame",
      [0.1, 0, 0.8, 1],
      320,
      200,
      [0.1, 0.11 / 1.5, 0.8, 1.28 / 1.5],
    ],
    ["crop wider than the frame", [0, 0.25, 1, 0.25], 100, 100, [0.3125, 0.25, 0.375, 0.25]],
  ])("%s", (_name, crop, width, height, expected) => {
    const fitted = fitCrop(crop, width, height, COVER);
    fitted.forEach((value, index) => expect(value).toBeCloseTo(expected[index] ?? NaN, 10));
  });

  it("returns the crop when the image size is unknown", () => {
    const crop: CoverCrop = [0.1, 0.2, 0.3, 0.4];
    expect(fitCrop(crop, 0, 0, COVER)).toBe(crop);
    expect(fitCrop(undefined, Number.NaN, 100, COVER)).toEqual([0, 0, 1, 1]);
  });
});

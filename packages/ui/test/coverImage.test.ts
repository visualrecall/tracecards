import { describe, expect, it } from "vitest";
import { areaFromCrop, cropFromArea, scaledSize } from "../src/coverImage";

describe("scaledSize", () => {
  it("fits the longer side within the limit, keeping the shape", () => {
    expect(scaledSize(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(scaledSize(1000, 5000, 1600)).toEqual({ width: 320, height: 1600 });
  });

  it("never enlarges an image", () => {
    expect(scaledSize(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it("keeps at least one pixel on each side", () => {
    expect(scaledSize(100000, 10, 1600)).toEqual({ width: 1600, height: 1 });
  });
});

describe("cropFromArea", () => {
  it("turns percentages into fractions with four decimals", () => {
    expect(cropFromArea({ x: 12.345678, y: 0, width: 66.666666, height: 100 })).toEqual([
      0.1235, 0, 0.6667, 1,
    ]);
  });

  it("keeps values between 0 and 1", () => {
    expect(cropFromArea({ x: -0.0001, y: 100.2, width: 50, height: 50 })).toEqual([0, 1, 0.5, 0.5]);
  });

  it("goes back to percentages for the cropper", () => {
    expect(areaFromCrop([0.25, 0.1, 0.5, 0.75])).toEqual({ x: 25, y: 10, width: 50, height: 75 });
  });
});

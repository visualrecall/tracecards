import { describe, expect, it } from "vitest";
import { isNewerVersion, isVersion } from "../src";

describe("isNewerVersion", () => {
  it("compares each part as a number", () => {
    expect(isNewerVersion("0.10.0", "0.9.9")).toBe(true);
    expect(isNewerVersion("1.0.0", "0.99.99")).toBe(true);
    expect(isNewerVersion("0.7.1", "0.7.0")).toBe(true);
    expect(isNewerVersion("0.7.0", "0.7.1")).toBe(false);
  });

  it("isn't newer than itself", () => {
    expect(isNewerVersion("0.7.0", "0.7.0")).toBe(false);
  });

  it("treats a version as newer than something that isn't one", () => {
    expect(isNewerVersion("0.7.0", "")).toBe(true);
    expect(isNewerVersion("", "0.7.0")).toBe(false);
    expect(isNewerVersion("0.8.0-beta", "0.7.0")).toBe(false);
  });
});

describe("isVersion", () => {
  it("takes major.minor.patch only", () => {
    expect(isVersion("0.7.0")).toBe(true);
    expect(isVersion("v0.7.0")).toBe(false);
    expect(isVersion("0.7")).toBe(false);
    expect(isVersion(7)).toBe(false);
  });
});

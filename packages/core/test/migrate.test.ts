import { describe, expect, it } from "vitest";
import { migrate, type Migration } from "../src";

const STEPS: Record<number, Migration> = {
  2: ({ folder, ...rest }) => ({ ...rest, folders: [folder] }),
  3: (saved) => ({ ...saved, columns: 5 }),
  4: ({ columns, ...rest }) => ({ ...rest, gridColumns: columns }),
};

describe("migrate", () => {
  it("runs every step after the saved version, in order", () => {
    expect(migrate({ folder: "Cards" }, 1, 4, STEPS)).toEqual({
      saved: { folders: ["Cards"], gridColumns: 5 },
      version: 4,
    });
  });

  it("starts from the saved version", () => {
    expect(migrate({ folders: ["Cards"], columns: 3 }, 3, 4, STEPS)).toEqual({
      saved: { folders: ["Cards"], gridColumns: 3 },
      version: 4,
    });
  });

  it("leaves data at the current version as it is", () => {
    const saved = { folders: ["Cards"], gridColumns: 3 };
    expect(migrate(saved, 4, 4, STEPS)).toEqual({ saved, version: 4 });
  });

  it("leaves data from a newer release as it is", () => {
    const saved = { workspaces: [] };
    expect(migrate(saved, 6, 4, STEPS)).toEqual({ saved, version: 6 });
  });

  it("goes past versions without a step", () => {
    expect(migrate({ folder: "Cards" }, 1, 3, { 3: STEPS[3] as Migration })).toEqual({
      saved: { folder: "Cards", columns: 5 },
      version: 3,
    });
  });
});

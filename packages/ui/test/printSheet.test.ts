import { describe, expect, it } from "vitest";
import { buildSheets, defaultPaper, layoutSheets, sheetCount, textWidth } from "../src/printSheet";

const text = (bytes: Uint8Array) => Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");

describe("layoutSheets", () => {
  it("puts nine cards on a sheet, in the middle of the page", () => {
    const [first] = layoutSheets(9, "letter", false);
    expect(first?.slots.length).toBe(9);
    // Letter is 612 by 792 points; the grid is 540 by 756.
    expect(first?.slots[0]).toEqual({ card: 0, x: 63, y: 18 + 2 * 252 });
    expect(first?.slots[8]).toEqual({ card: 8, x: 63 + 2 * 162, y: 18 });
  });

  it("follows each sheet's fronts with its backs, mirrored to meet them", () => {
    const pages = layoutSheets(10, "a4", true);
    expect(pages.map((page) => `${page.side} ${page.sheet}`)).toEqual([
      "fronts 0",
      "backs 0",
      "fronts 1",
      "backs 1",
    ]);
    const front = pages[0]?.slots[0];
    const back = pages[1]?.slots[0];
    expect(back?.y).toBe(front?.y);
    expect(back?.x).toBeCloseTo((front?.x ?? 0) + 2 * 162);
    expect(pages[3]?.slots.map((slot) => slot.card)).toEqual([9]);
  });

  it("leaves the backs out when they're not wanted", () => {
    expect(layoutSheets(19, "letter", false).map((page) => page.side)).toEqual([
      "fronts",
      "fronts",
      "fronts",
    ]);
    expect(sheetCount(19)).toBe(3);
  });
});

describe("defaultPaper", () => {
  it("is Letter where Letter is usual, and A4 elsewhere", () => {
    expect(defaultPaper("en-US")).toBe("letter");
    expect(defaultPaper("en")).toBe("letter");
    expect(defaultPaper("es-MX")).toBe("letter");
    expect(defaultPaper("en-GB")).toBe("a4");
    expect(defaultPaper("de")).toBe("a4");
    expect(defaultPaper("not a locale")).toBe("a4");
  });
});

describe("buildSheets", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const job = {
    deckName: "Ideas",
    paper: "letter" as const,
    imageSize: { width: 750, height: 1050 },
  };

  it("draws the cut lines on the fronts, and not on the backs", () => {
    const file = text(buildSheets({ ...job, faces: [jpeg, jpeg], back: jpeg }));
    const contents = [...file.matchAll(/stream\n([\s\S]*?)\nendstream/g)]
      .map((match) => match[1] ?? "")
      .filter((content) => content.includes(" Do Q"));
    expect(contents.length).toBe(2);
    const [fronts, backs] = contents;
    expect(fronts).toContain("162 252 re S");
    expect(fronts).toContain('(") Tj');
    expect(backs).not.toContain("re S");
    expect(fronts).toContain("(Ideas \\267 sheet 1 of 1 \\267 fronts)");
    expect(backs).toContain("(Ideas \\267 sheet 1 of 1 \\267 backs)");
    expect(file).toContain("/Duplex /DuplexFlipLongEdge");
  });

  it("stores the back once however many cards it's on", () => {
    const file = text(buildSheets({ ...job, faces: [jpeg, jpeg, jpeg], back: jpeg }));
    expect(file.match(/\/Subtype \/Image/g)?.length).toBe(4);
  });

  it("prints fronts only without asking for both sides", () => {
    const file = text(buildSheets({ ...job, faces: [jpeg], back: null }));
    expect(file).toContain("/Count 1");
    expect(file).not.toContain("/Duplex");
    expect(file).toContain("(Ideas \\267 sheet 1 of 1)");
  });
});

describe("textWidth", () => {
  it("measures with Helvetica's widths", () => {
    // T is 611 and A is 667 thousandths.
    expect(textWidth("TA", 10)).toBeCloseTo(12.78);
    expect(textWidth("TA", 10, 1)).toBeCloseTo(14.78);
  });
});

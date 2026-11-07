import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_DESCRIPTION } from "../src/cardActions";
import {
  CARD_SIZE,
  cardSizeVariables,
  FACE_FONT,
  FACE_TEXT,
  FACE_WEIGHTS,
  faceEm,
} from "../src/cardSize";
import { COVER_ASPECT } from "../src/Cover";
import { PRINT_SIZE } from "../src/gamecrafter";
import { layoutFace, type MeasureAt, TRIM } from "../src/printRender";
import { CARD } from "../src/printSheet";

// What's printed must be the card as it is on the screen. The print images are drawn from
// `FACE_TEXT` and the card styles set the same text in CSS, so these tests keep the two the same.

// Read from disk: Vitest gives tests an empty string for a stylesheet, even with `?raw`.
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const withoutComments = styles.replace(/\/\*[\s\S]*?\*\//g, "");

/** The declarations of the style rule that has exactly this selector. */
function rule(selector: string): Record<string, string> {
  const escaped = selector.replace(/\./g, "\\.");
  const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(withoutComments);
  if (!match?.[1]) throw new Error(`styles.css has no rule for ${selector}`);
  const declarations: Record<string, string> = {};
  for (const declaration of match[1].split(";")) {
    const colon = declaration.indexOf(":");
    if (colon > 0)
      declarations[declaration.slice(0, colon).trim()] = declaration
        .slice(colon + 1)
        .replace(/\s+/g, " ")
        .trim();
  }
  return declarations;
}

/** `1.1em` as 1.1; anything else is a mismatch. */
function em(value: string | undefined): number {
  expect(value).toMatch(/^[\d.]+em$/);
  return parseFloat(value ?? "");
}

describe("the card styles and the print images", () => {
  it("pad the text the same", () => {
    const padding = rule(".tracecards-card-text").padding?.split(/\s+/).map(em);
    const { top, side, bottom } = FACE_TEXT.padding;
    expect(padding).toEqual([top, side, bottom]);
  });

  it("set the title the same", () => {
    const title = rule(".tracecards-card-title");
    expect(em(title["font-size"])).toBe(FACE_TEXT.title.size);
    expect(parseFloat(title["line-height"] ?? "")).toBe(FACE_TEXT.title.lineHeight);
    expect(parseInt(title["-webkit-line-clamp"] ?? "", 10)).toBe(FACE_TEXT.title.maxLines);
  });

  it("set the description the same", () => {
    const description = rule(".tracecards-card-description");
    expect(em(description["font-size"])).toBe(FACE_TEXT.description.size);
    expect(parseFloat(description["line-height"] ?? "")).toBe(FACE_TEXT.description.lineHeight);
    expect(em(description["margin-top"])).toBe(FACE_TEXT.description.gap);
    // It fades out over its last stretch, which the print images fade the same.
    expect(description["mask-image"]).toContain(`calc(100% - ${FACE_TEXT.description.fade}em)`);
    // Its line breaks show and its runs of spaces are one, as the print images set it.
    expect(description["white-space"]).toBe("pre-line");
  });

  it("size the text from the card's width alone, so it's the same share at any size", () => {
    const face = rule(".tracecards-card-face");
    expect(face["font-size"]).toBe(
      "calc(var(--tracecards-card-width) * var(--tracecards-card-text-scale))",
    );
    const scale = Number(cardSizeVariables()["--tracecards-card-text-scale"]);
    for (const width of [120, CARD_SIZE.width, 321, TRIM.width]) {
      expect(width * scale).toBeCloseTo(faceEm(width), 9);
    }
    expect(faceEm(TRIM.width) / TRIM.width).toBeCloseTo(
      faceEm(CARD_SIZE.width) / CARD_SIZE.width,
      12,
    );
  });

  it("set the text in the same font, which is bundled so it scales exactly", () => {
    expect(rule(".tracecards-card-face")["font-family"]).toBe(FACE_FONT);
    expect(parseInt(rule(".tracecards-card-title")["font-weight"] ?? "", 10)).toBe(
      FACE_WEIGHTS.title,
    );
    // Both weights are in the styles, from files that exist, or the face would fall back to a
    // system font, which doesn't scale with the card.
    for (const weight of Object.values(FACE_WEIGHTS)) {
      const face = new RegExp(
        `@font-face\\s*\\{[^}]*"Tracecards Inter"[^}]*font-weight:\\s*${weight}[^}]*url\\("\\./(fonts/[^"]+)"\\)`,
      ).exec(withoutComments);
      expect(face?.[1], `a font-face for weight ${weight}`).toBeDefined();
      expect(existsSync(new URL(`../src/${face?.[1]}`, import.meta.url))).toBe(true);
    }
  });

  it("print a card of the screen's shape and the Game Crafter size to match", () => {
    expect(TRIM.width / TRIM.height).toBeCloseTo(CARD_SIZE.width / CARD_SIZE.height, 12);
    expect(CARD.width / CARD.height).toBeCloseTo(CARD_SIZE.width / CARD_SIZE.height, 12);
    // The same bleed on every side of the trimmed card.
    expect((PRINT_SIZE.width - TRIM.width) / 2).toBe((PRINT_SIZE.height - TRIM.height) / 2);
    // The print dialog shows the back in the card's shape, so none of it is hidden.
    expect(rule(".tracecards-print-back-picture")["aspect-ratio"]).toBe(
      "var(--tracecards-card-ratio)",
    );
    expect(Number(cardSizeVariables()["--tracecards-card-ratio"])).toBeCloseTo(
      TRIM.width / TRIM.height,
      12,
    );
  });

  it("show the cover in the same shape", () => {
    expect(rule(".tracecards-cover")["aspect-ratio"]).toBe("3 / 2");
    expect(COVER_ASPECT).toBe(3 / 2);
  });
});

describe("layoutFace", () => {
  /** Every character is half the text size wide, whatever the size, so text scales exactly. */
  const linear: MeasureAt = (text, _part, size) => text.length * size * 0.5;
  const shape = (width: number) => ({
    width,
    height: (width * CARD_SIZE.height) / CARD_SIZE.width,
  });
  const card = {
    title: "Buy Assets, Not Liabilities",
    description:
      "Assets generate income (rental properties, stocks); liabilities drain money (luxury cars, unnecessary debt). Wealth grows by acquiring assets that fund your lifestyle.",
  };
  const texts = (lines: { text: string }[]) => lines.map((line) => line.text);

  it("breaks the text into the same lines at every card size", () => {
    const small = layoutFace(card, shape(120), linear);
    for (const width of [173, CARD_SIZE.width, 321, TRIM.width]) {
      const layout = layoutFace(card, shape(width), linear);
      expect(texts(layout.title.lines)).toEqual(texts(small.title.lines));
      expect(texts(layout.description.lines)).toEqual(texts(small.description.lines));
    }
  });

  it("puts everything in the same place as a share of the card at every size", () => {
    const small = layoutFace(card, shape(CARD_SIZE.width), linear);
    const large = layoutFace(card, shape(TRIM.width), linear);
    const factor = TRIM.width / CARD_SIZE.width;
    expect(large.description.box.top).toBeCloseTo(small.description.box.top * factor, 6);
    expect(large.description.box.bottom).toBeCloseTo(small.description.box.bottom * factor, 6);
    small.description.lines.forEach((line, index) => {
      expect(large.description.lines[index]?.top).toBeCloseTo(line.top * factor, 6);
    });
  });

  it("starts the title under the cover and the padding, and the description under the title", () => {
    const { width, height } = shape(CARD_SIZE.width);
    const layout = layoutFace(card, { width, height }, linear);
    const em = faceEm(width);
    const firstTop = width / COVER_ASPECT + FACE_TEXT.padding.top * em;
    expect(layout.title.lines[0]?.top).toBeCloseTo(firstTop, 9);
    const titleBottom = firstTop + layout.title.lines.length * layout.title.lineHeight;
    expect(layout.description.box.top).toBeCloseTo(
      titleBottom + FACE_TEXT.description.gap * layout.description.size,
      9,
    );
    expect(layout.description.box.bottom).toBeCloseTo(height - FACE_TEXT.padding.bottom * em, 9);
  });

  it("cuts a long title to three lines, the last ending in an ellipsis", () => {
    const long = { title: "word ".repeat(40).trim(), description: "" };
    const layout = layoutFace(long, shape(CARD_SIZE.width), linear);
    expect(layout.title.lines).toHaveLength(FACE_TEXT.title.maxLines);
    expect(layout.title.lines.at(-1)?.text.endsWith("…")).toBe(true);
  });

  it("lays out the description down to its box's end and no further", () => {
    const long = { title: "Title", description: "word ".repeat(400).trim() };
    const { description } = layoutFace(long, shape(CARD_SIZE.width), linear);
    const last = description.lines.at(-1);
    expect(last).toBeDefined();
    // The last line starts inside the box, the next would start past it.
    expect(last?.top).toBeLessThan(description.box.bottom);
    expect((last?.top ?? 0) + description.lineHeight).toBeGreaterThanOrEqual(
      description.box.bottom,
    );
  });

  it("leaves room for the longest description under a title of two lines", () => {
    // Ordinary text sets about 25 characters to a line after the waste at the ends of lines.
    const room = (title: string) => {
      const { description, title: set } = layoutFace(
        { title, description: "word" },
        shape(CARD_SIZE.width),
        linear,
      );
      const { box, lineHeight } = description;
      return { titleLines: set.lines.length, lines: (box.bottom - box.top) / lineHeight };
    };
    const oneLine = room("Compound");
    const twoLines = room("How compound interest builds long wealth");
    expect([oneLine.titleLines, twoLines.titleLines]).toEqual([1, 2]);
    expect(oneLine.lines).toBeGreaterThan(twoLines.lines);
    expect(MAX_DESCRIPTION / 25).toBeLessThanOrEqual(twoLines.lines);
  });

  it("has no description lines for a card without one", () => {
    expect(
      layoutFace({ title: "Title", description: undefined }, shape(225), linear).description.lines,
    ).toEqual([]);
  });
});

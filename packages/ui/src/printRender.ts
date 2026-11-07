import { type Card, type CoverCrop, fitCrop } from "@tracecards/core";
import { DEFAULT_BACK_WEBP } from "./defaultBack";
import { WORDMARK } from "./wordmark";
import { PRINT_SIZE } from "./gamecrafter";
import { COVER_ASPECT, placeholderLetter } from "./Cover";
import { CARD_SIZE, FACE_FONT, FACE_TEXT, FACE_WEIGHTS, faceEm } from "./cardSize";
import type { FaceTheme } from "./host";

// Drawing cards as print images, for Game Crafter and the PDF. A card is laid out as its face is
// on the screen (see `CardFace` and the card styles): a 3:2 cover across the top, then the title
// and the description, set in the same sizes, spacing and lines (`FACE_TEXT`, which a test keeps
// the same as the styles). Print has its own colours, dark or light as the user chooses, since the
// screen's follow Obsidian's theme.

/**
 * A bridge-size card's trimmed size, 2.25 × 3.5 inches at 300 pixels to the inch: the card on the
 * screen, at three times its size, so it's the same shape. The rest of `PRINT_SIZE` is bleed.
 */
export const TRIM = { width: CARD_SIZE.width * 3, height: CARD_SIZE.height * 3 } as const;

/** How far the picture runs past the trim line, on every side. */
const BLEED = (PRINT_SIZE.width - TRIM.width) / 2;

/**
 * The fronts' colours. Dark is a white title and grey description on dark
 * grey. Light is dark text on a warm white, which uses much less ink at home.
 */
export const FACE_COLOURS: Record<FaceTheme, { paper: string; title: string; text: string }> = {
  dark: { paper: "#2e2e2e", title: "#ffffff", text: "#969696" },
  light: { paper: "#fbfaf7", title: "#1c1c1e", text: "#5b5b60" },
};
/** The cover of a card without a picture: purple, from the top left, under the title's first letter. */
export const PLACEHOLDER = { from: "#7a63d8", to: "#5a46b0", letter: "#ffffff" };

export type Measure = (text: string) => number;

/** The characters a line may break between, in Chinese, Japanese and Korean. */
const CJK = /[぀-ヿ㐀-鿿豈-﫿가-힯]/;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * The pieces of a word that a line may break between, as a browser breaks it: after a hyphen
 * between letters ("state-of-the-art"), after an en or em dash, and between CJK characters.
 */
function breakPieces(word: string): string[] {
  const characters = Array.from(word);
  const pieces: string[] = [];
  let piece = "";
  characters.forEach((character, index) => {
    piece += character;
    const next = characters[index + 1];
    const previous = characters[index - 1];
    if (next === undefined) return;
    const afterHyphen =
      character === "-" &&
      previous !== undefined &&
      LETTER_OR_DIGIT.test(previous) &&
      LETTER_OR_DIGIT.test(next);
    if (afterHyphen || character === "–" || character === "—" || CJK.test(character)) {
      pieces.push(piece);
      piece = "";
    }
  });
  pieces.push(piece);
  return pieces;
}

/**
 * Breaks text into lines no wider than `width`: at spaces and where a browser would break inside a
 * word (`breakPieces`), and inside a word that doesn't fit a line by itself, as the card's
 * `overflow-wrap: anywhere` does. Line breaks in the text stay.
 */
export function wrapText(text: string, width: number, measure: Measure): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let first = true;
      for (const piece of breakPieces(word)) {
        // A word's first piece follows a space; its other pieces follow the one before.
        const joined = line ? `${line}${first ? " " : ""}${piece}` : piece;
        first = false;
        if (measure(joined) <= width) {
          line = joined;
          continue;
        }
        if (line) lines.push(line);
        line = "";
        let rest = piece;
        while (measure(rest) > width) {
          const take = fittingLength(rest, width, measure);
          lines.push(rest.slice(0, take));
          rest = rest.slice(take);
        }
        line = rest;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** How many characters of `word` fit in `width`, at least one, never splitting a surrogate pair. */
function fittingLength(word: string, width: number, measure: Measure): number {
  const characters = Array.from(word);
  let length = 0;
  let taken = 0;
  for (const character of characters) {
    if (taken > 0 && measure(word.slice(0, length + character.length)) > width) break;
    length += character.length;
    taken++;
  }
  return length;
}

/** The lines cut to `max`, with the last one ending in an ellipsis if some were left out. */
export function clampLines(
  lines: string[],
  max: number,
  width: number,
  measure: Measure,
): string[] {
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  kept[max - 1] = withEllipsis(kept[max - 1] ?? "", width, measure);
  return kept;
}

/** Text cut to fit `width`, ending in an ellipsis when it's cut. */
export function ellipsize(text: string, width: number, measure: Measure): string {
  return measure(text) <= width ? text : withEllipsis(text, width, measure);
}

/** Text ending in an ellipsis, cut as far as it has to be to fit `width`. */
function withEllipsis(text: string, width: number, measure: Measure): string {
  const characters = Array.from(text);
  const cut = () => characters.join("").trimEnd();
  while (characters.length > 0 && measure(`${cut()}…`) > width) characters.pop();
  return `${cut()}…`;
}

type Context = OffscreenCanvasRenderingContext2D;

function newCanvas(width: number, height: number): { canvas: OffscreenCanvas; context: Context } {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This device can't draw cards to print.");
  return { canvas, context };
}

/** A canvas for a card at its trimmed size, which is what the card looks like on the screen. */
function trimCanvas() {
  return newCanvas(TRIM.width, TRIM.height);
}

/**
 * Grows a card drawn at its trimmed size to the full sheet by mirroring its edges outwards into
 * the bleed, so what's printed is exactly what's on the screen and the cut,
 * which is never quite exact, shows more of the card's own edge rather than a blank margin.
 */
function withBleed(trim: OffscreenCanvas): OffscreenCanvas {
  // The bleed is 75 pixels in all: 37 on the left and top, and 38 on the right and bottom.
  const left = Math.floor(BLEED);
  const top = left;
  const { canvas, context } = newCanvas(PRINT_SIZE.width, PRINT_SIZE.height);
  for (const dy of [-1, 0, 1]) {
    for (const dx of [-1, 0, 1]) {
      // The card flipped across the edge it shares with the neighbour, clipped by the sheet.
      context.save();
      context.translate(
        left + dx * TRIM.width + (dx ? TRIM.width : 0),
        top + dy * TRIM.height + (dy ? TRIM.height : 0),
      );
      context.scale(dx ? -1 : 1, dy ? -1 : 1);
      context.drawImage(trim, 0, 0);
      context.restore();
    }
  }
  return canvas;
}

async function toPng(canvas: OffscreenCanvas): Promise<ArrayBuffer> {
  return (await withBleed(canvas).convertToBlob({ type: "image/png" })).arrayBuffer();
}

async function toJpeg(canvas: OffscreenCanvas): Promise<Uint8Array> {
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Draws a card's front, laid out as on the screen: the cover as the card crops it, across the top,
 * then the title and description. `cover` is the image, or null for the placeholder, a coloured
 * block with the title's first letter. The bleed is added by mirroring the edges.
 */
export async function renderFace(
  card: Card,
  cover: ImageBitmap | null,
  theme: FaceTheme,
): Promise<ArrayBuffer> {
  return toPng(await drawFace(card, cover, theme));
}

/** A card's front at its trimmed size, as a JPEG for the PDF. */
export async function faceJpeg(
  card: Card,
  cover: ImageBitmap | null,
  theme: FaceTheme,
): Promise<Uint8Array> {
  return toJpeg(await drawFace(card, cover, theme));
}

/** A small picture of a card's front for the dialog, as an object URL the caller revokes. */
export async function facePreview(
  card: Card,
  cover: ImageBitmap | null,
  theme: FaceTheme,
): Promise<string> {
  return preview(await drawFace(card, cover, theme));
}

/** A line of a face's text: the text, and where its line box starts, from the top of the card. */
export interface TextLine {
  text: string;
  top: number;
}

/** Where a face puts its title and description, in the pixels of the card it's drawn on. */
export interface FaceLayout {
  /** The face's text size; the sizes below are in em of it. */
  em: number;
  title: { size: number; lineHeight: number; lines: TextLine[] };
  /**
   * The description's lines, down to the one that starts at the box's bottom. The box fills what
   * the title leaves, cuts off what doesn't fit and fades out over its last `fade` pixels, as the
   * description does on the screen.
   */
  description: {
    size: number;
    lineHeight: number;
    lines: TextLine[];
    box: { left: number; width: number; top: number; bottom: number; fade: number };
  };
}

/** Which text is measured, and at what size in pixels. */
export type MeasureAt = (text: string, part: "title" | "description", size: number) => number;

/**
 * Lays out a face's title and description on a card `size` pixels across, as the card styles do on
 * the screen: the same padding, sizes and line heights in em of the same text size, so the text
 * takes the same share of the card at any size. The title takes up to three lines and ends in an
 * ellipsis when it's longer; the description keeps going until its box ends. `measure` gives a
 * text's width in the font it's set in.
 */
export function layoutFace(
  card: Pick<Card, "title" | "description">,
  size: { width: number; height: number },
  measure: MeasureAt,
): FaceLayout {
  const em = faceEm(size.width);
  const { padding, title, description } = FACE_TEXT;
  const left = padding.side * em;
  const width = size.width - 2 * left;

  const titleSize = title.size * em;
  const titleHeight = titleSize * title.lineHeight;
  const measureTitle: Measure = (text) => measure(text, "title", titleSize);
  const start = size.width / COVER_ASPECT + padding.top * em;
  const titleLines = clampLines(
    wrapText(card.title, width, measureTitle),
    title.maxLines,
    width,
    measureTitle,
  ).map((text, index) => ({ text, top: start + index * titleHeight }));

  const descriptionSize = description.size * em;
  const descriptionHeight = descriptionSize * description.lineHeight;
  const box = {
    left,
    width,
    top: start + titleLines.length * titleHeight + description.gap * descriptionSize,
    bottom: size.height - padding.bottom * em,
    fade: description.fade * descriptionSize,
  };
  const lines: TextLine[] = [];
  if (card.description) {
    const measureDescription: Measure = (text) => measure(text, "description", descriptionSize);
    for (const text of wrapText(card.description, width, measureDescription)) {
      const top = box.top + lines.length * descriptionHeight;
      if (top >= box.bottom) break;
      lines.push({ text, top });
    }
  }
  return {
    em,
    title: { size: titleSize, lineHeight: titleHeight, lines: titleLines },
    description: { size: descriptionSize, lineHeight: descriptionHeight, lines, box },
  };
}

/**
 * Loads the face's fonts for these texts. A canvas measures and draws with a font only once it's
 * loaded, where the screen waits for it by itself, and the styles only load a font once it's used.
 */
async function loadFaceFonts(...texts: (string | undefined)[]): Promise<void> {
  const text = texts.join("");
  await Promise.all(
    Object.values(FACE_WEIGHTS).map((weight) =>
      document.fonts.load(`${weight} 16px ${FACE_FONT}`, text),
    ),
  );
}

async function drawFace(
  card: Card,
  cover: ImageBitmap | null,
  theme: FaceTheme,
): Promise<OffscreenCanvas> {
  await loadFaceFonts(card.title, card.description, placeholderLetter(card.title));
  const colours = FACE_COLOURS[theme];
  const { canvas, context } = trimCanvas();
  context.fillStyle = colours.paper;
  context.fillRect(0, 0, TRIM.width, TRIM.height);

  const frame = { x: 0, y: 0, width: TRIM.width, height: TRIM.width / COVER_ASPECT };
  if (cover) drawCover(context, cover, card.coverCrop, frame);
  else drawPlaceholder(context, card.title, frame);

  const fonts = FACE_WEIGHTS;
  const layout = layoutFace(card, TRIM, (text, part, size) => {
    context.font = `${fonts[part]} ${size}px ${FACE_FONT}`;
    return context.measureText(text).width;
  });
  context.textAlign = "start";
  context.textBaseline = "alphabetic";

  // A line goes where the browser puts it: the font's height centred in the line's box.
  const { box } = layout.description;
  const drawLines = (part: "title" | "description", colour: string) => {
    const { size, lineHeight, lines } = layout[part];
    context.font = `${fonts[part]} ${size}px ${FACE_FONT}`;
    context.fillStyle = colour;
    const { fontBoundingBoxAscent: ascent, fontBoundingBoxDescent: descent } =
      context.measureText("Hg");
    for (const { text, top } of lines) {
      const baseline = top + (lineHeight - (ascent + descent)) / 2 + ascent;
      context.fillText(text, box.left, baseline);
    }
  };
  drawLines("title", colours.title);

  // The description is cut off at its box's end, fading out over the last of it.
  context.save();
  context.beginPath();
  context.rect(box.left, box.top, box.width, box.bottom - box.top);
  context.clip();
  drawLines("description", colours.text);
  const fade = context.createLinearGradient(0, box.bottom - box.fade, 0, box.bottom);
  fade.addColorStop(0, rgba(colours.paper, 0));
  fade.addColorStop(1, rgba(colours.paper, 1));
  context.fillStyle = fade;
  context.fillRect(box.left, box.bottom - box.fade, box.width, box.fade);
  context.restore();
  return canvas;
}

/** Draws the image into the frame so the crop fills it, like the card's cover. */
function drawCover(
  context: Context,
  image: ImageBitmap,
  crop: Card["coverCrop"],
  frame: { x: number; y: number; width: number; height: number },
): void {
  const [x, y, width, height] = fitCrop(
    crop,
    image.width,
    image.height,
    frame.width / frame.height,
  );
  context.drawImage(
    image,
    x * image.width,
    y * image.height,
    width * image.width,
    height * image.height,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
  );
}

function drawPlaceholder(
  context: Context,
  title: string,
  frame: { x: number; y: number; width: number; height: number },
): void {
  const gradient = context.createLinearGradient(0, frame.y, frame.width, frame.y + frame.height);
  gradient.addColorStop(0, PLACEHOLDER.from);
  gradient.addColorStop(1, PLACEHOLDER.to);
  context.fillStyle = gradient;
  context.fillRect(frame.x, frame.y, frame.width, frame.height);
  const letter = placeholderLetter(title);
  context.fillStyle = PLACEHOLDER.letter;
  context.font = `${FACE_WEIGHTS.title} ${frame.height * 0.45}px ${FACE_FONT}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(letter, frame.x + frame.width / 2, frame.y + frame.height / 2);
  context.textAlign = "start";
}

/** A back made by the plugin. */
export interface BackDesign {
  id: string;
  name: string;
}

/** The back Tracecards comes with. */
export const BACK_DESIGNS: readonly BackDesign[] = [{ id: "default", name: "Default" }];

/** The default back's colours: its lines' teal, and a blue darker than the picture's, for the plate. */
const CIRCUIT = { line: "#03c8d5", dark: "#02121a" };

let circuit: Promise<ImageBitmap> | null = null;

/** The default back's picture, decoded once. */
function circuitImage(): Promise<ImageBitmap> {
  circuit ??= createImageBitmap(
    new Blob([Uint8Array.from(atob(DEFAULT_BACK_WEBP), (c) => c.charCodeAt(0))], {
      type: "image/webp",
    }),
  ).catch((error: unknown) => {
    circuit = null;
    throw error;
  });
  return circuit;
}

/**
 * The name on the default back, in pixels at the trimmed size: its middle, down the card; the
 * letters' width; and the plate round them, its padding, corner and edge.
 */
const NAME_PLATE = { y: 0.84, width: 297, padX: 31, padY: 22, radius: 11, line: 4 };

/**
 * Draws the default back at the trimmed size: the circuit board, with the name at the bottom in
 * the middle, in our wordmark's letters, on a dark plate edged in the lines' teal. The name also
 * shows which way up a card is.
 */
async function drawDefaultBack(): Promise<OffscreenCanvas> {
  const { canvas, context } = trimCanvas();
  const { width, height } = TRIM;
  drawCover(context, await circuitImage(), undefined, { x: 0, y: 0, width, height });

  const { box } = WORDMARK;
  const scale = NAME_PLATE.width / box.width;
  const letters = { width: NAME_PLATE.width, height: box.height * scale };
  const plate = {
    width: letters.width + 2 * NAME_PLATE.padX,
    height: letters.height + 2 * NAME_PLATE.padY,
  };
  const left = (width - plate.width) / 2;
  const top = height * NAME_PLATE.y - plate.height / 2;

  // The plate, glowing a little like the lines, so the name reads over them.
  context.save();
  context.shadowColor = rgba(CIRCUIT.line, 0.45);
  context.shadowBlur = 18;
  context.fillStyle = CIRCUIT.dark;
  context.beginPath();
  context.roundRect(left, top, plate.width, plate.height, NAME_PLATE.radius);
  context.fill();
  context.restore();
  context.strokeStyle = CIRCUIT.line;
  context.lineWidth = NAME_PLATE.line;
  context.stroke();

  context.save();
  context.translate(left + NAME_PLATE.padX, top + NAME_PLATE.padY);
  context.scale(scale, scale);
  context.translate(-box.x, -box.y);
  context.fillStyle = CIRCUIT.line;
  context.fill(new Path2D(WORDMARK.path));
  context.restore();
  return canvas;
}

/** A colour like `#04222f` with an alpha. */
function rgba(hex: string, alpha: number): string {
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** The user's own back image as a print image: it fills the card, cropped to fit. */
function drawImageBack(image: ImageBitmap, crop: CoverCrop | undefined): OffscreenCanvas {
  const { canvas, context } = trimCanvas();
  drawCover(context, image, crop, { x: 0, y: 0, width: TRIM.width, height: TRIM.height });
  return canvas;
}

type ReadCustom = (id: string) => Promise<ImageBitmap | null>;

/**
 * A back at the trimmed size: the plugin's design with that id, or the user's own image, cropped
 * as `crop` says, or to fill the card without one.
 */
async function drawBack(
  id: string,
  readCustom: ReadCustom,
  crop?: CoverCrop,
): Promise<OffscreenCanvas> {
  if (BACK_DESIGNS.some((design) => design.id === id)) return drawDefaultBack();
  const image = await readCustom(id);
  // A back that's gone, or an id from an earlier version, falls back to the default.
  if (!image) return drawDefaultBack();
  try {
    return drawImageBack(image, crop);
  } finally {
    image.close();
  }
}

/** A back's print image for Game Crafter, with the bleed. */
export async function renderBack(
  id: string,
  readCustom: ReadCustom,
  crop?: CoverCrop,
): Promise<ArrayBuffer> {
  return toPng(await drawBack(id, readCustom, crop));
}

/** A back at its trimmed size, as a JPEG for the PDF. */
export async function backJpeg(
  id: string,
  readCustom: ReadCustom,
  crop?: CoverCrop,
): Promise<Uint8Array> {
  return toJpeg(await drawBack(id, readCustom, crop));
}

/** A small picture of a back for the dialog, as an object URL the caller revokes. */
export async function backPreview(id: string, readCustom: ReadCustom): Promise<string> {
  return preview(await drawBack(id, readCustom));
}

/** A card drawn at its trimmed size, made small enough to show sharply in the dialog. */
async function preview(full: OffscreenCanvas): Promise<string> {
  const height = 504;
  const width = Math.round((height * TRIM.width) / TRIM.height);
  const { canvas, context } = newCanvas(width, height);
  context.imageSmoothingQuality = "high";
  context.drawImage(full, 0, 0, width, height);
  return URL.createObjectURL(await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 }));
}

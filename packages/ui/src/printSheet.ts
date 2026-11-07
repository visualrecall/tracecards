import { DINGBATS, FONT, literal, num, PdfBuilder } from "./pdf";
import { ellipsize } from "./printRender";

// Sheets of cards to print at home and cut out: nine bridge-size cards to a page, at their real size,
// side by side so one straight cut separates two cards. Thin lines mark every cut, dashed where
// they run on into the margins, with scissors at the start of each line across the page. Backs,
// when wanted, come on the page after their fronts, mirrored so they meet their fronts when the
// printer flips the paper on its long edge.

export type Paper = "letter" | "a4";

/** The paper sizes, in points (72 to the inch). */
export const PAPERS: Record<Paper, { name: string; width: number; height: number }> = {
  letter: { name: "Letter", width: 612, height: 792 },
  a4: { name: "A4", width: 595.28, height: 841.89 },
};

/** A bridge card, 2.25 by 3.5 inches: the shape of the card on the screen. */
export const CARD = { width: 162, height: 252 } as const;
const COLUMNS = 3;
const ROWS = 3;
export const CARDS_PER_PAGE = COLUMNS * ROWS;

/** Where Letter paper is the usual size. Everywhere else uses A4. */
const LETTER_REGIONS = new Set(["US", "CA", "MX", "PH", "CL", "CO", "VE", "CR", "GT", "PR"]);

/** The paper people in the locale's region usually have. */
export function defaultPaper(locale: string): Paper {
  try {
    const { region } = new Intl.Locale(locale).maximize();
    return region && LETTER_REGIONS.has(region) ? "letter" : "a4";
  } catch {
    return "a4";
  }
}

/** How many sheets of paper the cards take, counting a page of backs as the same sheet. */
export function sheetCount(cards: number): number {
  return Math.ceil(cards / CARDS_PER_PAGE);
}

/** A card on a page: its index among the cards, and its lower left corner in points. */
export interface Slot {
  card: number;
  x: number;
  y: number;
}

export interface SheetPage {
  side: "fronts" | "backs";
  /** Which sheet of paper it's on, from 0. A sheet's backs are on the same sheet as its fronts. */
  sheet: number;
  slots: Slot[];
}

/** The lower left corner of the full grid of cards, which is in the middle of the page. */
function gridOrigin(paper: Paper) {
  const { width, height } = PAPERS[paper];
  return {
    left: (width - COLUMNS * CARD.width) / 2,
    bottom: (height - ROWS * CARD.height) / 2,
  };
}

/** Where each card goes: the pages in printing order, each sheet's fronts then its backs. */
export function layoutSheets(count: number, paper: Paper, backs: boolean): SheetPage[] {
  const { left, bottom } = gridOrigin(paper);
  const pages: SheetPage[] = [];
  const place = (card: number, mirrored: boolean): Slot => {
    const index = card % CARDS_PER_PAGE;
    const column = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    return {
      card,
      x: left + (mirrored ? COLUMNS - 1 - column : column) * CARD.width,
      y: bottom + (ROWS - 1 - row) * CARD.height,
    };
  };
  for (let sheet = 0; sheet < sheetCount(count); sheet++) {
    const first = sheet * CARDS_PER_PAGE;
    const cards = Array.from(
      { length: Math.min(CARDS_PER_PAGE, count - first) },
      (_, index) => first + index,
    );
    pages.push({ side: "fronts", sheet, slots: cards.map((card) => place(card, false)) });
    if (backs) pages.push({ side: "backs", sheet, slots: cards.map((card) => place(card, true)) });
  }
  return pages;
}

/** A sheet to make: the cards' fronts and the back, as JPEGs at the cards' trimmed size. */
export interface SheetJob {
  deckName: string;
  paper: Paper;
  faces: Uint8Array[];
  /** The back for every card, or null to print fronts only. */
  back: Uint8Array | null;
  /** The pixel size of every picture. */
  imageSize: { width: number; height: number };
}

/** Makes the PDF. */
export function buildSheets(job: SheetJob): Uint8Array {
  const pdf = new PdfBuilder({ title: job.deckName, duplex: job.back !== null });
  const { width, height } = job.imageSize;
  const faces = job.faces.map((jpeg) => pdf.addImage({ jpeg, width, height }));
  const back = job.back === null ? null : pdf.addImage({ jpeg: job.back, width, height });
  const sheets = sheetCount(job.faces.length);
  const paper = PAPERS[job.paper];

  for (const page of layoutSheets(job.faces.length, job.paper, back !== null)) {
    const pictures = new Set<number>();
    let content = "";
    for (const slot of page.slots) {
      const picture = page.side === "fronts" ? faces[slot.card] : back;
      if (picture === undefined || picture === null) continue;
      pictures.add(picture);
      content += `q ${CARD.width} 0 0 ${CARD.height} ${num(slot.x)} ${num(slot.y)} cm /Im${picture} Do Q\n`;
    }
    // The lines are on the fronts only: the cards are cut from the front, and lines on the back
    // wouldn't meet them if the printer shifts the paper a little.
    if (page.side === "fronts") content += cutLines(page.slots, job.paper);
    const side = back === null ? "" : ` · ${page.side}`;
    content += branding(job.paper, `${job.deckName} · sheet ${page.sheet + 1} of ${sheets}${side}`);
    pdf.addPage({ width: paper.width, height: paper.height, content, images: [...pictures] });
  }
  return pdf.build();
}

/** How close to the paper's edge the marks go, since printers can't print right up to it. */
const EDGE = 8;

/**
 * The cut lines: a hairline round every card, and dashed lines carrying each cut on through the
 * margins to near the paper's edge, with scissors at the start of each line across the page.
 */
function cutLines(slots: Slot[], paper: Paper): string {
  const { width, height } = PAPERS[paper];
  const grid = gridOrigin(paper);
  const gridTop = grid.bottom + ROWS * CARD.height;
  const gridRight = grid.left + COLUMNS * CARD.width;
  const xs = new Set<number>();
  const ys = new Set<number>();
  const bottomRow = new Set<number>();
  for (const { x, y } of slots) {
    xs.add(x).add(x + CARD.width);
    ys.add(y).add(y + CARD.height);
    if (y === grid.bottom) bottomRow.add(x).add(x + CARD.width);
  }

  let ops = "q 0.3 w 0.75 G\n";
  for (const { x, y } of slots) ops += `${num(x)} ${num(y)} ${CARD.width} ${CARD.height} re S\n`;
  ops += "Q\nq 0.5 w 0.55 G [2.5 2] 0 d\n";
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    `${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S\n`;
  const scissors = { size: 8, width: 8 };
  for (const x of xs) ops += line(x, gridTop, x, height - EDGE);
  for (const x of bottomRow) ops += line(x, EDGE, x, grid.bottom);
  for (const y of ys) {
    ops += line(EDGE + scissors.width + 2, y, grid.left, y);
    ops += line(gridRight, y, width - EDGE, y);
  }
  ops += "Q\n";
  // ✂ is the character " in Zapf Dingbats, drawn here with its blades along the line.
  ops += `BT /${DINGBATS} ${scissors.size} Tf 0.55 g\n`;
  for (const y of ys) ops += `1 0 0 1 ${num(EDGE)} ${num(y - scissors.size * 0.36)} Tm (") Tj\n`;
  ops += "ET\n";
  return ops;
}

// The Tracecards mark, three stacked card outlines on a 64 grid with y down, as in the logo: the
// two behind are open lines that stop where the card in front starts. Each corner is a quarter
// circle of radius 4, written as [corner x, corner y] between the straight runs.
type Point = readonly [number, number];
const MARK: readonly {
  points: readonly (Point | { corner: Point })[];
  closed: boolean;
  tint: number;
}[] = [
  {
    points: [
      [27, 12.75],
      [27, 11],
      { corner: [27, 7] },
      [31, 7],
      [49, 7],
      { corner: [53, 7] },
      [53, 11],
      [53, 37],
      { corner: [53, 41] },
      [49, 41],
      [47.25, 41],
    ],
    closed: false,
    tint: 0.55,
  },
  {
    points: [
      [19, 20.75],
      [19, 19],
      { corner: [19, 15] },
      [23, 15],
      [41, 15],
      { corner: [45, 15] },
      [45, 19],
      [45, 45],
      { corner: [45, 49] },
      [41, 49],
      [39.25, 49],
    ],
    closed: false,
    tint: 0.8,
  },
  {
    points: [
      [15, 23],
      [33, 23],
      { corner: [37, 23] },
      [37, 27],
      [37, 53],
      { corner: [37, 57] },
      [33, 57],
      [15, 57],
      { corner: [11, 57] },
      [11, 53],
      [11, 27],
      { corner: [11, 23] },
      [15, 23],
    ],
    closed: true,
    tint: 1,
  },
];

/** How far a quarter circle's control points are along the tangents, as a share of the radius. */
const KAPPA = 0.5523;

/** The brand's mid teal, which shows on white, mixed with the paper for the cards behind. */
const TEAL = [14, 158, 136] as const;

function markOps(): string {
  let ops = "";
  for (const { points, closed, tint } of MARK) {
    const color = TEAL.map((channel) => num((255 - tint * (255 - channel)) / 255)).join(" ");
    ops += `${color} RG\n`;
    let previous: Point | null = null;
    let corner: Point | null = null;
    for (const point of points) {
      if ("corner" in point) {
        corner = point.corner;
        continue;
      }
      if (previous === null) ops += `${point[0]} ${point[1]} m\n`;
      else if (corner === null) ops += `${point[0]} ${point[1]} l\n`;
      else {
        const toward = (from: Point, axis: 0 | 1, at: Point) =>
          num(from[axis] + KAPPA * (at[axis] - from[axis]));
        ops += `${toward(previous, 0, corner)} ${toward(previous, 1, corner)} `;
        ops += `${toward(point, 0, corner)} ${toward(point, 1, corner)} ${point[0]} ${point[1]} c\n`;
      }
      previous = point;
      corner = null;
    }
    ops += closed ? "h S\n" : "S\n";
  }
  return ops;
}

// Helvetica's widths, in thousandths of the type size, for the characters from space to ~.
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/** About how wide text is in Helvetica, in points. Characters past ~ count as an average one. */
export function textWidth(text: string, size: number, spacing = 0): number {
  let units = 0;
  for (const char of text) units += HELVETICA[(char.codePointAt(0) ?? 0) - 32] ?? 556;
  return (units * size) / 1000 + spacing * Array.from(text).length;
}

/**
 * The mark and TRACECARDS up the left margin, and the deck, sheet and side up the right one,
 * both turned to read from the bottom, beside the middle row of cards, where no cut line is.
 */
function branding(paper: Paper, label: string): string {
  const { width, height } = PAPERS[paper];
  const { left } = gridOrigin(paper);
  const room = CARD.height - 24;

  const name = { size: 7, spacing: 1.6, text: "TRACECARDS" };
  const markSize = 9;
  const nameWidth = textWidth(name.text, name.size, name.spacing) - name.spacing;
  const brandLength = markSize + 4 + nameWidth;
  const capHeight = 0.72;
  // Turned a quarter turn anticlockwise: the text runs up the page from `start`, its baseline at
  // `x`, the letters standing to its left.
  const turned = (x: number, start: number) => `0 1 -1 0 ${num(x)} ${num(start)} cm\n`;

  const brandX = left / 2 + (name.size * capHeight) / 2;
  let ops = `q ${turned(brandX, height / 2 - brandLength / 2)}`;
  // The mark stands on the baseline, as tall as a little more than the capitals.
  ops += `q ${markSize / 64} 0 0 ${-markSize / 64} 0 ${num(markSize - 1)} cm 4.5 w 1 J 1 j\n`;
  ops += markOps();
  ops += "Q\n";
  ops += `BT /${FONT} ${name.size} Tf ${name.spacing} Tc 0.29 0.33 0.34 rg `;
  ops += `1 0 0 1 ${markSize + 4} 0 Tm ${literal(name.text)} Tj ET\nQ\n`;

  const info = { size: 6.5 };
  const text = ellipsize(label, room, (part) => textWidth(part, info.size));
  const infoX = width - left / 2 + (info.size * capHeight) / 2;
  ops += `q ${turned(infoX, height / 2 - textWidth(text, info.size) / 2)}`;
  ops += `BT /${FONT} ${info.size} Tf 0.5 g 0 0 Td ${literal(text)} Tj ET\nQ\n`;
  return ops;
}

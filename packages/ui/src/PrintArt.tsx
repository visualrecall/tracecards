import type { CSSProperties } from "react";
import { GAMECRAFTER_LOGO } from "./gamecrafterLogo";
import type { FaceTheme } from "./host";
import { FACE_COLOURS } from "./printRender";
import { CARD, CARDS_PER_PAGE, layoutSheets, type Paper, PAPERS } from "./printSheet";

// The print dialog's pictures of the two ways to print, drawn in the theme's colours, or for Game
// Crafter in its lime green, with its logo.

const CUT = 43;

/** A sheet of nine cards with its cut lines, and scissors starting along one. */
export function HomePrintArt() {
  const columns = [50, 70, 90, 110];
  const rows = [16, CUT, 70, 97];
  return (
    <svg className="tracecards-print-art" viewBox="0 0 160 110" aria-hidden="true">
      <rect className="tracecards-art-paper" x="44" y="8" width="72" height="95" rx="2" />
      {[0, 1, 2].flatMap((row) =>
        [0, 1, 2].map((column) => (
          <MiniCard
            key={`${row}-${column}`}
            x={50 + column * 20}
            y={16 + row * 27}
            width={20}
            height={27}
            shade={(row + column) % 3}
          />
        )),
      )}
      <g className="tracecards-art-cut">
        {columns.map((x) => (
          <path key={`c${x}`} d={`M${x} 10V16M${x} 97V101`} />
        ))}
        {rows.map((y) => (
          <path key={`r${y}`} d={`M46 ${y}H50M110 ${y}H114`} />
        ))}
        <path d={`M38 ${CUT}H44`} />
      </g>
      <g className="tracecards-art-scissors">
        <circle cx="18" cy={CUT - 8} r="4.5" />
        <circle cx="18" cy={CUT + 8} r="4.5" />
        <path d={`M21.5 ${CUT - 5}L37 ${CUT + 2.5}M21.5 ${CUT + 5}L37 ${CUT - 2.5}`} />
      </g>
    </svg>
  );
}

/** How the fan's cards turn, by how many there are, the first card's first. */
const FAN: Record<number, readonly number[]> = { 1: [0], 2: [-5, 5], 3: [0, -9, 9] };

/**
 * The deck's first cards, drawn as they'll print, fanned out with the first on top. A card not
 * drawn yet shows as a blank one in the theme's colour.
 */
export function FacesPreview({
  urls,
  theme,
}: {
  urls: readonly (string | undefined)[];
  theme: FaceTheme;
}) {
  const angles = FAN[urls.length] ?? [];
  // Drawn from the last to the first, so the first is on top.
  const cards = urls.map((url, index) => ({ url, index })).reverse();
  return (
    <div className="tracecards-print-fan" style={paperStyle(theme)} aria-hidden="true">
      {cards.map(({ url, index }) => (
        <span
          key={index}
          className="tracecards-print-fan-card"
          style={{ transform: `rotate(${angles[index] ?? 0}deg)` }}
        >
          {url && <img src={url} alt="" />}
        </span>
      ))}
    </div>
  );
}

/** How far the cut lines stop from the paper's edge, in points, as on the printed sheet. */
const EDGE = 8;

/**
 * The first sheet of the PDF, drawn to scale on the paper: the deck's first nine cards, or fewer,
 * where they'll print, with their cut lines running into the margins. `faces` are the cards'
 * pictures as they'll print; one not drawn yet is a blank card in the theme's colour.
 */
export function SheetPreview({
  paper,
  cards,
  faces,
  theme,
}: {
  paper: Paper;
  cards: number;
  faces: readonly (string | undefined)[];
  theme: FaceTheme;
}) {
  const { width, height } = PAPERS[paper];
  const slots = layoutSheets(Math.min(cards, CARDS_PER_PAGE), paper, false)[0]?.slots ?? [];
  // The layout measures up from the bottom of the page, and SVG down from the top.
  const placed = slots.map((slot) => ({ ...slot, y: height - slot.y - CARD.height }));
  const xs = [...new Set(placed.flatMap(({ x }) => [x, x + CARD.width]))];
  const ys = [...new Set(placed.flatMap(({ y }) => [y, y + CARD.height]))];
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  return (
    <svg
      className="tracecards-print-art tracecards-print-sheet"
      style={paperStyle(theme)}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <rect className="tracecards-art-paper" width={width} height={height} rx="6" />
      {placed.map(({ card, x, y }) => {
        const url = faces[card];
        return (
          <g key={card}>
            <rect
              className="tracecards-art-face"
              x={x}
              y={y}
              width={CARD.width}
              height={CARD.height}
            />
            {url && (
              <image
                href={url}
                x={x}
                y={y}
                width={CARD.width}
                height={CARD.height}
                preserveAspectRatio="none"
              />
            )}
            <rect
              className="tracecards-art-outline"
              x={x}
              y={y}
              width={CARD.width}
              height={CARD.height}
            />
          </g>
        );
      })}
      <g className="tracecards-art-cut">
        {xs.map((x) => (
          <path key={`x${x}`} d={`M${x} ${EDGE}V${top}`} />
        ))}
        {ys.map((y) => (
          <path key={`y${y}`} d={`M${EDGE} ${y}H${left}M${right} ${y}H${width - EDGE}`} />
        ))}
      </g>
    </svg>
  );
}

/** A fan of three printed cards, with a sparkle for their finish, and Game Crafter's logo. */
export function ProPrintArt() {
  return (
    <svg className="tracecards-print-art" viewBox="0 0 160 110" aria-hidden="true">
      {[-16, 0, 16].map((angle, index) => (
        <g key={angle} transform={`rotate(${angle} 80 112)`}>
          <MiniCard x={57} y={22} width={46} height={64} shade={2 - index} rounded />
        </g>
      ))}
      <path
        className="tracecards-art-sparkle"
        d="M128 18l2.2 5.8L136 26l-5.8 2.2L128 34l-2.2-5.8L120 26l5.8-2.2Z"
      />
      <path
        className="tracecards-art-sparkle"
        d="M30 62l1.4 3.6L35 67l-3.6 1.4L30 72l-1.4-3.6L25 67l3.6-1.4Z"
      />
      <image href={GAMECRAFTER_LOGO} x="110" y="62" width="40" height="40" />
    </svg>
  );
}

/** A card as the grid shows it: a cover across the top and two lines of text under it. */
function MiniCard({
  x,
  y,
  width,
  height,
  shade,
  rounded = false,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  shade: number;
  rounded?: boolean;
}) {
  const radius = rounded ? 4 : 0;
  const cover = (width * 2) / 3;
  const inset = width * 0.14;
  const line = Math.max(1.2, width * 0.06);
  return (
    <g>
      <rect className="tracecards-art-card" x={x} y={y} width={width} height={height} rx={radius} />
      <path
        className={`tracecards-art-cover tracecards-art-cover-${shade}`}
        d={
          rounded
            ? `M${x} ${y + cover}V${y + radius}a${radius} ${radius} 0 0 1 ${radius}-${radius}H${x + width - radius}a${radius} ${radius} 0 0 1 ${radius} ${radius}V${y + cover}Z`
            : `M${x} ${y}H${x + width}V${y + cover}H${x}Z`
        }
      />
      <rect
        className="tracecards-art-text"
        x={x + inset}
        y={y + cover + inset}
        width={width * 0.62}
        height={line}
        rx={line / 2}
      />
      <rect
        className="tracecards-art-text tracecards-art-text-light"
        x={x + inset}
        y={y + cover + inset + line * 2.2}
        width={width * 0.45}
        height={line}
        rx={line / 2}
      />
    </g>
  );
}

/** The fronts' paper colour, as the print images have it, for the styles to draw cards in. */
function paperStyle(theme: FaceTheme): CSSProperties {
  return { "--tracecards-face-paper": FACE_COLOURS[theme].paper } as CSSProperties;
}

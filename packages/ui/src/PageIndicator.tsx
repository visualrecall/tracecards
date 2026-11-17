/** Above this many pages, segments get too thin to see, so a scroll thumb shows the position. */
const MAX_SEGMENTS = 25;

/**
 * Which page of the deck's cards is showing, as a thin bar: a segment per page with the current
 * one lit, or a scroll thumb when there are many pages. Upright along the right edge of the
 * selected deck's tile, or lying under the card on a phone, where a page is a card.
 */
export function PageIndicator({
  page,
  pages,
  lying = false,
}: {
  page: number;
  pages: number;
  lying?: boolean;
}) {
  if (pages <= 1) return null;
  const className = `tracecards-page-indicator${lying ? " is-lying" : ""}`;
  if (pages > MAX_SEGMENTS) {
    // The thumb is at least 15% of the bar so it stays visible.
    const length = Math.max(15, 100 / pages);
    const start = (page / (pages - 1)) * (100 - length);
    const style = lying
      ? { left: `${start}%`, width: `${length}%` }
      : { top: `${start}%`, height: `${length}%` };
    return (
      <span className={`${className} is-thumb`} aria-hidden="true">
        <span className="is-current" style={style} />
      </span>
    );
  }
  return (
    <span className={className} aria-hidden="true">
      {Array.from({ length: pages }, (_, index) => (
        <span key={index} className={index === page ? "is-current" : undefined} />
      ))}
    </span>
  );
}

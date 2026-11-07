/** Above this many pages, segments get too thin to see, so a scroll thumb shows the position. */
const MAX_SEGMENTS = 25;

/**
 * Which page of the deck's cards is showing, as a thin bar along the right edge of the selected
 * deck's tile: a segment per page with the current one lit, or a scroll thumb
 * when there are many pages.
 */
export function PageIndicator({ page, pages }: { page: number; pages: number }) {
  if (pages <= 1) return null;
  if (pages > MAX_SEGMENTS) {
    // The thumb is at least 15% tall so it stays visible.
    const height = Math.max(15, 100 / pages);
    const top = (page / (pages - 1)) * (100 - height);
    return (
      <span className="tracecards-page-indicator is-thumb" aria-hidden="true">
        <span className="is-current" style={{ top: `${top}%`, height: `${height}%` }} />
      </span>
    );
  }
  return (
    <span className="tracecards-page-indicator" aria-hidden="true">
      {Array.from({ length: pages }, (_, index) => (
        <span key={index} className={index === page ? "is-current" : undefined} />
      ))}
    </span>
  );
}

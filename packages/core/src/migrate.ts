/** Data an app saved and reads back, such as its settings: an object whose fields aren't known yet. */
export type Saved = Record<string, unknown>;

/** Turns data saved at one version into the next version's shape. */
export type Migration = (saved: Saved) => Saved;

/**
 * Brings data saved by an older release up to date. `steps[n]` turns data at version n - 1 into
 * version n, and they run in order, so data from any older release reaches `current` however many
 * releases were skipped. A version without a step needs no change. Data from a newer release, as
 * synced from another device, is returned as it is, for the caller to read what it knows.
 */
export function migrate(
  saved: Saved,
  version: number,
  current: number,
  steps: Readonly<Record<number, Migration>>,
): { saved: Saved; version: number } {
  let data = saved;
  for (let next = version + 1; next <= current; next++) data = steps[next]?.(data) ?? data;
  return { saved: data, version: Math.max(version, current) };
}

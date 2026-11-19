/** A release's version, `major.minor.patch`, as numbers, or null when it isn't one. */
function parts(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** Whether a text is a release's version, `major.minor.patch`. */
export function isVersion(value: unknown): value is string {
  return typeof value === "string" && parts(value) !== null;
}

/**
 * Whether release `version` is newer than release `than`. A text that isn't a version is never
 * newer, and anything that is a version is newer than one that isn't.
 */
export function isNewerVersion(version: string, than: string): boolean {
  const a = parts(version);
  if (!a) return false;
  const b = parts(than);
  if (!b) return true;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return (a[i] as number) > (b[i] as number);
  }
  return false;
}

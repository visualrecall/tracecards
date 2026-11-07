import type { App } from "obsidian";

/** If what's kept here changes shape, use a new key, so older releases' values are left alone. */
const STORAGE_KEY = "tracecards-recent-cards";

/** How many cards are remembered. Search shows the first few that still exist. */
const KEPT = 10;

/**
 * The cards opened last, newest first, by their paths in the vault. They're kept in Obsidian's
 * local storage for the vault, so each device has its own, as with Obsidian's recent files.
 */
export class RecentCards {
  private paths: readonly string[];

  constructor(private readonly app: App) {
    const saved: unknown = app.loadLocalStorage(STORAGE_KEY);
    this.paths = Array.isArray(saved)
      ? saved.filter((path): path is string => typeof path === "string").slice(0, KEPT)
      : [];
  }

  get list(): readonly string[] {
    return this.paths;
  }

  add(path: string): void {
    this.save([path, ...this.paths.filter((other) => other !== path)]);
  }

  /** Follows a renamed or moved file, or the files in a renamed folder. */
  rename(oldPath: string, path: string): void {
    const inside = `${oldPath}/`;
    const renamed = this.paths.map((other) => {
      if (other === oldPath) return path;
      return other.startsWith(inside) ? `${path}/${other.slice(inside.length)}` : other;
    });
    if (renamed.some((other, index) => other !== this.paths[index])) this.save(renamed);
  }

  private save(paths: readonly string[]): void {
    this.paths = paths.slice(0, KEPT);
    this.app.saveLocalStorage(STORAGE_KEY, this.paths);
  }
}

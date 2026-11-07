import { buildVault, type Deck, isCardPath } from "@tracecards/core";
import { type Store, ValueStore, type VaultSnapshot } from "@tracecards/ui";
import { type App, debounce } from "obsidian";
import { listFolder } from "./source";

/**
 * How long a write waits for the vault's events before the model is rebuilt anyway, as for a
 * write that leaves the file as it was, which Obsidian doesn't report.
 */
const CATCH_UP_MS = 1000;

/** A wait for the model to be rebuilt, resolved by the first rebuild it's `ready` for. */
interface Wait {
  ready: () => boolean;
  resolve: () => void;
}

/** Holds the current vault model and rebuilds it when files in the Tracecards folder change. */
export class VaultStore implements Store<VaultSnapshot> {
  private readonly snapshot: ValueStore<VaultSnapshot>;
  /** How many file events the store has heard, and how many of them the model includes. */
  private changes = 0;
  private included = 0;
  private waits: Wait[] = [];
  readonly subscribe: Store<VaultSnapshot>["subscribe"];
  readonly getSnapshot: Store<VaultSnapshot>["getSnapshot"];

  constructor(
    private readonly app: App,
    private currentFolder: string,
  ) {
    this.snapshot = new ValueStore(this.read());
    this.subscribe = this.snapshot.subscribe;
    this.getSnapshot = this.snapshot.getSnapshot;
  }

  /** The Tracecards folder, relative to the vault root. */
  get folder(): string {
    return this.currentFolder;
  }

  /** The decks, or none when the folder doesn't exist. */
  get decks(): Deck[] {
    return this.getSnapshot().vault?.decks ?? [];
  }

  /** Switches to another Tracecards folder and rebuilds the model shortly after. */
  setFolder(folder: string): void {
    if (folder === this.currentFolder) return;
    this.currentFolder = folder;
    this.refreshSoon();
  }

  /** Whether a vault path is the Tracecards folder or inside it. */
  contains(path: string): boolean {
    return path === this.folder || path.startsWith(`${this.folder}/`);
  }

  /** The path of a file inside the Tracecards folder relative to that folder, or null. */
  relativePath(vaultPath: string): string | null {
    return vaultPath.startsWith(`${this.folder}/`) ? vaultPath.slice(this.folder.length + 1) : null;
  }

  /** Whether the file at this vault path is a card. */
  isCard(vaultPath: string): boolean {
    const path = this.relativePath(vaultPath);
    return path !== null && isCardPath(path);
  }

  /** The vault path of a path relative to the Tracecards folder, such as a card's path. */
  vaultPath(relativePath: string): string {
    return `${this.folder}/${relativePath}`;
  }

  /** Rebuilds the model now. */
  refresh(): void {
    this.refreshSoon.cancel();
    this.included = this.changes;
    // A new object each time, so listeners always hear of it.
    this.snapshot.set(this.read());
    // In the same task as the snapshot, so screens hear of both at once.
    const ready = this.waits.filter((wait) => wait.ready());
    this.waits = this.waits.filter((wait) => !ready.includes(wait));
    for (const wait of ready) wait.resolve();
  }

  /** Rebuilds the model once file events have settled, so a burst of changes costs one rebuild. */
  readonly refreshSoon = debounce(() => this.refresh(), 150, true);

  /** Hears that a file in the Tracecards folder changed: the model is rebuilt soon. */
  noteChange(): void {
    this.changes++;
    this.refreshSoon();
  }

  /**
   * Makes a change to the vault and resolves once the model shows it: rebuilt with every file event
   * heard by the time the change was made, and at least one. So the screens show a change once it
   * resolves. Obsidian reads a note's frontmatter a moment after it's written, so the model can't
   * simply be rebuilt straight away. If no event comes, it's rebuilt after `CATCH_UP_MS`.
   */
  async change(write: () => Promise<void>): Promise<void> {
    const before = this.changes;
    await write();
    const after = this.changes;
    const shown = () => this.included > before && this.included >= after;
    if (shown()) return;
    await new Promise<void>((resolve) => {
      const wait: Wait = { ready: shown, resolve };
      this.waits.push(wait);
      window.setTimeout(() => {
        if (!this.waits.includes(wait)) return;
        this.waits = this.waits.filter((other) => other !== wait);
        this.refresh();
        resolve();
      }, CATCH_UP_MS);
    });
  }

  /**
   * Runs `then` as the model is next rebuilt, as it will be after a file event, in the same task,
   * so screens hear of what it changes together with the new model.
   */
  onNextRefresh(then: () => void): void {
    this.waits.push({ ready: () => true, resolve: then });
  }

  private read(): VaultSnapshot {
    const entries = listFolder(this.app, this.folder);
    return { folder: this.folder, vault: entries && buildVault(entries) };
  }
}

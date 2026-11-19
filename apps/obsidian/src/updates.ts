import {
  chooseOffer,
  isNewerVersion,
  isOfferDue,
  isVersion,
  parseUpdateFeed,
  type UpdateFeed,
  type UpdateOffer,
} from "@tracecards/core";
import { ValueStore } from "@tracecards/ui";
import { type App, requestUrl } from "obsidian";
import type TracecardsPlugin from "./main";

const LATEST = "https://github.com/visualrecall/tracecards/releases/latest/download";

/**
 * The latest published release's update feed: its version and what each release says about
 * itself (`scripts/update-feed.mjs` makes it). Obsidian installs updates from the same releases,
 * so it's never ahead of what Obsidian can install, and, unlike GitHub's API, it isn't
 * rate-limited.
 */
const LATEST_FEED = `${LATEST}/update.json`;

/** The latest release's manifest, read when its release has no feed. */
const LATEST_MANIFEST = `${LATEST}/manifest.json`;

/** Where a release's notes are. */
const RELEASES = "https://github.com/visualrecall/tracecards/releases";

/** How long after a check the next one waits. */
const CHECK_EVERY = 24 * 60 * 60 * 1000;

// Never rename these: they're kept per device, in Obsidian's local storage for the vault.
/** The last check: when, in milliseconds since 1970, and the feed it found. */
const CHECKED_KEY = "tracecards-update-checked";
/** When the last notice of a newer release was shown, in milliseconds since 1970. */
const SHOWN_KEY = "tracecards-update-shown";
/** The release this device ran last, to say what's new once it runs a newer one. */
const LAST_RUN_KEY = "tracecards-last-run-version";

/**
 * Tells when a newer release is out, and what's new after an update. It never installs anything:
 * updating is Obsidian's, from its page for Tracecards.
 */
export class Updates {
  /** The newer release to offer now, or null for none. */
  readonly offer = new ValueStore<UpdateOffer | null>(null);
  /** The update this device just had, to say what's new, or null. */
  readonly updated = new ValueStore<{ from: string; to: string } | null>(null);
  private checking = false;

  constructor(private readonly plugin: TracecardsPlugin) {}

  private get app(): App {
    return this.plugin.app;
  }

  /** The release running here. */
  get installed(): string {
    return this.plugin.manifest.version;
  }

  /** Notes what this release is, offers what's newer, and looks up the latest release if due. */
  async start(): Promise<void> {
    this.noteRun();
    const { settings } = this.plugin;
    if (isNewerVersion(this.installed, settings.newestVersion)) {
      settings.newestVersion = this.installed;
      await this.plugin.saveData(settings);
    }
    this.refresh();
    await this.checkIfDue();
  }

  /**
   * Offers the newer release the last check found, or the newest that has run with these
   * settings, as synced from another device, which needs no network: once a week at most, or once
   * a day when it's urgent.
   */
  refresh(): void {
    const candidate = chooseOffer(
      this.installed,
      this.lastFeed(),
      this.plugin.settings.newestVersion,
    );
    const shown: unknown = this.app.loadLocalStorage(SHOWN_KEY);
    const due =
      candidate && isOfferDue(candidate, typeof shown === "number" ? shown : null, Date.now());
    const offer = due ? candidate : null;
    const current = this.offer.getSnapshot();
    if (JSON.stringify(current) !== JSON.stringify(offer)) this.offer.set(offer);
  }

  /** Notes that the offer was shown, so the next notice waits. */
  shown(): void {
    this.app.saveLocalStorage(SHOWN_KEY, Date.now());
    this.offer.set(null);
  }

  /**
   * Looks up the latest release, unless checking is turned off or it was done in the last day,
   * then offers what's due.
   */
  async checkIfDue(): Promise<void> {
    if (!this.plugin.settings.checkForUpdates || this.checking) {
      this.refresh();
      return;
    }
    const checked = this.app.loadLocalStorage(CHECKED_KEY) as { at?: unknown } | null;
    if (typeof checked?.at === "number" && Date.now() - checked.at < CHECK_EVERY) {
      this.refresh();
      return;
    }
    this.checking = true;
    try {
      const feed = await this.fetchFeed();
      this.app.saveLocalStorage(CHECKED_KEY, { at: Date.now(), feed });
    } catch {
      // Offline, or GitHub didn't answer: try again next time.
    } finally {
      this.checking = false;
    }
    this.refresh();
  }

  /**
   * Opens Obsidian's page for Tracecards, which has Obsidian's own Update button. Obsidian's
   * handler for the `show-plugin` link is called directly when it's there, as that keeps the
   * page in this vault, and otherwise the link is opened.
   */
  openPluginPage(): void {
    const id = this.plugin.manifest.id;
    const { protocolHandlers } = this.app.workspace as unknown as {
      protocolHandlers?: Map<string, (params: Record<string, string>) => void>;
    };
    const handler = protocolHandlers?.get?.("show-plugin");
    if (typeof handler === "function") {
      handler({ action: "show-plugin", id });
      return;
    }
    const vault = encodeURIComponent(this.app.vault.getName());
    window.open(`obsidian://show-plugin?vault=${vault}&id=${encodeURIComponent(id)}`);
  }

  /** The notes of a release, or, without one, of every release. */
  releaseNotesUrl(version?: string): string {
    return version ? `${RELEASES}/tag/${version}` : RELEASES;
  }

  /** Says what's new no more, on this device, until the next update. */
  seenWhatsNew(): void {
    this.app.saveLocalStorage(LAST_RUN_KEY, this.installed);
    this.updated.set(null);
  }

  /** The feed the last check found, or null, while checking is turned on. */
  private lastFeed(): UpdateFeed | null {
    if (!this.plugin.settings.checkForUpdates) return null;
    const checked = this.app.loadLocalStorage(CHECKED_KEY) as { feed?: unknown } | null;
    return parseUpdateFeed(checked?.feed);
  }

  /** The latest release's feed, or, for a release without one, its version alone. */
  private async fetchFeed(): Promise<UpdateFeed> {
    try {
      const feed = parseUpdateFeed((await requestUrl({ url: LATEST_FEED })).json);
      if (feed) return feed;
    } catch {
      // No feed in this release: its manifest below has the version.
    }
    const manifest: unknown = (await requestUrl({ url: LATEST_MANIFEST })).json;
    const version: unknown = (manifest as { version?: unknown } | null)?.version;
    if (!isVersion(version)) throw new Error("The latest release has no version");
    return { version, releases: [] };
  }

  /**
   * Says what's new when this device ran an older release before, until that's been seen. A new
   * install, or a first run with nothing remembered, says nothing and remembers this release.
   */
  private noteRun(): void {
    const last: unknown = this.app.loadLocalStorage(LAST_RUN_KEY);
    if (isVersion(last) && isNewerVersion(this.installed, last)) {
      this.updated.set({ from: last, to: this.installed });
    } else if (last !== this.installed) this.app.saveLocalStorage(LAST_RUN_KEY, this.installed);
  }
}

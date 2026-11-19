import { isNewerVersion, isVersion } from "./versions";

/** What a release says about itself in the update feed. */
export interface FeedRelease {
  version: string;
  /** Whether it's worth a notice. Quiet releases still come with the next one that is. */
  notify: boolean;
  /** Whether people should update soon: it's offered sooner and more often. */
  urgent: boolean;
  /** One line on why to update, for the notice, or null. */
  headline: string | null;
}

/**
 * The update feed, `update.json`, published with each release: the latest version and what each
 * release says about itself, newest first.
 */
export interface UpdateFeed {
  version: string;
  releases: FeedRelease[];
}

/** A newer release to offer. */
export interface UpdateOffer {
  version: string;
  urgent: boolean;
  headline: string | null;
}

/** How long after a notice the next one waits, in milliseconds, by whether it's urgent. */
export const REMIND_AFTER = { normal: 7 * 24 * 60 * 60 * 1000, urgent: 24 * 60 * 60 * 1000 };

/**
 * Reads an update feed. Fields it doesn't know are ignored, so later releases can add some. A
 * release missing a field takes the default: a notice, not urgent, no headline.
 */
export function parseUpdateFeed(data: unknown): UpdateFeed | null {
  if (typeof data !== "object" || data === null) return null;
  const { version, releases } = data as { version?: unknown; releases?: unknown };
  if (!isVersion(version)) return null;
  return {
    version,
    releases: (Array.isArray(releases) ? releases : []).flatMap((each: unknown) => {
      if (typeof each !== "object" || each === null) return [];
      const release = each as Record<string, unknown>;
      if (!isVersion(release.version)) return [];
      return [
        {
          version: release.version,
          notify: release.notify !== false,
          urgent: release.urgent === true,
          headline:
            typeof release.headline === "string" && release.headline.trim()
              ? release.headline.trim()
              : null,
        },
      ];
    }),
  };
}

/**
 * The release to offer a device running `installed`: the feed's latest, when any release after
 * `installed` is worth a notice. It's urgent when any of them is, with the headline of the newest
 * one that has one (of the urgent ones, when it's urgent). Without a feed, or when `synced`, the
 * newest release that has run with the device's synced settings, is newer than the feed knows,
 * `synced` is offered, as a plain notice.
 */
export function chooseOffer(
  installed: string,
  feed: UpdateFeed | null,
  synced: string,
): UpdateOffer | null {
  if (isNewerVersion(synced, installed) && (!feed || isNewerVersion(synced, feed.version))) {
    return { version: synced, urgent: false, headline: null };
  }
  if (!feed || !isNewerVersion(feed.version, installed)) return null;
  const newer = feed.releases.filter(({ version }) => isNewerVersion(version, installed));
  // A feed that doesn't list its own latest release still offers it.
  const listed = newer.some(({ version }) => version === feed.version);
  if (listed && !newer.some(({ notify }) => notify)) return null;
  const urgent = newer.some((release) => release.urgent);
  const newestFirst = [...newer].sort((a, b) => (isNewerVersion(a.version, b.version) ? -1 : 1));
  const headline =
    newestFirst.find((release) => release.headline && (!urgent || release.urgent))?.headline ??
    null;
  return { version: feed.version, urgent, headline };
}

/**
 * Whether to show the offer now: when no notice has been shown yet, or the last one was a week
 * ago, or a day ago when it's urgent.
 */
export function isOfferDue(offer: UpdateOffer, lastShown: number | null, now: number): boolean {
  if (lastShown === null) return true;
  return now - lastShown >= (offer.urgent ? REMIND_AFTER.urgent : REMIND_AFTER.normal);
}

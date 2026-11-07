import {
  type Bookmark,
  bookmarkName,
  bookmarkUrl,
  type Card,
  sameBookmark,
  videoId,
} from "@tracecards/core";
import type { Host, MenuEntry } from "./host";
import { ICONS } from "./icons";

// What the user can do with a card's bookmarks in its Bookmarks tab.

const NOT_A_URL = "That isn't a web address. Try something like example.com.";
const ALREADY_BOOKMARKED = "Already bookmarked";
/** How long adding a video waits for its title before adding it without one. */
const VIDEO_TITLE_TIMEOUT_MS = 5000;

/**
 * The URL of a new bookmark from what the user typed or pasted. Null, after telling the user why,
 * when it isn't a web address or the card already has it, counting the URLs in `saving`.
 */
export function newBookmarkUrl(
  host: Host,
  card: Card,
  input: string,
  saving: readonly string[],
): string | null {
  const url = bookmarkUrl(input);
  if (url === null) {
    host.notify(NOT_A_URL);
    return null;
  }
  const urls = [...card.bookmarks.map((bookmark) => bookmark.url), ...saving];
  if (urls.some((other) => sameBookmark(other, url))) {
    host.notify(ALREADY_BOOKMARKED);
    return null;
  }
  return url;
}

/**
 * Adds a bookmark at the end of the card's list, with a video's title from YouTube. Resolves to
 * whether it worked; when not, the user has been told.
 */
export async function saveBookmark(host: Host, card: Card, url: string): Promise<boolean> {
  const title = videoId(url)
    ? await withTimeout(host.videoTitle(url), VIDEO_TITLE_TIMEOUT_MS)
    : null;
  return host.addBookmark(card, { url, title: title ?? undefined });
}

/** The bookmark menu, with "Edit…". */
export function bookmarkMenu(host: Host, card: Card, bookmark: Bookmark): MenuEntry[] {
  return [
    { title: "Copy link", icon: ICONS.copyLink, onClick: () => void copyLink(host, bookmark.url) },
    { title: "Edit…", icon: ICONS.edit, onClick: () => void editBookmark(host, card, bookmark) },
    bookmark.primary
      ? {
          title: "Remove as primary source",
          icon: ICONS.unstar,
          onClick: () => void host.setPrimaryBookmark(card, null),
        }
      : {
          title: "Set as primary source",
          icon: ICONS.star,
          onClick: () => void host.setPrimaryBookmark(card, bookmark.url),
        },
    "separator",
    {
      title: "Delete",
      icon: ICONS.delete,
      warning: true,
      // At once, without asking: a bookmark is easily added again.
      onClick: () => void host.removeBookmark(card, bookmark.url),
    },
  ];
}

/** Asks for the bookmark's new title and URL. An empty title goes back to the URL's name. */
async function editBookmark(host: Host, card: Card, bookmark: Bookmark): Promise<void> {
  const values = await host.promptFields({
    title: "Edit bookmark",
    cta: "Save",
    fields: [
      {
        label: "Title",
        value: bookmark.title ?? "",
        placeholder: bookmarkName({ ...bookmark, title: undefined }),
      },
      { label: "URL", value: bookmark.url },
    ],
    validate: ([, input = ""]) => {
      const url = bookmarkUrl(input);
      if (url === null) return { field: 1, message: NOT_A_URL };
      const taken = card.bookmarks.some(
        (other) => other !== bookmark && sameBookmark(other.url, url),
      );
      return taken ? { field: 1, message: ALREADY_BOOKMARKED } : null;
    },
  });
  if (!values) return;
  const [title = "", input = ""] = values;
  const url = bookmarkUrl(input) ?? bookmark.url;
  const newTitle = title.trim();
  if (url === bookmark.url && newTitle === (bookmark.title ?? "")) return;
  await host.editBookmark(card, bookmark.url, { url, title: newTitle });
}

async function copyLink(host: Host, url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url);
    host.notify("Link copied");
  } catch {
    host.notify("Couldn't copy the link");
  }
}

/** The promise's value, or null when it fails or takes longer than `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      () => {
        window.clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

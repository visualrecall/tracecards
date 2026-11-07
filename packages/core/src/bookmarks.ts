// What a bookmark's URL means for the user: how one typed or pasted is read, when two are the same
// page, and the name and host a bookmark is shown with. See "Bookmarks" and "Changing bookmarks"
// in spec/vault-format.md.
import type { Bookmark } from "./model";
import { videoId } from "./youtube";

/** The scheme (`https://`), a leading `www.`, the host with any port, and the path. */
const URL_PARTS = /^(?:[a-z][a-z\d+.-]*:\/\/)?(?:www\.)?([^/?#]*)([^?#]*)/i;
/** An http or https URL's host, without user names, with an optional port. */
const WEB_HOST = /^https?:\/\/([^/?#:@]+)(?::\d+)?(?:[/?#]|$)/i;

/**
 * The URL for a bookmark from what the user typed or pasted: trimmed, with `https://` added when
 * it has no scheme, and otherwise as entered. Null when it isn't a web address: when it has
 * spaces, a scheme other than http or https, or a host without a dot other than `localhost`.
 */
export function bookmarkUrl(input: string): string | null {
  const text = input.trim();
  if (text === "" || /\s/.test(text)) return null;
  const url = /^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  const host = WEB_HOST.exec(url)?.[1]?.toLowerCase();
  if (host === undefined) return null;
  return host === "localhost" || /^[^.]+(?:\.[^.]+)+$/.test(host) ? url : null;
}

/**
 * Whether two URLs are the same bookmark: the same YouTube video, or the same URL apart from its
 * scheme, a leading `www.`, letter case in the host and a final `/`.
 */
export function sameBookmark(a: string, b: string): boolean {
  return bookmarkKey(a) === bookmarkKey(b);
}

function bookmarkKey(url: string): string {
  const video = videoId(url);
  if (video) return `video:${video}`;
  const { host, path, rest } = urlParts(url);
  return `${host.toLowerCase()}${path.replace(/\/$/, "")}${rest}`;
}

/**
 * The name a bookmark is shown with: its title, or one made from its URL. That's the last part
 * of the URL's path, with `-` and `_` as spaces, or the host when there's no path. A video
 * without a title is "YouTube video".
 */
export function bookmarkName(bookmark: Bookmark): string {
  if (bookmark.title) return bookmark.title;
  if (bookmark.videoId) return "YouTube video";
  const { host, path } = urlParts(bookmark.url);
  const segment =
    path
      .split("/")
      .filter((part) => part !== "")
      .pop() ?? "";
  const name = decoded(segment).replace(/[-_]+/g, " ").trim();
  return name || host;
}

/** The URL's host without a leading `www.`, as a bookmark shows it. */
export function bookmarkHost(url: string): string {
  return urlParts(url).host.toLowerCase();
}

/** The URL's host and path, as `URL_PARTS` finds them, and the query and fragment after them. */
function urlParts(url: string): { host: string; path: string; rest: string } {
  const text = url.trim();
  const match = URL_PARTS.exec(text);
  return {
    host: match?.[1] ?? "",
    path: match?.[2] ?? "",
    rest: text.slice(match?.[0].length ?? 0),
  };
}

/** The text with `%` escapes decoded, or as it is when they aren't valid. */
function decoded(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

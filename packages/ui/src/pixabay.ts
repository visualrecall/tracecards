import { type Host, isRecord, responseJson } from "./host";

// Searching Pixabay's free images for a cover, with the user's own API key. See
// https://pixabay.com/api/docs/. The README discloses this, with the other network use.

/** The kinds of image a search can be limited to. */
export const IMAGE_KINDS = {
  all: "All images",
  photo: "Photos",
  illustration: "Illustrations",
  vector: "Vector graphics",
} as const;

export type ImageKind = keyof typeof IMAGE_KINDS;

/** How many images a page of results has. */
export const PIXABAY_PAGE_SIZE = 40;

/** The longest search Pixabay takes. */
const MAX_QUERY = 100;

/** Pixabay asks for results to be kept for a day rather than asked for again. */
const CACHE_MS = 24 * 60 * 60 * 1000;

/** Where to get a key. */
export const PIXABAY_KEY_PAGE = "https://pixabay.com/api/docs/#api_search_images";

export interface PixabayImage {
  id: number;
  /** A version 340 px tall, for the results. */
  thumbnail: string;
  /** A version up to 640 px on either side, sharper on the card while it's picked. */
  medium: string;
  /** The version a cover is made from, up to 1280 px wide. */
  large: string;
  /** What's in it, as Pixabay's comma-separated tags. */
  tags: string;
}

export interface PixabayPage {
  images: PixabayImage[];
  /** How many images the search can page through. Pixabay stops at 500. */
  total: number;
}

export type PixabayResult = { ok: true; page: PixabayPage } | { ok: false; problem: string };

export interface PixabaySearch {
  query: string;
  kind: ImageKind;
  /** The page of results, from 1. */
  page: number;
}

/** Pages already fetched, by URL, with when. */
const cache = new Map<string, { page: PixabayPage; time: number }>();

/** Searches Pixabay with the key. Safe search is on, as a cover shows wherever the card does. */
export async function searchPixabay(
  host: Host,
  key: string,
  search: PixabaySearch,
): Promise<PixabayResult> {
  const url = pixabayUrl(key, search);
  const cached = cache.get(url);
  if (cached && Date.now() - cached.time < CACHE_MS) return { ok: true, page: cached.page };

  let response;
  try {
    response = await host.send({ url });
  } catch {
    return { ok: false, problem: "Tracecards can’t reach Pixabay. Check your connection." };
  }
  const { status } = response;
  if (status === 400 || status === 401 || status === 403) {
    return {
      ok: false,
      problem: "Pixabay didn’t accept the API key. Check it in Tracecards’ settings.",
    };
  }
  if (status === 429) {
    return { ok: false, problem: "That’s a lot of searches for Pixabay. Try again in a minute." };
  }
  const page = status === 200 ? parsePixabay(responseJson(response)) : null;
  if (!page) return { ok: false, problem: "Pixabay couldn’t search just now. Try again later." };
  const now = Date.now();
  // Expired pages go as new ones come, so the cache doesn't grow for as long as Obsidian runs.
  for (const [cachedUrl, { time }] of cache) if (now - time >= CACHE_MS) cache.delete(cachedUrl);
  cache.set(url, { page, time: now });
  return { ok: true, page };
}

export function pixabayUrl(key: string, { query, kind, page }: PixabaySearch): string {
  const params = new URLSearchParams({
    key,
    q: query.trim().slice(0, MAX_QUERY),
    image_type: kind,
    safesearch: "true",
    per_page: String(PIXABAY_PAGE_SIZE),
    page: String(page),
  });
  return `https://pixabay.com/api/?${params.toString()}`;
}

/** A page of results from Pixabay's answer, or null when it isn't one. Odd hits are skipped. */
export function parsePixabay(data: unknown): PixabayPage | null {
  if (!isRecord(data) || !Array.isArray(data.hits)) return null;
  const images = data.hits.flatMap((hit: unknown): PixabayImage[] => {
    if (!isRecord(hit)) return [];
    const { id, webformatURL, largeImageURL, tags } = hit;
    if (typeof id !== "number" || typeof webformatURL !== "string") return [];
    if (typeof largeImageURL !== "string") return [];
    return [
      {
        id,
        // Pixabay's way to ask for another size: `_640` in the URL becomes `_340`.
        thumbnail: webformatURL.replace("_640", "_340"),
        medium: webformatURL,
        large: largeImageURL,
        tags: typeof tags === "string" ? tags : "",
      },
    ];
  });
  const total = typeof data.totalHits === "number" ? data.totalHits : images.length;
  return { images, total };
}

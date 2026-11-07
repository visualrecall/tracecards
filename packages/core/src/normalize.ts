// Turns frontmatter into model fields, dropping values of the wrong type. Accepts values
// from our YAML parser and from Obsidian's metadata cache. See spec/vault-format.md.
import type { ParsedFrontmatter } from "./frontmatter";
import { type Bookmark, type Card, type Deck, PAD_SLOTS } from "./model";
import { videoId } from "./youtube";
import { parseCrop } from "./crop";

type DeckFields = Pick<Deck, "icon" | "cover" | "rank" | "pad">;
type CardFields = Omit<Card, "path" | "title">;

export function normalizeDeck(frontmatter: ParsedFrontmatter): DeckFields {
  if (!frontmatter.ok) return {};
  const data = frontmatter.data;
  return {
    icon: text(data.icon),
    cover: linkTarget(data.cover),
    rank: finite(data.rank),
    pad: padSlot(data.pad),
  };
}

export function normalizeCard(frontmatter: ParsedFrontmatter): CardFields {
  if (!frontmatter.ok) return { kind: "idea", bookmarks: [], frontmatterError: frontmatter.error };
  const data = frontmatter.data;
  return {
    id: text(data.id),
    kind: "idea",
    description: text(data.description),
    cover: linkTarget(data.cover),
    coverCrop: parseCrop(data["cover-crop"]),
    rank: finite(data.rank),
    created: timestamp(data.created),
    bookmarks: bookmarks(data.bookmarks),
  };
}

/** A non-empty string, trimmed. */
function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** A slot on the deck pad: a whole number from 1 to `PAD_SLOTS`. */
function padSlot(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= PAD_SLOTS
    ? (value as number)
    : undefined;
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * The target of a wikilink such as `"[[cover.webp]]"` or `"[[cover.webp|alias]]"`, or a plain
 * path. An unquoted `[[cover.webp]]` is parsed by YAML as a nested list, so that's accepted too.
 */
function linkTarget(value: unknown): string | undefined {
  if (Array.isArray(value) && value.length === 1) {
    const [inner] = value as unknown[];
    if (Array.isArray(inner) && inner.length === 1) return text(inner[0]);
    return undefined;
  }
  const raw = text(value);
  if (raw === undefined) return undefined;
  const link = /^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/.exec(raw);
  return link ? text(link[1]) : raw;
}

// A date, or a date and time with an optional offset.
const ISO_8601 = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

/** An ISO 8601 time, kept as written. Obsidian may hand us a Date. */
function timestamp(value: unknown): string | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  const raw = text(value);
  if (raw === undefined || !ISO_8601.test(raw)) return undefined;
  return Number.isNaN(Date.parse(raw)) ? undefined : raw;
}

function bookmarks(value: unknown): Bookmark[] {
  if (!Array.isArray(value)) return [];
  const result: Bookmark[] = [];
  for (const item of value as unknown[]) {
    if (typeof item !== "object" || item === null) continue;
    const fields = item as Record<string, unknown>;
    const url = text(fields.url);
    if (url === undefined) continue;
    // Only the first primary bookmark counts.
    const primary = fields.primary === true && !result.some((bookmark) => bookmark.primary);
    result.push({ url, title: text(fields.title), primary, videoId: videoId(url) });
  }
  return result;
}

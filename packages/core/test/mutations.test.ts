import { describe, expect, it } from "vitest";
import {
  addBookmark,
  type Card,
  coverFileName,
  type Deck,
  editBookmark,
  ensureId,
  type Frontmatter,
  newCardFile,
  parseFrontmatter,
  removeBookmark,
  setPad,
  setCover,
  setCoverCrop,
  setDescription,
  setPrimaryBookmark,
  setRank,
  splitFrontmatter,
} from "../src";

describe("setDescription", () => {
  it("sets the description, and removes it when empty", () => {
    const frontmatter: Frontmatter = { id: "a" };
    setDescription(frontmatter, "Short text");
    expect(frontmatter).toEqual({ id: "a", description: "Short text" });
    setDescription(frontmatter, "");
    expect(frontmatter).toEqual({ id: "a" });
  });
});

describe("setCover and setCoverCrop", () => {
  it("link the image by its bare name, with or without a crop", () => {
    const frontmatter: Frontmatter = { "cover-crop": [0, 0, 1, 1] };
    setCover(frontmatter, "Jobs To Be Done.webp");
    setCoverCrop(frontmatter, undefined);
    expect(frontmatter).toEqual({ cover: "[[Jobs To Be Done.webp]]" });
    setCoverCrop(frontmatter, [0.1, 0.2, 0.5, 0.5]);
    expect(frontmatter).toEqual({
      cover: "[[Jobs To Be Done.webp]]",
      "cover-crop": [0.1, 0.2, 0.5, 0.5],
    });
  });

  it("remove the cover and its crop together", () => {
    const frontmatter: Frontmatter = { cover: "[[a.webp]]", "cover-crop": [0, 0, 1, 1], rank: 2 };
    setCover(frontmatter, null);
    expect(frontmatter).toEqual({ rank: 2 });
  });
});

describe("setRank", () => {
  it("sets the rank, and removes it when undefined", () => {
    const frontmatter: Frontmatter = {};
    setRank(frontmatter, 1.5);
    expect(frontmatter).toEqual({ rank: 1.5 });
    setRank(frontmatter, undefined);
    expect(frontmatter).toEqual({});
  });
});

describe("setPad", () => {
  it("sets the slot, and removes it when detached", () => {
    const frontmatter: Frontmatter = { icon: "book" };
    setPad(frontmatter, 3);
    expect(frontmatter).toEqual({ icon: "book", pad: 3 });
    setPad(frontmatter, null);
    expect(frontmatter).toEqual({ icon: "book" });
  });
});

describe("bookmarks", () => {
  const card = (): Frontmatter => ({
    id: "a",
    bookmarks: [
      { url: "https://example.com/a", title: "A", primary: true, note: "kept" },
      "not a bookmark",
      { url: " https://example.com/b " },
    ],
  });

  it("adds a bookmark at the end, with its title only when it has one", () => {
    const frontmatter = card();
    addBookmark(frontmatter, { url: "https://example.com/c", title: "C" });
    addBookmark(frontmatter, { url: "https://example.com/d", title: "" });
    expect((frontmatter.bookmarks as unknown[]).slice(3)).toEqual([
      { url: "https://example.com/c", title: "C" },
      { url: "https://example.com/d" },
    ]);
  });

  it("starts the list for a card without bookmarks", () => {
    const frontmatter: Frontmatter = { id: "a", bookmarks: null };
    addBookmark(frontmatter, { url: "https://example.com/a" });
    expect(frontmatter).toEqual({ id: "a", bookmarks: [{ url: "https://example.com/a" }] });
  });

  it("edits the bookmark found by its trimmed URL, keeping its other fields", () => {
    const frontmatter = card();
    editBookmark(frontmatter, "https://example.com/a", { url: "https://example.com/a2" });
    editBookmark(frontmatter, "https://example.com/b", {
      url: "https://example.com/b",
      title: "B",
    });
    expect(frontmatter.bookmarks).toEqual([
      { url: "https://example.com/a2", primary: true, note: "kept" },
      "not a bookmark",
      { url: "https://example.com/b", title: "B" },
    ]);
  });

  it("removes a bookmark, and the field with the last one", () => {
    const frontmatter: Frontmatter = { bookmarks: [{ url: "https://example.com/a" }] };
    removeBookmark(frontmatter, "https://example.com/a");
    expect(frontmatter).toEqual({});

    const other = card();
    removeBookmark(other, "https://example.com/b");
    expect(other.bookmarks).toEqual([
      { url: "https://example.com/a", title: "A", primary: true, note: "kept" },
      "not a bookmark",
    ]);
  });

  it("keeps one primary bookmark, or none", () => {
    const frontmatter = card();
    setPrimaryBookmark(frontmatter, "https://example.com/b");
    expect(frontmatter.bookmarks).toEqual([
      { url: "https://example.com/a", title: "A", note: "kept" },
      "not a bookmark",
      { url: " https://example.com/b ", primary: true },
    ]);
    setPrimaryBookmark(frontmatter, null);
    expect(frontmatter.bookmarks).toEqual([
      { url: "https://example.com/a", title: "A", note: "kept" },
      "not a bookmark",
      { url: " https://example.com/b " },
    ]);
  });

  it("fails when the bookmark is gone or the field isn't a list", () => {
    expect(() => removeBookmark(card(), "https://example.com/z")).toThrow("isn't in");
    expect(() => addBookmark({ bookmarks: "text" }, { url: "https://example.com/a" })).toThrow(
      "isn't a list",
    );
  });
});

describe("ensureId", () => {
  const card = (path: string, id?: string): Card => ({
    path,
    title: path,
    kind: "idea",
    bookmarks: [],
    ...(id === undefined ? {} : { id }),
  });
  const deck = (...cards: Card[]): Deck => ({ name: "Ideas", hasDeckFile: false, cards });
  const mine = card("Ideas/Mine.md", "A");
  const decks = [deck(mine, card("Ideas/Other.md", "B"), card("Ideas/Copy.md"))];
  const withId = (id: unknown) => {
    const frontmatter: Frontmatter = { id };
    ensureId(frontmatter, mine, decks, () => "NEW");
    return frontmatter.id;
  };

  it("keeps an id that no other card has", () => {
    expect(withId("A")).toBe("A");
    expect(withId("C")).toBe("C");
  });

  it("replaces a missing, empty or non-string id", () => {
    expect(withId(undefined)).toBe("NEW");
    expect(withId("  ")).toBe("NEW");
    expect(withId(12)).toBe("NEW");
  });

  it("replaces an id another card has", () => {
    expect(withId("B")).toBe("NEW");
    expect(withId(" B ")).toBe("NEW");
  });
});

describe("newCardFile", () => {
  const fields = (text: string) => {
    const { frontmatter, body } = splitFrontmatter(text);
    const parsed = parseFrontmatter(frontmatter ?? "");
    return { data: parsed.ok ? parsed.data : null, body };
  };
  const created = new Date(Date.UTC(2026, 9, 28, 12, 0, 0, 345));

  it("writes the fields in the spec's order, with `created` in UTC to the second", () => {
    const text = newCardFile({
      id: "01J",
      created,
      description: "Short text",
      cover: "Ideas.webp",
      coverCrop: [0.1, 0.2, 0.5, 0.5],
      rank: 3,
    });
    const { data, body } = fields(text);
    expect(Object.entries(data ?? {})).toEqual([
      ["id", "01J"],
      ["description", "Short text"],
      ["cover", "[[Ideas.webp]]"],
      ["cover-crop", [0.1, 0.2, 0.5, 0.5]],
      ["rank", 3],
      ["created", "2026-10-28T12:00:00Z"],
    ]);
    expect(body).toBe("");
  });

  it("writes the bookmarks last, the first one primary", () => {
    const text = newCardFile({
      id: "01J",
      created,
      bookmarks: [
        { url: "https://youtu.be/abcdefghijk", title: "A talk" },
        { url: "https://a.com" },
      ],
    });
    expect(Object.entries(fields(text).data ?? {})).toEqual([
      ["id", "01J"],
      ["created", "2026-10-28T12:00:00Z"],
      [
        "bookmarks",
        [
          { url: "https://youtu.be/abcdefghijk", title: "A talk", primary: true },
          { url: "https://a.com" },
        ],
      ],
    ]);
  });

  it("leaves out what the card doesn't have, and a crop without a cover", () => {
    const text = newCardFile({
      id: "01J",
      created,
      description: "",
      coverCrop: [0, 0, 1, 1],
      bookmarks: [],
    });
    expect(fields(text).data).toEqual({ id: "01J", created: "2026-10-28T12:00:00Z" });
  });
});

describe("coverFileName", () => {
  it.each<[string, string[], string]>([
    ["is the title when the name is free", ["Other.webp"], "Ideas.webp"],
    ["numbers a taken name", ["Ideas.webp"], "Ideas 1.webp"],
    ["ignores letter case", ["IDEAS.WEBP", "ideas 1.webp"], "Ideas 2.webp"],
    ["only counts the same extension", ["Ideas.jpg"], "Ideas.webp"],
  ])("%s", (_, existing, name) => {
    expect(coverFileName("Ideas", "webp", existing)).toBe(name);
  });
});

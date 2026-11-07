import { describe, expect, it } from "vitest";
import { buildVault, findCard, isCardPath, type VaultEntry } from "../src";

describe("isCardPath", () => {
  it.each(["Ideas/Jobs To Be Done.md", "Ideas/Books/Thinking, Fast and Slow.md"])(
    "accepts %j",
    (path) => {
      expect(isCardPath(path)).toBe(true);
    },
  );

  it.each([
    "Jobs To Be Done.md",
    "Ideas/_deck.md",
    "Ideas/Books/_deck.md",
    "Ideas/cover.png",
    "Ideas/Board.canvas",
    "attachments/Notes.md",
    ".trash/Ideas.md",
    "Ideas/.drafts/Draft.md",
  ])("rejects %j", (path) => {
    expect(isCardPath(path)).toBe(false);
  });
});

describe("findCard", () => {
  const file = (path: string): VaultEntry => ({
    type: "file",
    path,
    frontmatter: { ok: true, data: {} },
  });
  const { decks } = buildVault([
    { type: "folder", path: "Ideas" },
    { type: "folder", path: "Ideas/Books" },
    file("Ideas/Jobs To Be Done.md"),
    file("Ideas/Books/Thinking, Fast and Slow.md"),
    { type: "folder", path: "Reading" },
    file("Reading/Jobs To Be Done.md"),
  ]);

  it("finds a card in its deck, or in a folder inside it", () => {
    expect(findCard(decks, "Reading/Jobs To Be Done.md")?.path).toBe("Reading/Jobs To Be Done.md");
    expect(findCard(decks, "Ideas/Books/Thinking, Fast and Slow.md")?.title).toBe(
      "Thinking, Fast and Slow",
    );
  });

  it("finds nothing for a path that isn't a card", () => {
    expect(findCard(decks, "Ideas/Missing.md")).toBeUndefined();
    expect(findCard(decks, "Missing/Jobs To Be Done.md")).toBeUndefined();
  });
});

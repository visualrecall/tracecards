import { describe, expect, it } from "vitest";
import { type Bookmark, bookmarkHost, bookmarkName, bookmarkUrl, sameBookmark } from "../src";

describe("bookmarkUrl", () => {
  it.each<[string, string, string | null]>([
    ["adds https:// to a bare host", "example.com", "https://example.com"],
    [
      "keeps the URL as entered",
      " http://Example.com/a?utm_source=x#top ",
      "http://Example.com/a?utm_source=x#top",
    ],
    ["keeps a video's time", "youtu.be/dQw4w9WgXcQ?t=95", "https://youtu.be/dQw4w9WgXcQ?t=95"],
    ["accepts a port", "localhost:3000/notes", "https://localhost:3000/notes"],
    ["accepts an IP address", "192.168.1.10:8080", "https://192.168.1.10:8080"],
    ["rejects a word", "hello", null],
    ["rejects text with spaces", "example.com/a b", null],
    ["rejects other schemes", "ftp://example.com/file", null],
    ["rejects mail addresses", "mailto:someone@example.com", null],
    ["rejects an empty host", "https:///path", null],
    ["rejects empty text", "  ", null],
  ])("%s", (_, input, url) => {
    expect(bookmarkUrl(input)).toBe(url);
  });
});

describe("sameBookmark", () => {
  it.each<[string, string, string, boolean]>([
    ["ignores the scheme", "http://example.com/a", "https://example.com/a", true],
    ["ignores www.", "https://www.example.com/a", "https://example.com/a", true],
    ["ignores the host's case", "https://Example.COM/a", "https://example.com/a", true],
    ["ignores a final slash", "https://example.com/a/", "https://example.com/a", true],
    [
      "ignores a final slash before a query",
      "https://example.com/?q=1",
      "https://example.com?q=1",
      true,
    ],
    ["compares paths with their case", "https://example.com/A", "https://example.com/a", false],
    ["compares queries", "https://example.com/a?page=2", "https://example.com/a", false],
    [
      "compares videos by id",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10",
      "https://youtu.be/dQw4w9WgXcQ",
      true,
    ],
    ["tells videos apart", "https://youtu.be/dQw4w9WgXcQ", "https://youtu.be/aaaaaaaaaaa", false],
  ])("%s", (_, a, b, same) => {
    expect(sameBookmark(a, b)).toBe(same);
  });
});

describe("bookmarkName", () => {
  const bookmark = (url: string, fields: Partial<Bookmark> = {}): Bookmark => ({
    url,
    primary: false,
    ...fields,
  });

  it.each<[string, Bookmark, string]>([
    ["is the title", bookmark("https://example.com/a", { title: "A page" }), "A page"],
    [
      "is the path's last part, with spaces",
      bookmark("https://example.com/blog/My_Great-Post/?ref=x"),
      "My Great Post",
    ],
    ["decodes the path", bookmark("https://example.com/caf%C3%A9"), "café"],
    ["keeps bad escapes", bookmark("https://example.com/100%"), "100%"],
    ["is the host without a path", bookmark("https://www.example.com/"), "example.com"],
    [
      "is the host when the path has no letters",
      bookmark("https://example.com/--/"),
      "example.com",
    ],
    [
      "is “YouTube video” for an untitled video",
      bookmark("https://youtu.be/dQw4w9WgXcQ", { videoId: "dQw4w9WgXcQ" }),
      "YouTube video",
    ],
  ])("%s", (_, input, name) => {
    expect(bookmarkName(input)).toBe(name);
  });
});

describe("bookmarkHost", () => {
  it("is the host without www., in lower case", () => {
    expect(bookmarkHost("https://WWW.Example.com:8080/a")).toBe("example.com:8080");
    expect(bookmarkHost("https://youtu.be/dQw4w9WgXcQ")).toBe("youtu.be");
  });
});

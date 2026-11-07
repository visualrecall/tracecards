import { describe, expect, it } from "vitest";
import { newFile, parseFrontmatter, splitFrontmatter } from "../src";

describe("splitFrontmatter", () => {
  it.each([
    ["no frontmatter", "Just text\n", null, "Just text\n"],
    ["frontmatter and body", "---\na: 1\n---\nBody\n", "a: 1\n", "Body\n"],
    ["empty frontmatter", "---\n---\nBody", "", "Body"],
    ["closing line at the end of the file", "---\na: 1\n---", "a: 1\n", ""],
    ["a BOM", "\uFEFF---\na: 1\n---\nBody", "a: 1\n", "Body"],
    ["CRLF line endings", "---\r\na: 1\r\nb: 2\r\n---\r\nBody\r\n", "a: 1\r\nb: 2\r\n", "Body\r\n"],
    ["trailing spaces on the --- lines", "--- \na: 1\n---\t\nBody", "a: 1\n", "Body"],
    ["no closing line", "---\na: 1\nBody\n", null, "---\na: 1\nBody\n"],
    ["---- is not a closing line", "---\na: 1\n----\n", null, "---\na: 1\n----\n"],
    ["--- not on the first line", "\n---\na: 1\n---\n", null, "\n---\na: 1\n---\n"],
    ["a later --- in the body", "---\na: 1\n---\nBody\n---\nMore\n", "a: 1\n", "Body\n---\nMore\n"],
  ])("handles %s", (_, text, frontmatter, body) => {
    expect(splitFrontmatter(text)).toEqual({ frontmatter, body });
  });
});

describe("parseFrontmatter", () => {
  it("keeps dates as strings", () => {
    expect(parseFrontmatter("created: 2026-10-28T12:00:00Z\nday: 2026-10-28\n")).toEqual({
      ok: true,
      data: { created: "2026-10-28T12:00:00Z", day: "2026-10-28" },
    });
  });

  it("reads YAML 1.2 booleans and numbers", () => {
    expect(parseFrontmatter("a: yes\nb: true\nc: 1.5\nd: 0x10\n")).toEqual({
      ok: true,
      data: { a: "yes", b: true, c: 1.5, d: 16 },
    });
  });

  it("treats empty frontmatter as no properties", () => {
    expect(parseFrontmatter("")).toEqual({ ok: true, data: {} });
    expect(parseFrontmatter("# just a comment\n")).toEqual({ ok: true, data: {} });
  });

  it.each([
    ["invalid YAML", "a: [unclosed\n"],
    ["a duplicate key", "a: 1\na: 2\n"],
    ["a list", "- a\n- b\n"],
    ["a scalar", "hello\n"],
  ])("reports %s as an error", (_, yaml) => {
    const result = parseFrontmatter(yaml);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toBeTruthy();
  });
});

describe("newFile", () => {
  it("writes the fields as frontmatter, followed by the body", () => {
    expect(newFile({ icon: "book-open", rank: 1.5 })).toBe(
      "---\nicon: book-open\nrank: 1.5\n---\n",
    );
    expect(newFile({ cover: "[[Jobs To Be Done]]" }, "Notes\n")).toBe(
      '---\ncover: "[[Jobs To Be Done]]"\n---\nNotes\n',
    );
  });

  it("reads back the same fields", () => {
    const fields = { description: "A long description ".repeat(10).trim(), rank: 2 };
    const { frontmatter } = splitFrontmatter(newFile(fields));
    expect(parseFrontmatter(frontmatter ?? "")).toEqual({ ok: true, data: fields });
  });
});

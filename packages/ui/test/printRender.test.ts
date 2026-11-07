import { describe, expect, it } from "vitest";
import { clampLines, type Measure, wrapText } from "../src/printRender";

/** Every character is 10 wide, so a width of 50 holds five. */
const measure: Measure = (text) => text.length * 10;

describe("wrapText", () => {
  it("breaks at spaces", () => {
    expect(wrapText("one two three four", 100, measure)).toEqual(["one two", "three four"]);
  });

  it("breaks inside a word that's too long for a line", () => {
    expect(wrapText("abcdefghijkl", 50, measure)).toEqual(["abcde", "fghij", "kl"]);
  });

  it("keeps the text's own line breaks, and its empty lines", () => {
    expect(wrapText("a\n\nb", 50, measure)).toEqual(["a", "", "b"]);
  });

  it("starts a long word on a new line after a short one", () => {
    expect(wrapText("hi abcdefg", 50, measure)).toEqual(["hi", "abcde", "fg"]);
  });

  it("doesn't split an emoji, which is two code units", () => {
    expect(wrapText("😀😀😀", 40, measure)).toEqual(["😀😀", "😀"]);
  });

  it("breaks after a hyphen between letters, as a browser does", () => {
    expect(wrapText("state-of-the-art", 100, measure)).toEqual(["state-of-", "the-art"]);
    expect(wrapText("ab state-of", 100, measure)).toEqual(["ab state-", "of"]);
  });

  it("doesn't break after a hyphen that isn't between letters or digits", () => {
    expect(wrapText("-5 -x a-", 30, measure)).toEqual(["-5", "-x", "a-"]);
  });

  it("breaks after a dash", () => {
    expect(wrapText("one—two—three", 80, measure)).toEqual(["one—two—", "three"]);
  });

  it("breaks between Chinese, Japanese and Korean characters", () => {
    expect(wrapText("日本語のテキスト", 40, measure)).toEqual(["日本語の", "テキスト"]);
  });
});

describe("clampLines", () => {
  it("leaves lines that fit as they are", () => {
    expect(clampLines(["a", "b"], 3, 50, measure)).toEqual(["a", "b"]);
  });

  it("cuts to the most lines and ends the last in an ellipsis that fits", () => {
    expect(clampLines(["abcde", "fghij", "klmno"], 2, 50, measure)).toEqual(["abcde", "fghi…"]);
  });
});

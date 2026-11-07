import { describe, expect, it } from "vitest";
import {
  cutText,
  MAX_DESCRIPTION,
  MAX_TITLE,
  pasteIntoTitle,
  splitTitle,
} from "../src/cardActions";

describe("cutText", () => {
  it("cuts text to the length", () => {
    expect(cutText("abcdef", 4)).toBe("abcd");
    expect(cutText("abc", 4)).toBe("abc");
  });

  it("doesn't split an emoji, which is two code units", () => {
    expect(cutText("ab😀", 3)).toBe("ab");
    expect(cutText("ab😀", 4)).toBe("ab😀");
  });

  it("gives nothing for no room", () => {
    expect(cutText("abc", 0)).toBe("");
    expect(cutText("abc", -5)).toBe("");
  });
});

describe("splitTitle, for Enter in the title", () => {
  it("starts the description with what's after the cursor", () => {
    expect(splitTitle("Title more", 5, 5, "Old")).toEqual({
      title: "Title",
      description: " more\nOld",
      caret: 0,
    });
  });

  it("does nothing with nothing after the cursor", () => {
    expect(splitTitle("Title  ", 5, 5, "Old")).toBeNull();
  });

  it("moves nothing when the description has no room, so nothing is cut", () => {
    const full = "x".repeat(MAX_DESCRIPTION - 3);
    expect(splitTitle("Title ab", 5, 5, full)).toBeNull();
    expect(splitTitle("Title a", 5, 5, full)?.description).toBe(` a\n${full}`);
  });

  it("never cuts a description already over the limit", () => {
    const long = "y".repeat(MAX_DESCRIPTION + 50);
    expect(splitTitle("Title more", 5, 5, long)).toBeNull();
  });
});

describe("pasteIntoTitle", () => {
  it("lets the title take text of one line itself", () => {
    expect(pasteIntoTitle("Title", 5, 5, "one line", "")).toBeNull();
  });

  it("puts the first line in the title and the rest above the description", () => {
    expect(pasteIntoTitle("Ab", 1, 1, "X\nY Z", "Old")).toEqual({
      title: "AX",
      description: "Y Zb\nOld",
      caret: 3,
    });
  });

  it("cuts only the pasted text, never the description that was there", () => {
    const long = "y".repeat(MAX_DESCRIPTION + 50);
    const change = pasteIntoTitle("Title", 5, 5, "\nA\nB", long);
    expect(change?.description).toBe(long);
    expect(change?.caret).toBe(0);
  });

  it("keeps what was after the cursor in the title", () => {
    const description = "d".repeat(MAX_DESCRIPTION - 10);
    const change = pasteIntoTitle("Title tail", 5, 5, "X\nPasted words", description);
    // " tail", the line break and the description take 176, leaving 4 for the pasted text.
    expect(change?.description).toBe(`Past tail\n${description}`);
    expect(change?.caret).toBe(4);
  });

  it("cuts the pasted text to the description's limit", () => {
    const change = pasteIntoTitle("", 0, 0, `T\n${"w".repeat(500)}`, "");
    expect(change?.description).toHaveLength(MAX_DESCRIPTION);
  });

  it("cuts the title to its limit", () => {
    const change = pasteIntoTitle("", 0, 0, `${"t".repeat(100)}\nRest`, "");
    expect(change?.title).toHaveLength(MAX_TITLE);
  });
});

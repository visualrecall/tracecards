import { describe, expect, it } from "vitest";
import { validateTitle } from "../src";

describe("validateTitle", () => {
  it.each([
    ["Jobs To Be Done", "Jobs To Be Done"],
    ["  Second-Order Thinking  ", "Second-Order Thinking"],
    ["Thinking, Fast and Slow", "Thinking, Fast and Slow"],
    ["Ideas (2026) & notes!", "Ideas (2026) & notes!"],
    ["日本語のカード", "日本語のカード"],
    ["v1.2", "v1.2"],
  ])("accepts %j", (input, title) => {
    expect(validateTitle(input, "card")).toEqual({ ok: true, title });
  });

  it.each(["", "   "])("rejects empty title %j", (input) => {
    expect(validateTitle(input, "card")).toEqual({ ok: false, reason: "empty" });
  });

  it.each(["*", '"', "\\", "/", "<", ">", ":", "|", "?", "#", "^", "[", "]"])(
    "rejects %j",
    (character) => {
      expect(validateTitle(`a${character}b`, "card")).toEqual({
        ok: false,
        reason: "forbidden-character",
        character,
      });
    },
  );

  it("rejects a leading dot", () => {
    expect(validateTitle(".hidden", "deck")).toEqual({ ok: false, reason: "leading-dot" });
  });

  it("reserves _deck for cards and attachments for decks", () => {
    expect(validateTitle("_deck", "card")).toEqual({ ok: false, reason: "reserved" });
    expect(validateTitle("Attachments", "deck")).toEqual({ ok: false, reason: "reserved" });
    expect(validateTitle("_deck", "deck")).toEqual({ ok: true, title: "_deck" });
    expect(validateTitle("attachments", "card")).toEqual({ ok: true, title: "attachments" });
  });
});

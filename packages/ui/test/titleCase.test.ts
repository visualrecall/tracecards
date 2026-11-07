import { describe, expect, it } from "vitest";
import { shownTitle, toTitleCase } from "../src/titleCase";

describe("toTitleCase", () => {
  it("starts each word with a capital, but the small words in the middle", () => {
    expect(toTitleCase("focus on systems, not goals")).toBe("Focus on Systems, Not Goals");
    expect(toTitleCase("the power of now")).toBe("The Power of Now");
    expect(toTitleCase("less is more")).toBe("Less Is More");
  });

  it("capitalizes a small word that ends the title or starts a part of it", () => {
    expect(toTitleCase("what it is for")).toBe("What It Is For");
    expect(toTitleCase("rule one: the basics")).toBe("Rule One: The Basics");
  });

  it("capitalizes the parts of a joined word, but small words inside it", () => {
    expect(toTitleCase("jobs-to-be-done")).toBe("Jobs-to-Be-Done");
    expect(toTitleCase("sign-in for beginners")).toBe("Sign-In for Beginners");
    expect(toTitleCase("the 80/20 rule")).toBe("The 80/20 Rule");
  });

  it("keeps what follows an apostrophe, and capitalizes after a quote or bracket", () => {
    expect(toTitleCase("don't repeat yourself")).toBe("Don't Repeat Yourself");
    expect(toTitleCase("why 'first principles' matter")).toBe("Why 'First Principles' Matter");
    expect(toTitleCase("the art of war (and peace)")).toBe("The Art of War (and Peace)");
  });

  it("keeps words with a capital, links and abbreviations as typed", () => {
    expect(toTitleCase("iPhone and macOS tips")).toBe("iPhone and macOS Tips");
    expect(toTitleCase("what is a URL?")).toBe("What Is a URL?");
    expect(toTitleCase("see example.com for more")).toBe("See example.com for More");
    expect(toTitleCase("e.g. this one")).toBe("e.g. This One");
  });

  it("leaves Georgian, which has no capitals for starting words, as it is", () => {
    expect(toTitleCase("ბიზნეს იდეები")).toBe("ბიზნეს იდეები");
  });

  it("keeps the title's length, so a click in the shown title finds the same place", () => {
    for (const title of ["straße and ß", "  spaced   out  ", "café au lait", "ﬁrst ﬂoor"]) {
      expect(toTitleCase(title)).toHaveLength(title.length);
    }
  });
});

describe("shownTitle", () => {
  it("shows the title in title case, or as typed", () => {
    expect(shownTitle("slow down to go faster", "title")).toBe("Slow Down to Go Faster");
    expect(shownTitle("slow down to go faster", "none")).toBe("slow down to go faster");
  });
});

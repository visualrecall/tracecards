import { useHost } from "./host";

/**
 * How cards show their titles: in title case, or as typed. Only what's shown changes: the files
 * keep the title as it was typed, and so does the field that edits it. Each value can become an
 * option in the settings.
 */
export const TITLE_CASES = ["title", "none"] as const;
export type TitleCase = (typeof TITLE_CASES)[number];

/** Card titles are in title case unless the user chooses otherwise. */
export const DEFAULT_TITLE_CASE: TitleCase = "title";

/** A card's title as cards show it. It has as many characters as the title, so offsets match. */
export function shownTitle(title: string, titleCase: TitleCase): string {
  return titleCase === "title" ? toTitleCase(title) : title;
}

/** A card's title as cards show it, by the user's choice. */
export function useShownTitle(title: string): string {
  return shownTitle(title, useHost().titleCase());
}

/**
 * Short words a title keeps in lowercase, unless they start or end it or a sentence. The same
 * list as the `title-case` package's, so titles read as they do in other tools that use it.
 */
const SMALL_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "because",
  "but",
  "by",
  "en",
  "for",
  "if",
  "in",
  "neither",
  "nor",
  "of",
  "on",
  "only",
  "or",
  "over",
  "per",
  "so",
  "some",
  "than",
  "that",
  "the",
  "to",
  "up",
  "upon",
  "v",
  "versus",
  "via",
  "vs",
  "when",
  "with",
  "without",
  "yet",
]);

/** What joins the parts of a word that are each capitalized, as in "Jobs-to-Be-Done" or "And/Or". */
const JOINERS = new Set(["-", "–", "—", "―", "/"]);

/** A word that ends a sentence or a part of the title, so the next word starts one. */
const ENDS_PART = /[.!?:]["'”’)\]]*$/u;

/** Letters and digits: the words within a run of text between spaces. */
const WORD = /[\p{L}\p{N}]+/gu;

/** Links, email addresses, tags and abbreviations such as "e.g.", which are kept as typed. */
const KEPT_AS_TYPED = /[.#@][\p{L}\p{N}]/u;

/**
 * Text in title case: each word starts with a capital, except the small words in the middle.
 * It only ever capitalizes. Words with a capital already, such as "iPhone", "macOS" or "NASA",
 * stay as typed, and so do links. Scripts that don't capitalize the first letter of a word, such as
 * Georgian, are left alone.
 */
export function toTitleCase(text: string): string {
  const runs = text.split(/(\s+)/u);
  let last = -1;
  runs.forEach((run, index) => {
    if (run.trim() !== "") last = index;
  });
  let startsPart = true;
  return runs
    .map((run, index) => {
      if (run.trim() === "") return run;
      const shown = KEPT_AS_TYPED.test(run)
        ? run
        : capitalizeRun(run, { first: startsPart, last: index === last });
      startsPart = ENDS_PART.test(run);
      return shown;
    })
    .join("");
}

/** A run of text between spaces in title case, as `toTitleCase` describes. */
function capitalizeRun(run: string, at: { first: boolean; last: boolean }): string {
  const words = [...run.matchAll(WORD)];
  let shown = run;
  words.forEach(({ 0: word, index }, nth) => {
    if (/\p{Lu}/u.test(word)) return;
    const before = run.charAt(index - 1);
    const after = run.charAt(index + word.length);
    // A word after an apostrophe, as in "don't" or "apple's", is part of the word before it.
    if (nth > 0 && !JOINERS.has(before)) return;
    // A small word stays small in the middle of a joined word, as "to" in "Jobs-to-Be-Done", and
    // on its own unless it ends the title or a sentence. The first word is always capitalized.
    if (SMALL_WORDS.has(word) && !(nth === 0 && at.first)) {
      const stays =
        nth > 0 ? JOINERS.has(after) : words.length === 1 && !at.last && !ENDS_PART.test(run);
      if (stays) return;
    }
    shown = shown.slice(0, index) + capital(word.charAt(0)) + shown.slice(index + 1);
  });
  return shown;
}

/**
 * The letter as it starts a word in a title. Georgian has capitals for writing in all caps only,
 * so its letters stay as they are, and so does any letter whose capital would be two letters,
 * such as "ß", so the shown title keeps the typed title's length.
 */
function capital(letter: string): string {
  if (/\p{Script=Georgian}/u.test(letter)) return letter;
  const upper = letter.toUpperCase();
  return upper.length === letter.length ? upper : letter;
}

import { ATTACHMENTS, DECK_FILE, type TitleKind, type TitleProblem } from "@tracecards/core";

/** What to tell the user about a deck name or card title that `validateTitle` turned down. */
export function titleProblemMessage(problem: TitleProblem, kind: TitleKind): string {
  const titles = kind === "deck" ? "Names" : "Titles";
  switch (problem.reason) {
    case "empty":
      return kind === "deck" ? "Enter a name." : "Enter a title.";
    case "forbidden-character":
      return `${titles} can’t contain “${problem.character}”.`;
    case "leading-dot":
      return `${titles} can’t start with a dot.`;
    case "reserved":
      return kind === "deck"
        ? `“${ATTACHMENTS}” is the folder for images.`
        : `“${DECK_FILE.slice(0, -".md".length)}” is the file for deck settings.`;
  }
}

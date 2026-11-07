import { ATTACHMENTS, DECK_FILE } from "./vault";

// Characters that are invalid in file names on some platforms or that break
// Obsidian links. See "Cards" in spec/vault-format.md.
const FORBIDDEN = /[*"\\/<>:|?#^[\]]/;

export type TitleKind = "card" | "deck";

export type TitleProblem =
  | { reason: "empty" }
  | { reason: "forbidden-character"; character: string }
  | { reason: "leading-dot" }
  | { reason: "reserved" };

export type TitleCheck = { ok: true; title: string } | ({ ok: false } & TitleProblem);

/** Checks a title the user typed for a card or deck. A valid title comes back trimmed. */
export function validateTitle(input: string, kind: TitleKind): TitleCheck {
  const title = input.trim();
  if (title === "") return { ok: false, reason: "empty" };

  const forbidden = FORBIDDEN.exec(title);
  if (forbidden) return { ok: false, reason: "forbidden-character", character: forbidden[0] };

  // Names starting with a dot are hidden, and the vault ignores them.
  if (title.startsWith(".")) return { ok: false, reason: "leading-dot" };

  const reserved = kind === "card" ? DECK_FILE.slice(0, -".md".length) : ATTACHMENTS;
  if (title.toLowerCase() === reserved) return { ok: false, reason: "reserved" };

  return { ok: true, title };
}

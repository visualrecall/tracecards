// Conflicts between versions of a card or `_deck.md`, following "Conflicts" in
// spec/vault-format.md: which parts of the versions differ, what the parts a person picks make of
// the file, and the waiting versions kept in `.tracecards/versions/` until they pick.
import { parseFrontmatter, splitFrontmatter } from "./frontmatter";
import { DECK_FILE } from "./vault";

/** The folder that holds waiting versions, from the vault's root. */
export const VERSIONS_FOLDER = ".tracecards/versions";

/** A version of a card or `_deck.md` that waits for the person to choose, as its file holds it. */
export interface WaitingVersion {
  /** The path of the file it's a version of, as it was when the conflict was noticed. */
  file: string;
  /** The card's id, when it has one. */
  id?: string;
  /** When it was saved, in UTC, as ISO 8601, when the sync tool says. */
  saved?: string;
  /** The name of the device that saved it, when the sync tool says. */
  device?: string;
  /** The version's whole content. */
  text: string;
}

/** A part of a file that the person picks from one version, in the order the spec lists them. */
export type ConflictPart =
  "cover" | "description" | "note" | "bookmarks" | "icon" | "properties" | "file";

/** For each part that differs, the index in the waiting versions of the one picked. */
export type ConflictChoice = Partial<Record<ConflictPart, number>>;

/**
 * What resolving writes: nothing (null), the fields and note, or the whole text when the
 * frontmatter of a version isn't valid YAML. The note has no BOM and LF line endings.
 */
export type ConflictResult =
  { fields: Record<string, unknown>; note: string } | { text: string } | null;

const PARTS = ["cover", "description", "note", "bookmarks", "icon", "properties"] as const;

/** The fields of each part made of named fields. */
const PART_FIELDS: Record<"cover" | "description" | "bookmarks" | "icon", readonly string[]> = {
  cover: ["cover", "cover-crop"],
  description: ["description"],
  bookmarks: ["bookmarks"],
  icon: ["icon"],
};

/** The file's identity and place, which it keeps whatever's picked. */
const OWN_FIELDS = ["id", "created", "rank", "pad"];

/** Fields that aren't in `properties`. */
const NAMED_FIELDS = new Set([...Object.values(PART_FIELDS).flat(), ...OWN_FIELDS]);

interface Version {
  fields: Record<string, unknown>;
  note: string;
}

/** The parts that differ between the file and any of its waiting versions. */
export function conflictParts(file: string, versions: readonly string[]): ConflictPart[] {
  const own = read(file);
  const others = versions.map(read);
  if (own === null || others.some((other) => other === null)) {
    const text = normalize(file);
    return versions.some((version) => normalize(version) !== text) ? ["file"] : [];
  }
  return PARTS.filter((part) =>
    others.some((other) => !sameValue(partValue(part, own), partValue(part, other!))),
  );
}

/**
 * What the file becomes with the parts the person picked, or null when that's the file as it is,
 * so nothing is written. A choice for a part that doesn't differ changes nothing.
 */
export function resolveConflict(
  file: string,
  versions: readonly string[],
  choice: ConflictChoice,
): ConflictResult {
  const picked = (part: ConflictPart): string | null => {
    const index = choice[part];
    if (index === undefined) return null;
    const version = versions[index];
    if (version === undefined) throw new RangeError(`There's no waiting version ${index}.`);
    return version;
  };
  const parts = conflictParts(file, versions);

  if (parts.includes("file")) {
    const text = picked("file");
    return text === null || normalize(text) === normalize(file) ? null : { text };
  }

  const own = read(file)!;
  const fields = { ...own.fields };
  let note = own.note;
  for (const part of parts) {
    const text = picked(part);
    if (text === null) continue;
    const other = read(text)!;
    if (part === "note") {
      note = other.note;
      continue;
    }
    for (const name of fieldsOf(part, own, other)) {
      if (Object.hasOwn(other.fields, name)) fields[name] = other.fields[name];
      else delete fields[name];
    }
  }
  const result = { fields, note };
  return sameValue(result, own) ? null : result;
}

/**
 * The path of the card or `_deck.md` a waiting version belongs to: the card with its id (the one
 * whose path sorts first when several share it, as that one keeps the id), or else the file at its
 * path, or null when there's neither.
 */
export function waitingVersionOwner(
  version: Pick<WaitingVersion, "file" | "id">,
  files: readonly { path: string; id?: string }[],
): string | null {
  if (version.id !== undefined) {
    // The default sort compares UTF-16 code units, as the spec's rule for ids does.
    const [keeper] = files
      .filter((file) => file.id === version.id)
      .map((file) => file.path)
      .sort();
    if (keeper !== undefined) return keeper;
  }
  return files.some((file) => file.path === version.file) ? version.file : null;
}

/**
 * Whether two waiting versions are the same version: with the same text, and of the same card by
 * its id when both have one, or else of the same path.
 */
export function sameWaitingVersion(a: WaitingVersion, b: WaitingVersion): boolean {
  const sameFile = a.id !== undefined && b.id !== undefined ? a.id === b.id : a.file === b.file;
  return sameFile && a.text === b.text;
}

/**
 * The file name for a waiting version in `VERSIONS_FOLDER`: the card's title, or the deck's name
 * for a `_deck.md`, and the time it was saved in UTC, to the second
 * (`Jobs To Be Done 20261118-140312.json`). Two devices that notice the same conflict then
 * usually pick the same name. ` 1`, ` 2` and so on are added while `taken` says a file of that
 * name holds another version. It should ignore letter case, as file systems on macOS and Windows
 * do.
 */
export function waitingVersionName(
  file: string,
  saved: Date,
  taken: (name: string) => boolean,
): string {
  const segments = file.split("/");
  const fileName = segments[segments.length - 1] ?? file;
  const label =
    fileName === DECK_FILE
      ? (segments[segments.length - 2] ?? fileName)
      : fileName.replace(/\.md$/, "");
  const base = `${label} ${utcTimestamp(saved)}`;
  let name = `${base}.json`;
  for (let number = 1; taken(name); number++) {
    name = `${base} ${number}.json`;
  }
  return name;
}

/** Reads a waiting version's file, or null when it isn't one. */
export function parseWaitingVersion(json: string): WaitingVersion | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const { file, id, saved, device, text } = data as Record<string, unknown>;
  if (typeof file !== "string" || typeof text !== "string") return null;
  const version: WaitingVersion = { file, text };
  if (typeof id === "string") version.id = id;
  if (typeof saved === "string") version.saved = saved;
  if (typeof device === "string") version.device = device;
  return version;
}

/** The text of a waiting version's file. */
export function waitingVersionFile(version: WaitingVersion): string {
  const { file, id, saved, device, text } = version;
  return `${JSON.stringify({ file, id, saved, device, text }, null, 2)}\n`;
}

/** A version's fields and note, or null when its frontmatter isn't valid YAML. */
function read(text: string): Version | null {
  const { frontmatter, body } = splitFrontmatter(text);
  const parsed = frontmatter === null ? null : parseFrontmatter(frontmatter);
  if (parsed && !parsed.ok) return null;
  return { fields: parsed?.data ?? {}, note: normalize(body) };
}

/** Text without a BOM and with LF line endings. */
function normalize(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function partValue(part: (typeof PARTS)[number], version: Version): unknown {
  if (part === "note") return version.note;
  return pick(
    version.fields,
    part === "properties"
      ? (name) => !NAMED_FIELDS.has(name)
      : (name) => PART_FIELDS[part].includes(name),
  );
}

/** The names of the fields a part changes, from either version. */
function fieldsOf(part: ConflictPart, own: Version, other: Version): string[] {
  if (part === "properties") {
    const names = new Set([...Object.keys(own.fields), ...Object.keys(other.fields)]);
    return [...names].filter((name) => !NAMED_FIELDS.has(name));
  }
  return part in PART_FIELDS ? [...PART_FIELDS[part as keyof typeof PART_FIELDS]] : [];
}

function pick(
  fields: Record<string, unknown>,
  keep: (name: string) => boolean,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([name]) => keep(name)));
}

/** Whether two values read from YAML are the same, whatever the order of their fields. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((each, index) => sameValue(each, b[index]))
    );
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const aFields = a as Record<string, unknown>;
  const bFields = b as Record<string, unknown>;
  const names = Object.keys(aFields);
  return (
    names.length === Object.keys(bFields).length &&
    names.every((name) => Object.hasOwn(bFields, name) && sameValue(aFields[name], bFields[name]))
  );
}

/** The date and time in UTC as `20261118-140312`, for a file name. */
function utcTimestamp(date: Date): string {
  const two = (value: number) => String(value).padStart(2, "0");
  const day = `${date.getUTCFullYear()}${two(date.getUTCMonth() + 1)}${two(date.getUTCDate())}`;
  return `${day}-${two(date.getUTCHours())}${two(date.getUTCMinutes())}${two(date.getUTCSeconds())}`;
}

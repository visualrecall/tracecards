import { Document, parseDocument } from "yaml";

export interface SplitFile {
  /** The YAML between the `---` lines, or null when the file has no frontmatter. */
  frontmatter: string | null;
  body: string;
}

const OPENING = /^\uFEFF?---[ \t]*\r?\n/;
const CLOSING = /^---[ \t]*(?:\r?\n|$)/m;

/** Splits a markdown file into its frontmatter and body. Handles a BOM and CRLF line endings. */
export function splitFrontmatter(text: string): SplitFile {
  const opening = OPENING.exec(text);
  if (!opening) return { frontmatter: null, body: text };

  const rest = text.slice(opening[0].length);
  const closing = CLOSING.exec(rest);
  if (!closing) return { frontmatter: null, body: text };

  return {
    frontmatter: rest.slice(0, closing.index),
    body: rest.slice(closing.index + closing[0].length),
  };
}

export type ParsedFrontmatter =
  { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

/**
 * Parses frontmatter YAML. Uses the YAML 1.2 core schema, so values such as dates stay
 * strings, as they are in Obsidian.
 */
export function parseFrontmatter(yaml: string): ParsedFrontmatter {
  const doc = parseDocument(yaml, { schema: "core" });
  const [error] = doc.errors;
  if (error) return { ok: false, error: error.message };

  const data: unknown = doc.toJS();
  if (data === null || data === undefined) return { ok: true, data: {} };
  if (typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "Frontmatter must be a set of properties." };
  }
  return { ok: true, data: data as Record<string, unknown> };
}

/**
 * The text of a new markdown file with these frontmatter fields: UTF-8 with LF line endings, as
 * the spec's writing rules ask. Long values stay on one line.
 */
export function newFile(fields: Record<string, unknown>, body = ""): string {
  const yaml = new Document(fields, { schema: "core" }).toString({ lineWidth: 0 });
  return `---\n${yaml}---\n${body}`;
}

// Runs every case in spec/fixtures: reads the case's vault folder the way an app would and
// compares the result with its expected.json.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildVault,
  parseFrontmatter,
  splitFrontmatter,
  type Vault,
  type VaultEntry,
} from "../src";

const FIXTURES = join(import.meta.dirname, "../../../spec/fixtures");

const cases = readdirSync(FIXTURES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

describe("spec fixtures", () => {
  it.each(cases)("%s", (name) => {
    const vault = buildVault(listVault(join(FIXTURES, name, "vault")));
    const expected: unknown = JSON.parse(
      readFileSync(join(FIXTURES, name, "expected.json"), "utf8"),
    );
    expect(asFixtureJson(vault)).toEqual(expected);
  });
});

function listVault(root: string): VaultEntry[] {
  return readdirSync(root, { recursive: true, withFileTypes: true }).map((dirent): VaultEntry => {
    const absolute = join(dirent.parentPath, dirent.name);
    const path = relative(root, absolute).split(sep).join("/");
    if (dirent.isDirectory()) return { type: "folder", path };
    if (!path.endsWith(".md")) return { type: "file", path, frontmatter: { ok: true, data: {} } };

    const { frontmatter } = splitFrontmatter(readFileSync(absolute, "utf8"));
    return {
      type: "file",
      path,
      frontmatter: frontmatter === null ? { ok: true, data: {} } : parseFrontmatter(frontmatter),
    };
  });
}

/** The vault as expected.json writes it: no undefined fields, and frontmatter errors as `true`. */
function asFixtureJson(vault: Vault): unknown {
  return JSON.parse(
    JSON.stringify(vault, (key, value: unknown) => (key === "frontmatterError" ? true : value)),
  );
}

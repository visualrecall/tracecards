// Runs the cases in spec/fixtures/conflicts.json, and tests the waiting versions' files.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type ConflictChoice,
  type ConflictPart,
  type ConflictResult,
  conflictParts,
  parseWaitingVersion,
  resolveConflict,
  sameWaitingVersion,
  waitingVersionFile,
  waitingVersionName,
  waitingVersionOwner,
} from "../src";

interface Cases {
  parts: { case: string; file: string; versions: string[]; parts: ConflictPart[] }[];
  resolve: {
    case: string;
    file: string;
    versions: string[];
    choose: ConflictChoice;
    result: ConflictResult;
  }[];
  belongsTo: {
    case: string;
    files: { path: string; id?: string }[];
    version: { file: string; id?: string };
    belongsTo: string | null;
  }[];
  names: { case: string; file: string; saved: string; taken: string[]; name: string }[];
}

const cases = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../../spec/fixtures/conflicts.json"), "utf8"),
) as Cases;

describe("conflictParts", () => {
  it.each(cases.parts.map((each) => [each.case, each] as const))("%s", (_, each) => {
    expect(conflictParts(each.file, each.versions)).toEqual(each.parts);
  });
});

describe("resolveConflict", () => {
  it.each(cases.resolve.map((each) => [each.case, each] as const))("%s", (_, each) => {
    expect(resolveConflict(each.file, each.versions, each.choose)).toEqual(each.result);
  });

  it("refuses a version that isn't there", () => {
    expect(() => resolveConflict("First\n", ["Second\n"], { note: 1 })).toThrow(RangeError);
  });
});

describe("waitingVersionOwner", () => {
  it.each(cases.belongsTo.map((each) => [each.case, each] as const))("%s", (_, each) => {
    expect(waitingVersionOwner(each.version, each.files)).toBe(each.belongsTo);
  });
});

describe("waitingVersionName", () => {
  it.each(cases.names.map((each) => [each.case, each] as const))("%s", (_, each) => {
    const taken = new Set(each.taken.map((name) => name.toLowerCase()));
    const name = waitingVersionName(each.file, new Date(each.saved), (candidate) =>
      taken.has(candidate.toLowerCase()),
    );
    expect(name).toBe(each.name);
  });
});

describe("waiting version files", () => {
  const version = {
    file: "Product Strategy/Jobs To Be Done.md",
    id: "A1",
    saved: "2026-11-18T14:03:12Z",
    device: "MacBook Air",
    text: "---\nid: A1\n---\n\nNote\n",
  };

  it("reads what it writes", () => {
    expect(parseWaitingVersion(waitingVersionFile(version))).toEqual(version);
  });

  it("leaves out what it doesn't know", () => {
    const text = waitingVersionFile({ file: "Books/_deck.md", text: "Note\n" });
    expect(JSON.parse(text)).toEqual({ file: "Books/_deck.md", text: "Note\n" });
  });

  it.each([
    ["isn't JSON", "{"],
    ["isn't an object", "[]"],
    ["has no file", JSON.stringify({ text: "Note" })],
    ["has no text", JSON.stringify({ file: "Ideas/Card.md" })],
  ])("isn't read when it %s", (_, json) => {
    expect(parseWaitingVersion(json)).toBeNull();
  });

  it("ignores fields of the wrong type", () => {
    const json = JSON.stringify({ file: "Ideas/Card.md", text: "Note", id: 4, saved: false });
    expect(parseWaitingVersion(json)).toEqual({ file: "Ideas/Card.md", text: "Note" });
  });

  it("tells the same version by its card's id, or else its path", () => {
    const moved = { ...version, file: "Ideas/Jobs.md" };
    expect(sameWaitingVersion(version, moved)).toBe(true);
    expect(sameWaitingVersion(version, { ...version, text: "Other\n" })).toBe(false);
    expect(sameWaitingVersion(version, { ...version, id: "B2" })).toBe(false);
    const { id: _, ...withoutId } = version;
    expect(sameWaitingVersion(withoutId, moved)).toBe(false);
    expect(sameWaitingVersion(withoutId, version)).toBe(true);
  });
});

// Prints the release notes for a tag: the changes people will notice since the tag before it,
// from the commits' Conventional Commits headers. The release workflow runs it.
//
//   node scripts/release-notes.mjs 1.2.0
import { execFileSync } from "node:child_process";

const tag = process.argv[2];
if (!tag) {
  console.error("Usage: node scripts/release-notes.mjs <tag>");
  process.exit(1);
}

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let previous = null;
try {
  previous = git("describe", "--tags", "--abbrev=0", `${tag}^`);
} catch {
  // The first release, with no tag before it: every commit up to the tag.
}

const HEADER = /^(\w+)(?:\([^)]*\))?(!)?: (.+)$/;
const commits = git("log", "--no-merges", "--format=%s", previous ? `${previous}..${tag}` : tag)
  .split("\n")
  .map((subject) => HEADER.exec(subject))
  .filter((match) => match !== null)
  .map(([, type, breaking, text]) => ({
    type,
    breaking: breaking === "!",
    text: text.charAt(0).toUpperCase() + text.slice(1),
  }));

const SECTIONS = [
  ["Breaking changes", (commit) => commit.breaking],
  ["New", (commit) => !commit.breaking && commit.type === "feat"],
  ["Fixes", (commit) => !commit.breaking && commit.type === "fix"],
  ["Faster", (commit) => !commit.breaking && commit.type === "perf"],
];

const notes = [];
for (const [title, belongs] of SECTIONS) {
  const items = commits.filter(belongs);
  if (items.length > 0) notes.push(`### ${title}\n\n${items.map((c) => `- ${c.text}`).join("\n")}`);
}
if (notes.length === 0) notes.push("Changes behind the scenes only.");

const repo = process.env.GITHUB_REPOSITORY;
if (repo && previous) {
  notes.push(`**All changes:** https://github.com/${repo}/compare/${previous}...${tag}`);
}

console.log(notes.join("\n\n"));

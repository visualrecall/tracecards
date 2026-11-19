// The release steps of `npm version`, which `npm run release -- <patch|minor|major>` runs.
//
// - Before the bump ("preversion"): stops a plain `npm version`, which would tag v1.2.0 with a
//   commit message the hooks reject. Obsidian needs tags that are the bare version. Then checks
//   that apps/obsidian/src/releases.json has an entry for the new release, with a headline unless
//   it's quiet, so what people are told about it is decided before releasing (CONTRIBUTING.md).
// - After it ("version"): checks that entry is for the version the bump made, copies the version
//   into manifest.json and records it in versions.json with the oldest Obsidian it runs on, so
//   people on an older Obsidian get the newest release that still works there. Then prints what
//   people will be told.
import { readFileSync, writeFileSync } from "node:fs";

const UNDO = "Undo the bump with: git checkout package.json package-lock.json";
const version = process.env.npm_package_version ?? "";
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const parts = (each) => each.split(".").map(Number);
const isNewer = (a, b) => {
  const [x, y] = [parts(a), parts(b)];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};

/** The newest entry in releases.json, after checking its fields, or an exit with what's wrong. */
function releaseEntry() {
  const [entry] = readJson("apps/obsidian/src/releases.json");
  const problems = [];
  if (typeof entry?.version !== "string") problems.push("its first entry has no version");
  else {
    const { notify, urgent, headline, notes } = entry;
    if (notify !== undefined && typeof notify !== "boolean")
      problems.push('"notify" isn\'t true or false');
    if (urgent !== undefined && typeof urgent !== "boolean")
      problems.push('"urgent" isn\'t true or false');
    if (notify === false && urgent === true) problems.push("a quiet release can't be urgent");
    if (notify !== false && !(typeof headline === "string" && headline.trim())) {
      problems.push('a release with a notice needs a "headline": one line on why to update');
    }
    if (
      notes !== undefined &&
      !(Array.isArray(notes) && notes.every((note) => typeof note === "string"))
    ) {
      problems.push('"notes" isn\'t a list of lines');
    }
  }
  if (problems.length > 0) {
    console.error(
      `apps/obsidian/src/releases.json: ${problems.join("; ")}. See CONTRIBUTING.md, "Releasing".`,
    );
    process.exit(1);
  }
  return entry;
}

if (process.env.npm_lifecycle_event === "preversion") {
  if (process.env.npm_config_tag_version_prefix !== "") {
    console.error("Release with `npm run release -- patch` (or minor, major), not `npm version`.");
    process.exit(1);
  }
  const entry = releaseEntry();
  if (!(isNewer(entry.version, version) > 0)) {
    console.error(
      `apps/obsidian/src/releases.json has no entry for the next release, newer than ${version}. Add one first: see CONTRIBUTING.md, "Releasing".`,
    );
    process.exit(1);
  }
  process.exit(0);
}

// Obsidian only takes versions in the form x.y.z, so no pre-releases such as 1.2.0-beta.1.
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Obsidian needs a version in the form x.y.z, not "${version}".`);
  console.error(UNDO);
  process.exit(1);
}

const entry = releaseEntry();
if (entry.version !== version) {
  console.error(
    `The newest entry in apps/obsidian/src/releases.json is for ${entry.version}, but this release is ${version}. Fix one of them.`,
  );
  console.error(UNDO);
  process.exit(1);
}

const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

const manifest = readJson("manifest.json");
manifest.version = version;
writeJson("manifest.json", manifest);

const versions = readJson("versions.json");
versions[version] = manifest.minAppVersion;
writeJson("versions.json", versions);

const told =
  entry.notify === false
    ? "no notice (quiet)"
    : `${entry.urgent ? "an urgent notice, daily" : "a notice, weekly at most"}: "${entry.headline.trim()}"`;
const notes = entry.notes?.length ?? 0;
console.log(`${version}: ${told}; ${notes ? `${notes} line(s) of what's new` : "no what's new"}.`);

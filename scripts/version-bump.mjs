// The release steps of `npm version`, which `npm run release -- <patch|minor|major>` runs.
//
// - Before the bump ("preversion"): stops a plain `npm version`, which would tag v1.2.0 with a
//   commit message the hooks reject. Obsidian needs tags that are the bare version.
// - After it ("version"): copies the new version into manifest.json and records it in
//   versions.json with the oldest Obsidian it runs on, so people on an older Obsidian get the
//   newest release that still works there.
import { readFileSync, writeFileSync } from "node:fs";

if (process.env.npm_lifecycle_event === "preversion") {
  if (process.env.npm_config_tag_version_prefix !== "") {
    console.error("Release with `npm run release -- patch` (or minor, major), not `npm version`.");
    process.exit(1);
  }
  process.exit(0);
}

const version = process.env.npm_package_version ?? "";

// Obsidian only takes versions in the form x.y.z, so no pre-releases such as 1.2.0-beta.1.
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Obsidian needs a version in the form x.y.z, not "${version}".`);
  console.error("Undo the bump with: git checkout package.json package-lock.json");
  process.exit(1);
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

const manifest = readJson("manifest.json");
manifest.version = version;
writeJson("manifest.json", manifest);

const versions = readJson("versions.json");
versions[version] = manifest.minAppVersion;
writeJson("versions.json", versions);

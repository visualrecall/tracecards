// Prints the update feed, update.json, for a release: its version and what each release says
// about itself in apps/obsidian/src/releases.json, newest first. The release workflow attaches it
// to the release, and the plugin reads the latest release's copy to offer updates.
//
//   node scripts/update-feed.mjs 1.2.0
//
// Each release takes these fields from its entry in releases.json, all optional:
// - "notify": false for a release not worth a notice; it comes with the next one that is.
// - "urgent": true for a release people should get soon; it's offered daily, not weekly.
// - "headline": one line on why to update, shown in the notice.
import { readFileSync } from "node:fs";

const tag = process.argv[2];
const readJson = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const versions = Object.keys(readJson("versions.json"));
if (!tag || !versions.includes(tag)) {
  console.error(`Usage: node scripts/update-feed.mjs <version in versions.json>, not "${tag}"`);
  process.exit(1);
}

const entries = new Map(
  readJson("apps/obsidian/src/releases.json").map((each) => [each.version, each]),
);
const parts = (version) => version.split(".").map(Number);
const newestFirst = (a, b) => {
  const [x, y] = [parts(a), parts(b)];
  return y[0] - x[0] || y[1] - x[1] || y[2] - x[2];
};
// Only releases up to this one: a later entry may already be written for the next release.
const released = versions.filter((version) => newestFirst(version, tag) >= 0).sort(newestFirst);

const releases = released.map((version) => {
  const { notify, urgent, headline } = entries.get(version) ?? {};
  return {
    version,
    ...(notify === false && { notify: false }),
    ...(urgent === true && { urgent: true }),
    ...(typeof headline === "string" && headline.trim() && { headline: headline.trim() }),
  };
});

console.log(JSON.stringify({ version: tag, releases }, null, 2));

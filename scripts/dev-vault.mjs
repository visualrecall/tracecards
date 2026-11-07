// Creates dev-vault/ (git-ignored) for trying the plugin in Obsidian. It copies the
// sample cards from spec/fixtures/basic/vault into dev-vault/Tracecards, links the plugin
// build into dev-vault/.obsidian/plugins/tracecards and enables it there.
//
// Usage: node scripts/dev-vault.mjs [--reset] [--appearance-from <vault>]
// An existing dev vault is kept as it is unless --reset is passed.
// --appearance-from copies another vault's appearance settings, active theme and enabled
// CSS snippets, so the dev vault looks like the vault you normally use. That vault is only read.
import { cp, lstat, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const root = join(import.meta.dirname, "..");
const vault = join(root, "dev-vault");
const configDir = join(vault, ".obsidian");
const pluginDir = join(configDir, "plugins", "tracecards");
const build = join(root, "apps/obsidian/dist");
const fixture = join(root, "spec/fixtures/basic/vault");

const exists = (path) =>
  lstat(path).then(
    () => true,
    () => false,
  );

if (process.argv.includes("--reset")) await rm(vault, { recursive: true, force: true });

const cards = join(vault, "Tracecards");
if (!(await exists(cards))) {
  if (await exists(fixture)) await cp(fixture, cards, { recursive: true });
  else await mkdir(cards, { recursive: true });
}

await mkdir(dirname(pluginDir), { recursive: true });
if (!(await exists(pluginDir)))
  await symlink(relative(dirname(pluginDir), build), pluginDir, "dir");
await writeFile(join(configDir, "community-plugins.json"), '["tracecards"]\n');

const appearanceFrom = option("--appearance-from");
if (appearanceFrom) await copyAppearance(join(resolve(appearanceFrom), ".obsidian"));

console.log(`Dev vault ready at ${vault}
Open it in Obsidian with "Open folder as vault" and trust it when asked.
Keep \`npm run dev\` running; after a rebuild, reload Obsidian to pick it up.`);

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** Copies appearance.json and the theme and snippets it uses from another config folder. */
async function copyAppearance(sourceConfig) {
  const appearance = JSON.parse(await readFile(join(sourceConfig, "appearance.json"), "utf8"));
  const files = ["appearance.json"];
  if (appearance.cssTheme) {
    // A theme is a folder, or a single CSS file in older vaults.
    files.push(`themes/${appearance.cssTheme}`, `themes/${appearance.cssTheme}.css`);
  }
  for (const snippet of appearance.enabledCssSnippets ?? []) files.push(`snippets/${snippet}.css`);

  for (const file of files) {
    const source = join(sourceConfig, file);
    if (!(await exists(source))) continue;
    await mkdir(dirname(join(configDir, file)), { recursive: true });
    await cp(source, join(configDir, file), { recursive: true });
    console.log(`Copied ${file}`);
  }
}

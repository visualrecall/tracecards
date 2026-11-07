// Generates sample cards, for trying dragging, scrolling and larger vaults by hand, and later
// for performance checks. The output is the same for the same --seed.
//
// Usage: node scripts/gen-vault.mjs [--into <folder>] [--cards <n>] [--decks <n>] [--seed <n>]
// --cards (default 100) are spread evenly over the folder's decks. --decks creates that many
// new decks to put them in instead; a folder without decks gets 3. Each run adds new cards.
// --into defaults to dev-vault/Tracecards. Only that dev vault or a folder that doesn't exist
// yet can be used, so it never writes into a real vault. Existing files are never overwritten.
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = join(import.meta.dirname, "..");
const devVault = join(root, "dev-vault");

const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
};
const into = resolve(option("--into", join(devVault, "Tracecards")));
const cardCount = Number(option("--cards", "100"));
const random = mulberry32(Number(option("--seed", "1")));

if (!(await isAllowed(into))) {
  console.error(`Refusing to write into ${into}: use dev-vault/ or a folder that doesn't exist.`);
  process.exit(1);
}

const DECKS = [
  ["Mental Models", "brain"],
  ["Psychology", "heart-pulse"],
  ["Startups", "rocket"],
  ["Design", "palette"],
  ["Writing", "pen-line"],
  ["History", "landmark"],
  ["Science", "atom"],
  ["Finance", "piggy-bank"],
  ["Philosophy", "scroll"],
  ["Health", "apple"],
  ["Negotiation", "handshake"],
  ["Leadership", "flag"],
];
const ADJECTIVES = [
  "Hidden",
  "Second-Order",
  "Compounding",
  "Inverted",
  "Slow",
  "Fast",
  "Local",
  "Narrow",
  "Open",
  "Quiet",
  "Default",
  "Fragile",
  "Robust",
  "Delayed",
  "Shared",
  "Small",
  "Last",
  "First",
];
const NOUNS = [
  "Loops",
  "Incentives",
  "Bets",
  "Habits",
  "Moats",
  "Signals",
  "Margins",
  "Defaults",
  "Feedback",
  "Constraints",
  "Options",
  "Rituals",
  "Leverage",
  "Friction",
  "Maps",
  "Thresholds",
  "Stories",
  "Trade-offs",
];
const SENTENCES = [
  "Small advantages add up when they repeat.",
  "What gets measured gets managed, and sometimes gamed.",
  "Ask what happens next, and then what happens after that.",
  "The cheapest time to change a decision is before anyone depends on it.",
  "People follow the path that asks the least of them.",
  "Most of the value hides in the long tail of follow-up work.",
  "A constraint you choose is a design tool; one you inherit is a cost.",
  "Feedback that arrives late teaches the wrong lesson.",
  "Look for the decision that makes the next ten decisions easier.",
  "Every system is perfectly designed to get the results it gets.",
];

const existing = await deckNames(into);
const newDecks = Number(option("--decks", existing.length === 0 ? "3" : "0"));
const decks = [];
for (const [name, icon] of DECKS.filter(([name]) => !existing.includes(name))) {
  if (decks.length === newDecks) break;
  await mkdir(join(into, name), { recursive: true });
  // New decks go on the pad after the existing ones, while it has room.
  const slot = existing.length + decks.length + 1;
  const pad = slot <= 8 ? `pad: ${slot}\n` : "";
  await writeFile(join(into, name, "_deck.md"), `---\nicon: ${icon}\n${pad}---\n`, {
    flag: "wx",
  });
  decks.push(name);
}
if (decks.length === 0) decks.push(...existing);

for (const [index, deck] of decks.entries()) {
  const folder = join(into, deck);
  // File systems on macOS and Windows ignore case, so compare titles in lower case.
  const titles = new Set((await readdir(folder)).map((name) => name.toLowerCase()));
  const count =
    Math.round((cardCount * (index + 1)) / decks.length) -
    Math.round((cardCount * index) / decks.length);
  for (let card = 0; card < count; card++) {
    let title = `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
    for (let n = 2; titles.has(`${title.toLowerCase()}.md`); n++) {
      title = `${pick(ADJECTIVES)} ${pick(NOUNS)} ${n}`;
    }
    titles.add(`${title.toLowerCase()}.md`);
    await writeFile(join(folder, `${title}.md`), cardFile(title), { flag: "wx" });
  }
  console.log(`${relative(root, folder) || folder}: ${count} cards added`);
}

function cardFile(title) {
  const fields = [];
  const sentences = Array.from({ length: Math.floor(random() * 4) }, () => pick(SENTENCES));
  if (sentences.length > 0) fields.push(`description: ${JSON.stringify(sentences.join(" "))}`);
  if (random() < 0.25) fields.push(`cover: "[[jtbd-cover.png]]"`);
  const created = new Date(Date.UTC(2026, 0, 1) + Math.floor(random() * 300 * 86_400_000));
  fields.push(`created: ${created.toISOString().replace(/\.\d{3}Z$/, "Z")}`);
  return `---\n${fields.join("\n")}\n---\nNotes on ${title.toLowerCase()}.\n`;
}

/** The decks in a vault folder: its folders, apart from hidden ones and attachments. */
async function deckNames(folder) {
  try {
    const entries = await readdir(folder, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .filter((name) => name.toLowerCase() !== "attachments")
      .sort();
  } catch {
    return [];
  }
}

function pick(list) {
  return list[Math.floor(random() * list.length)];
}

/** Whether `folder` is inside the dev vault or doesn't exist yet. */
async function isAllowed(folder) {
  const inDevVault = !relative(devVault, folder).startsWith("..");
  if (inDevVault) return true;
  try {
    await readdir(folder);
    return false;
  } catch {
    return true;
  }
}

/** A small seeded random number generator, so the same seed gives the same vault. */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

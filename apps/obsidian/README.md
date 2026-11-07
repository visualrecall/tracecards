# Obsidian plugin

The Tracecards plugin for Obsidian, on desktop and on mobile. This is the detailed guide and the developer notes; the [main README](../../README.md) has the overview, installation and network use.

## How it works

- **A Tracecards view**, like Canvas or Kanban. Opened from the sidebar or a command, it shows the cards of one deck, with a deck pad among them for switching decks.
- **Cards open in a card modal**: the card's note on the left, its face on the right. The note is in Obsidian's own editor, in a leaf outside the workspace, so users keep their theme, vim mode and other plugins, and Obsidian handles files that change on disk. Cmd/Ctrl-click opens the note where Obsidian would open a link.
- **Links in a card's note:** a link to another card opens it in the card modal, and Back (bottom left) or Esc returns to the card before. A link to any other note, or any link opened with Cmd/Ctrl-click, closes the modal and opens in a new tab. A link to a note that doesn't exist yet makes it where Obsidian's "Default location for new notes" says, and opens it in the modal if that's in a deck. Obsidian opens a note's links with `workspace.openLinkText`, so the modal wraps it while it's open.
- **Card-face edits** (description, cover, bookmarks, rank) go through `app.fileManager.processFrontMatter`, which reads the file, changes only the frontmatter and writes it back in one step.
- **The view redraws on Obsidian's file events** (create, change, rename, delete), so changes from the file explorer or a sync tool show up straight away.
- Logic comes from `packages/core`: `src/source.ts` lists the Tracecards folder from Obsidian's vault and metadata cache, and core's `buildVault` turns that into decks and cards. Screens come from `packages/ui`, which reaches Obsidian through the `Host` interface implemented in `src/host.ts`. `src/CardModal.tsx` puts the note's leaf inside the ui's `CardScreen`.
- **The search index** is built in memory from Obsidian's metadata cache. A saved copy in IndexedDB will be added only if startup turns out to be slow. Plugins can't load native modules such as SQLite.

## Using it

Needs Obsidian 1.13.2 or newer.

- Open Tracecards from the ribbon (the layers icon) or with the "Tracecards: Open" command.
- **Settings** are in Obsidian's Settings → Tracecards, which the gear in the tab's header opens too.
  - **Folder** chooses the Tracecards folder (default `Tracecards`). If it doesn't exist, the view offers to create it.
  - **Cards in a row** is the most cards a row has in the grid view (5 by default). A narrow tab fits fewer.
  - **Pixabay API key** lets the card form search Pixabay's free images. A key is free with a Pixabay account. It's kept in Obsidian's secret storage on this device and isn't synced, so each device needs it once.
- **Cards:** in the pad view, a deck shows six cards at a time: four in a row, then one on each side of the deck pad. Scroll anywhere on the grid to turn the page, or click the selected deck's tile, which goes round to the first page after the last. The bar on the right of that tile shows which page is showing. Cards are flat, with no shadow. In card mode (see the keys below) the selected card is framed: a thin line in the theme's accent colour a small gap out from it. Drag a card to reorder it within the page; on touch screens, press and hold first.
- **The grid view** shows all of a deck's cards in rows that scroll, with no pad, so a card can be dragged anywhere in its deck. Cards are the size the pad view gives them, as many to a row as fit, up to the "Cards in a row" setting. Switch views with the button left of the magnifier in the tab's header, or with r. The tab remembers which view it shows.
- **The Decks panel** in the sidebar shows every deck, with its icon and card count. Opening Tracecards from the ribbon or its command brings the panel forward; on phones and tablets it becomes the sidebar drawer's panel, and the drawer stays closed. "Tracecards: Show decks" opens it. Click a deck to show it, drag decks to reorder them, drop a card on a deck to move it there, right-click a deck for its menu, or create a deck with its "+". With the focus in the panel, up and down or j and k go through the decks, and Alt with up or down moves one.
- **New cards:** the "+" button in the tab's header, Cmd/Ctrl+J while the tab is active, the "Tracecards: New card" command (which has no hotkey of its own) or the button in an empty deck opens the card form, which nearly fills the window. Write the card as one text: the first line is the title, and Enter starts the description under it (Backspace at its start goes back). The title takes up to 60 characters and the description up to 180, which is what a card shows in full; longer text already in a card's file is kept and faded out where the card cuts it off. Pasting a text puts its first line in the title and the rest in the description. Under the text, pick the cover from Pixabay (the search takes the title once you move on to the description), or click, drop or paste an image of your own on the card. Generate, for pictures made by AI, is coming later. On the right is the card as it will look, the deck to save it to, and Save card, which is greyed out until the card has a title. Save card or Cmd/Ctrl+Enter saves. Links are added once the card exists, in its Bookmarks tab. The card goes at the end of its deck, and the grid turns to it with a short pop.
- **Covers:** in the card form, click the empty cover to choose an image, drop one on it, or paste one anywhere in the form, or pick one from Pixabay. Then drag the image (or use the arrow keys) to move it and scroll or pinch to zoom, right on the card. The × that shows when you point at the cover removes it. The image is saved in the `attachments` folder inside the Tracecards folder, named after the card, at most 1600 pixels on a side, as WebP (JPEG on iPhone and iPad) and without metadata such as location. A replaced or removed image goes to the trash if nothing else links to it.
- **Bookmarks** are in the card modal's Bookmarks tab. Type or paste a web address in "Add a new link…": Enter adds it, and pasting adds it straight away. A YouTube video gets its title from YouTube. The primary bookmark comes first, marked "Primary source". Click a bookmark to open it in your browser. Right-click it, or use its "…" button, to copy the link, edit its title and URL, mark it as the primary source, or delete it (straight away).
- **Drop a card on another deck's tile** to move it there: near the deck pad the card shrinks, the decks it can go to brighten, and the one it would go to is framed in the accent colour, right at its edge, and grows.
- **Right-click a card** to move it to another deck from "Move to", which opens the list of decks beside the menu (the card goes at the end), to edit its title, description and cover in the same form, or to delete it (after asking, to the trash, following Obsidian's "Deleted files" setting). Renaming a card renames its file, which updates links to it. A deck can't have two cards with the same title, in any letter case.
- **Search** with the magnifier in the tab's header (its tooltip, like the "+" button's, gives its keys), Cmd/Ctrl+K while the tab is active, or the "Tracecards: Search cards" command. It finds cards by title, fuzzily, with the matched letters highlighted, and shows each with its cover and deck. Before you type, it offers a new card and the four cards you opened last on this device. Choosing a card opens it, with the grid behind it turned to the card's deck and page. Type `#` first, press `#` in the tab or use "Tracecards: Search decks" to find a deck by name instead; choosing one selects it. The commands have no hotkeys of their own, so assign one in Obsidian's settings to search from anywhere.
- **Canvas:** Obsidian Canvas's toolbar gets a Tracecards button beside its own. Click it to add a card in the middle of the canvas, or drag it to where the card should go; card search chooses the card, or makes a new one. On phones Obsidian hides that toolbar, its own buttons too. Cards show their face on the canvas and stay up to date, in a card's shape and the same size whether added with the Tracecards button or "Add note from vault"; double-click one to open it. The canvas file keeps an ordinary link to the card's note, so without Tracecards the canvas shows the note. Obsidian has no plugin API for Canvas, so this relies on its internals: an Obsidian update may hide the button or the faces until Tracecards catches up, without harming any canvas. It's built to work alongside Advanced Canvas, which uses the same internals.
- **The deck's name** is in the middle of the tab's header. Click it to switch to another deck in the pad. On phones and tablets, whose header is laid out differently, it's above the cards instead, and it's hidden while the tab is too narrow for it.
- **Decks:** the deck pad has eight slots and shows the first eight decks. The faint "+" tile after the last deck, the Decks panel's "+", or the "Tracecards: New deck" command, creates a deck while there's room. How the pad will make room for more is still being decided; decks made outside Tracecards, as folders, can already go past eight, and the grid view and the Decks panel show them all. Right-click a deck's tile to rename it, change its icon or delete it (to the trash, following Obsidian's "Deleted files" setting). Drag tiles to reorder decks; on touch screens, press and hold first. "Open in Tracecards" in the file explorer's menu for the Tracecards folder or a deck opens it here.

The keys work in two modes. The grid starts in **deck mode**, with no card selected; Space, i or Enter selects the first card showing and switches to **card mode**, and Esc goes back. Clicking a card or a deck doesn't change the mode; turning the page with the wheel leaves card mode. In the grid view the decks are a list rather than the pad, so the deck keys go through every deck, in order.

| Keys | Deck mode |
|---|---|
| Left and right, or h and l | Previous or next deck, going round |
| Down and up, or j and k | Pad view: next or previous page; past the last page, the deck below in the pad, and before the first, the deck above. Grid view: the next or previous deck. |
| Space, i or Enter | Select the first card showing |
| r | Switch between the pad view and the grid view |

| Keys | Card mode |
|---|---|
| Arrow keys or h j k l | Move between cards. In the pad view, left and right stay on the page, and up and down go round the deck pad and onto the next or previous page. In the grid view, they go through the cards in order and by row. |
| Page Up, Page Down | Previous or next page, or two rows in the grid view |
| Home, End | First or last card |
| Enter or Space | Open the card (with Cmd/Ctrl: its note in a new tab) |
| Alt (Option on a Mac) + arrow keys | Move the card, onto another page with up and down |
| Context menu key or Shift+F10 | The card's menu |
| Delete or Backspace | Delete the card, after asking, as "Delete…" in its menu does |
| Esc | Back to deck mode |

| Keys | Both modes |
|---|---|
| Shift with down or up, or Shift+J and Shift+K | The deck below or above in the pad, or the next or previous deck in the grid view |
| `[` and `]` | Previous or next deck, going round |
| Cmd/Ctrl+J | New card |
| Cmd/Ctrl+K | Search cards |
| `#` | Search decks |

Tab moves between the grid and the selected deck's tile, where the deck-mode keys work too; there Alt (Option on a Mac) with an arrow key moves the deck, and the context menu key or Shift+F10 opens its menu. In the card modal, Cmd/Ctrl+[ and ] show the Note and Bookmarks tabs, even while you type in the note, where Obsidian's editor would otherwise use them to indent. Esc goes back to the card shown before a link was followed, or closes the modal, except that with vim, Esc in insert or visual mode goes to vim. App hotkeys, such as Cmd+B for bold, don't work inside the card modal yet.

## Network use

What the plugin sends where, and when, is listed in the main README's [Network use](../../README.md#network-use) section.

## Development

- `src/main.ts` is the plugin entry point. `esbuild.config.mjs` bundles it with `packages/core`, `packages/ui` and React into `dist/main.js`, builds `dist/styles.css` from `src/styles.css` (which imports `packages/ui/src/styles.css`), and copies the root `manifest.json` into `dist/`.
- `obsidian`, `electron`, `@codemirror/*` and `@lezer/*` are provided by Obsidian at runtime and aren't bundled.
- `npm run dev-vault` (from the repo root) creates `dev-vault/`, a git-ignored Obsidian vault whose `.obsidian/plugins/tracecards` links to `dist/`. Open it in Obsidian, keep `npm run dev` running, and reload Obsidian after each rebuild. Each vault has its own appearance settings; `npm run dev-vault -- --appearance-from <vault>` copies another vault's appearance settings, active theme and enabled CSS snippets, only reading that vault.
- `manifest.json` lives at the repo root, where Obsidian's plugin directory and beta-testing tools such as BRAT look for it.

## Releases

Obsidian installs and updates the plugin from GitHub releases. It reads `manifest.json` from the repo's default branch, then downloads `main.js`, `manifest.json` and `styles.css` from the release whose tag is exactly the manifest's `version` (such as `1.0.0`, with no `v`). `versions.json` maps each release to the oldest Obsidian it runs on, so someone on an older Obsidian gets the newest release that works there. [Releasing](../../CONTRIBUTING.md#releasing) explains how a release is made.

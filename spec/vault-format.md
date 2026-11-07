# Vault format

- **Version:** 1
- **Implemented by:** `packages/core` (TypeScript)
- **License:** © 2026 VisualRecall, under the [Apache License 2.0](LICENSE), like everything in `spec/`, so any app can read and write Tracecards vaults. The rest of the repo is AGPL-3.0.

Every implementation must read and write the format described here and pass the cases in [`fixtures/`](fixtures/). To change the format: update this file, add or update a fixture, then update the implementations.

## Vault root

A vault is a folder used only by Tracecards. It can stand alone or sit inside an Obsidian vault (for example `MyVault/Tracecards/`). Inside an Obsidian vault, notes outside this folder are never read, so an existing note becomes a card only when it's moved in. Paths below are relative to the vault root.

The vault is self-contained: everything a card refers to, including cover images, lives inside it. The phone apps and sync only see this folder.

Implementations ignore:

- any file or folder whose name starts with `.` (for example `.obsidian/`, `.trash/`, `.git/`)
- the attachments folder (see [Attachments](#attachments))

## Decks

Each folder directly under the root is a deck. The folder name is the deck name. Files directly in the root aren't cards.

Folders inside a deck aren't decks of their own. The cards in them belong to the deck, so `Books/Psychology/Thinking, Fast and Slow.md` is in the `Books` deck. Implementations never create nested folders; new cards go directly into the deck folder.

A deck may contain a `_deck.md` file. Its frontmatter holds the deck's metadata and its body is the deck description.

| Field | Type | Meaning |
|---|---|---|
| `icon` | string | [Lucide](https://lucide.dev) icon name, e.g. `book-open` |
| `cover` | string (wikilink) | A card in this deck whose cover image is used as the deck cover, e.g. `"[[Jobs To Be Done]]"` |
| `rank` | number | Position among decks, ascending |
| `pad` | integer, 1–8 | The deck's slot on the deck pad, counted row by row from the top left, when the deck is on it. Decks that aren't stay decks, with all their cards; apps list them elsewhere (the deck list, search) and let the user attach them. Any other value means not on the pad |

Decks without `rank` sort after ranked decks, by name. Implementations create `_deck.md` only when they first set one of these fields, for example when the user moves the deck or chooses its icon. A new deck is just a folder.

**The deck pad** has eight slots in two rows of four, and a deck is on it only when the user has put it there, in the slot its `pad` names. Slots without a deck stay empty where they are: detaching a deck removes its `pad` and moves no other deck. An empty slot offers to attach a deck there or create one there; attaching a deck some other way puts it in the first empty slot. Moving a deck to another slot slides the decks between along by one, and writes `pad` only for the decks whose slot changed. `rank` orders the deck list and plays no part in the pad. When two decks name the same slot, as after a sync conflict, the first in deck order keeps it and the other goes in the first empty slot, or is off the pad when there's none; the next move on the pad writes where it is.

## Cards

Every `.md` file inside a deck folder, at any depth, other than `_deck.md`, is a card.

- **Title** is the file name without `.md`. Renaming the file in Tracecards, Obsidian or a file manager renames the card. As in Obsidian, titles can't contain characters that are invalid in file names or that break links: `* " \ / < > : | ? # ^ [ ]`. When the user types a card or deck title, implementations trim surrounding spaces and reject a title that is empty, contains one of those characters, or starts with `.` (it would be ignored). A card can't be called `_deck` and a deck can't be called `attachments`, in any letter case.
- **Note** is the markdown body after the frontmatter: CommonMark with GitHub-flavored extensions and Obsidian wikilinks.
- **Fields** live in YAML frontmatter. All of them are optional, so a plain markdown file with no frontmatter is a valid card.

| Field | Type | Meaning |
|---|---|---|
| `id` | string (ULID) | Stable identity that survives renames and moves. See [Ids](#ids). |
| `kind` | string | `idea` (default). Other values are reserved for later card kinds such as `skill`. Unknown kinds are shown as `idea`. |
| `description` | string | Short text on the card face |
| `cover` | string (wikilink) | Cover image, e.g. `"[[jtbd-cover.webp]]"`. A plain path is accepted too, and so is an unquoted `[[jtbd-cover.webp]]`, which YAML reads as a nested list. |
| `cover-crop` | list of 4 numbers | Visible part of the cover as `[x, y, width, height]`, each a fraction of the image size from 0 to 1. Missing means the whole image. A crop that doesn't fit inside the image is ignored. |
| `rank` | number | Position within the deck, ascending. A moved card gets a value between its new neighbours, so a reorder writes only one file. See [Order](#order). |
| `created` | string (ISO 8601) | Creation time, as a date and time (`2026-10-28T12:00:00Z`, optionally with an offset instead of `Z`) or a date (`2026-10-28`). Stored because file timestamps aren't reliable after syncing or copying. |
| `bookmarks` | list | Links attached to the card (see below) |

Each bookmark:

| Field | Type | Meaning |
|---|---|---|
| `url` | string | Required |
| `title` | string | Display name. Missing means a name is made from the URL: the last part of its path, with `-` and `_` as spaces, or its host without `www.` when the path has none. A video without a title is shown as "YouTube video". |
| `primary` | boolean | The bookmark featured on the card face. At most one per card; if several are marked, the first counts. |

Bookmarks without a `url` are ignored.

A bookmark is a video when its URL is a YouTube URL: `youtu.be/ID`, `youtube.com/watch?v=ID` (also with `www.`, `m.` or `music.`), `youtube.com/shorts/ID`, `youtube.com/embed/ID`, `youtube.com/live/ID` or `youtube-nocookie.com/embed/ID`, over `http` or `https`, where `ID` is 11 letters, digits, `-` or `_`. Thumbnails are cached by the app, not stored in the vault.

Obsidian's Properties panel can't edit lists of objects, so in Obsidian, bookmarks are edited in source mode or through the Tracecards plugin.

Values of the wrong type, such as a `rank` that isn't a number, are ignored, and so is frontmatter that isn't valid YAML. The file itself is left as it is.

### Showing a cover

A card face shows its cover in a 3:2 frame. `cover-crop` can have any shape: the crop editor makes crops in the shape of the frame it edits, which for a card face is 3:2. When the crop (or the whole image, if there's no crop) has a different shape from the frame it's shown in, for example because it was written by hand or the frame is another shape, it is scaled to fill the frame and its overflowing sides are trimmed equally, like CSS `object-fit: cover`. The image is never stretched.

A card without a cover, or whose cover image can't be found, shows a placeholder. Apps don't stand anything in for it, such as a video bookmark's thumbnail: a thumbnail becomes the cover only when the user picks it, and is then saved like any other cover. YouTube's 480 × 360 thumbnail (`https://i.ytimg.com/vi/ID/hqdefault.jpg`) has the 16:9 picture between black bars, so it starts with the crop `[0, 0.125, 1, 0.75]`.

### Setting a cover

- **The image is saved in `attachments/`,** named after the card's title (`Jobs To Be Done.webp`). When a file of that name, ignoring letter case, is already anywhere in the vault (or, inside an Obsidian vault, anywhere in that vault), ` 1`, ` 2` and so on are added (`Jobs To Be Done 1.webp`), so the bare name in the link is unambiguous.
- **New images are made smaller and stripped:** scaled to fit within 1600 × 1600 pixels (never enlarged), turned upright from the photo's orientation, with metadata such as location removed, and saved as WebP at quality 0.82, or as JPEG at the same quality where WebP can't be written. GIF and SVG images are saved as they are.
- **`cover`** is then `"[[<file name>]]"`, written to the card together with `cover-crop`, after the image is saved.
- **`cover-crop`** is written only when the user moves or zooms the image, with up to four decimal places. A new image that wasn't moved or zoomed has no `cover-crop`, so it's shown whole, trimmed to fit as above.
- **Removing a cover** removes `cover` and `cover-crop`.
- **The old image**, when a cover is replaced or removed, is moved to the trash if it's in `attachments/` and nothing else links to it: no other card or note, and nothing else in the card. Images outside `attachments/` are never moved.

### Order

Cards in a deck are shown by `rank`, then by `created`, then by title, with missing values last. So cards without a `rank` come after ranked cards, oldest first. Titles, like deck names, compare in natural order: numbers by value (`Card 2` before `Card 10`) and letters regardless of case. Cards that are still tied are ordered by path.

### Reordering

When the user moves a card or deck, it gets a `rank` that puts it between its new neighbours, so a move usually writes one file. Decks follow the same rules.

- **Between two ranked neighbours:** the number with the fewest decimals that lies between their ranks, nearest to their midpoint. Between 1 and 2 that's 1.5; between 1 and 1.5 it's 1.3.
- **At the start:** the whole number below the next rank. **After the last ranked item:** the whole number above its rank. **When nothing is ranked yet:** 1.
- Items without a rank sort after ranked ones, so **unranked items that end up before the moved one** get ranks too, counting up from the rank before them.
- **When no number with at most 8 decimals fits,** for example between two items with the same rank, the items up to the last ranked one are renumbered 1, 2, 3…, and only those whose rank changes are written.

### Adding cards

- **A new card** is a file `<title>.md` directly in its deck's folder. It's written with an `id`, a `created` time (now, in UTC, to the second), its `description` and cover if it has them (see [Setting a cover](#setting-a-cover)), a `rank` as below, and its bookmarks if it has them, the first one marked `primary` (see [Changing bookmarks](#changing-bookmarks) for how each is read and named).
- **A moved card** goes directly into the other deck's folder, from any depth in its old deck, keeping its file name and fields. Only its `rank` changes, as below.
- **Either way it goes at the end of the deck:** when the deck's last card has a `rank`, the added card gets the whole number after it. Otherwise the added card has no `rank` (a moved card's is removed), so it sorts among the other unranked cards: a new card after those with an older `created`. So only the added card is written.
- **Titles are unique within a deck,** ignoring letter case: implementations don't create, rename or move a card into a deck that has another card with the same title at any depth. Otherwise two cards in a deck could look the same, and on macOS and Windows, which ignore case in file names, couldn't share a folder.

### Changing bookmarks

- **A new bookmark goes at the end** of `bookmarks`, with its `url` and, when it has one, its `title`. The URL is kept as the user entered it, trimmed, with `https://` added when it has no scheme, so parameters such as a video's `t` stay. Only `http` and `https` URLs are accepted, with a host that has a dot in it or is `localhost`.
- **A new video gets its title from YouTube,** from its oEmbed endpoint (`https://www.youtube.com/oembed?format=json&url=…`), when the app can reach it within a few seconds. Otherwise it's added without a title.
- **No bookmark is added twice:** two URLs are the same bookmark when they're the same YouTube video, or when they differ only in their scheme, a leading `www.`, letter case in the host, or a final `/` on the path.
- **Editing** sets `url` and `title` (an empty title removes the field) and keeps the bookmark's other fields and its place in the list.
- **Marking a bookmark primary** removes `primary` from the others. Unmarking it, or removing the primary bookmark, leaves the card with none.
- **Removing the last bookmark** removes the `bookmarks` field.
- **A bookmark is found by its URL,** trimmed. When several have the same one, which only happens when they're written by hand, the first is changed.

### Example

`Product Strategy/Jobs To Be Done.md`:

```markdown
---
id: 01JBQ6Z7X8Y9K2M3N4P5Q6R7S8
kind: idea
description: People don't buy products, they hire them to make progress.
cover: "[[jtbd-cover.webp]]"
cover-crop: [0.1, 0, 0.8, 1]
rank: 1.5
created: 2026-10-28T12:00:00Z
bookmarks:
  - url: https://youtu.be/VIDEO_ID
    title: Talk on jobs to be done
    primary: true
---

The note is ordinary markdown, with [[wikilinks]] to other cards.
```

### Video timestamps

In a note, a markdown link to a YouTube URL with a `t` parameter in seconds is a timestamp:

```markdown
[the key point](https://youtu.be/VIDEO_ID?t=95)
```

When the video is one of the card's bookmarks, Tracecards shows the link as a chip that jumps the player to that time. Any other markdown viewer shows a normal link that opens the video at that time.

### Ids

- An implementation writes an `id` when it creates a card, or when it's already saving that card's frontmatter for another reason. It never writes a file just to add an `id`.
- A card without an `id` is valid, and its path is its identity.
- Copying a card file also copies its `id`. When two cards share an `id`, the card whose path sorts first keeps it, and the other card gets a new `id` the next time an implementation writes it. Paths are relative to the vault root and compared as UTF-16 code units.

## Attachments

Images live in `attachments/` at the vault root. This holds even when the vault sits inside an Obsidian vault whose attachment folder is set elsewhere, because the vault has to stay self-contained. An image that Obsidian saves outside the vault (for example, one pasted into a note) still shows in Obsidian but not in the phone apps.

Wikilinks to them are resolved the way Obsidian resolves them: a bare file name (`[[jtbd-cover.webp]]`) matches the file with that name anywhere in the vault, and a path (`[[attachments/jtbd-cover.webp]]`) is used when the name alone is ambiguous.

## Writing rules

- Write as little as possible, because every write is a chance for a sync conflict. Only write a file when the user changes that card, change one file per action, and never rewrite files in bulk (for example, to fill in missing fields). Setting a cover is the exception: it writes the image, then the card, and may move the old image to the trash.
- Keep unknown frontmatter fields, with their order and values. Users and other Obsidian plugins add their own.
- When only the frontmatter changes, leave the body byte-for-byte unchanged, and the other way round.
- Write atomically: write to a temporary file whose name starts with `.` in the same folder, then rename it over the original.
- Deleting a card or deck moves it to the system trash. Implementations never delete files permanently.
- New files are UTF-8 without a BOM, with LF line endings. Edited files keep their existing line endings.

## Not stored in the vault

The search index, thumbnail cache, sync state (what each device has already downloaded), and window and UI state live in the app's data folder on each platform, keyed by the vault's path. A constantly changing cache inside the vault would trigger syncs all the time, and each device builds its own anyway.

`.tracecards/` at the vault root is reserved for small, sync-safe settings if we ever need them, and for the format version (see [Versions and upgrades](#versions-and-upgrades)). Version 1 doesn't use it.

## Conflicts

Sync tools resolve conflicts in their own way, since Tracecards never runs a sync server of its own. In version 1, the conflict copies they leave behind, such as `Card (conflicted copy).md` or `Card.sync-conflict-….md`, are ordinary cards. A copy keeps the original's `id`, so a later version can flag it as a conflicting version of the original.

## Versions and upgrades

Devices that share a vault update at different times, and people skip releases, so a vault written by one version of an implementation is read by older and newer ones too. Every change to the format has to work both ways:

- **Adding** an optional field or file needs no new version. Older implementations ignore it and keep it, as they keep every unknown field.
- **Changing** what a field means or how it's stored is done by adding a new field and reading the old one when the new one is missing, never by giving an existing field a new meaning. Implementations write the new form only to files they're writing anyway, never to every file at once. The old field stays readable for as long as older implementations may be in use.
- **A change that can't be made this way**, such as a new folder layout, needs a new format version. `.tracecards/format.json` will record it, and an implementation that finds a version newer than its own leaves the vault unchanged. Releases have to know that rule well before the first such change, and the upgrade itself is one the user starts, which can be run again if it stops partway.
- The cases in [`fixtures/`](fixtures/) stay when the format changes, so implementations keep reading vaults written by older versions.

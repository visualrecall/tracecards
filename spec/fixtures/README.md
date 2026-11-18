# Fixtures

Sample vaults that every implementation of the [vault format](../vault-format.md) must read the same way.

```
fixtures/
└── <case>/
    ├── vault/            the input vault
    └── expected.json     what an implementation must read from it
```

| Case | Covers |
|---|---|
| `basic` | Two decks with typical cards: covers, crops, bookmarks, videos, ranks and creation times. It also seeds the plugin's dev vault. |
| `ignored-paths` | Dot files and folders, `attachments/`, files in the root, non-markdown files, cards in sub-folders, a `_deck.md` in a sub-folder, a deck with only `_deck.md`, and an empty deck |
| `normalization` | Unknown kinds, wikilink forms, bad crops, several primary bookmarks, values of the wrong type, a BOM and CRLF line endings, duplicate ids, date-only `created`, and empty, invalid, unclosed or missing frontmatter |

## expected.json

The decks in display order, each with its cards in display order:

```json
{
  "decks": [
    {
      "name": "Product Strategy",
      "icon": "target",
      "cover": "Jobs To Be Done",
      "rank": 1,
      "hasDeckFile": true,
      "cards": [
        {
          "path": "Product Strategy/Jobs To Be Done.md",
          "title": "Jobs To Be Done",
          "id": "01JBQ6Z7X8Y9K2M3N4P5Q6R7S8",
          "kind": "idea",
          "description": "…",
          "cover": "jtbd-cover.png",
          "coverCrop": [0.1, 0, 0.8, 1],
          "rank": 1.5,
          "created": "2026-10-28T12:00:00Z",
          "bookmarks": [{ "url": "https://youtu.be/jtbdTalk001", "title": "…", "primary": true, "videoId": "jtbdTalk001" }]
        }
      ]
    }
  ]
}
```

- Missing optional values are left out. `kind`, `bookmarks` and `hasDeckFile` are always present.
- `cover` holds the wikilink target, without the brackets.
- A card whose frontmatter isn't valid YAML has `"frontmatterError": true` and no fields from its frontmatter. Error messages differ between parsers, so only their presence is compared.
- Paths are relative to `vault/` and use `/`.

The fixture vaults are byte-for-byte test input (`.gitattributes` keeps git from changing their line endings), so edit them with care. The TypeScript runner is `packages/core/test/fixtures.test.ts`. Write behaviour (for example, that saving keeps unknown fields and leaves the body untouched) will get its own cases.

## conflicts.json

Cases for [Conflicts](../vault-format.md#conflicts), in four lists. Texts are whole files, written out in JSON strings, so their BOMs and line endings are exact.

- **`parts`:** a `file`'s text and the texts of its waiting `versions`, and the `parts` that differ, in the order of the spec's table (`cover`, `description`, `note`, `bookmarks`, `icon`, `properties`), or `["file"]`.
- **`resolve`:** a `file`, its waiting `versions`, and what the person picks: `choose` maps a part to the index of a version in `versions`, and a part not in it is the file's own. `result` is what's written: `null` for nothing; `{ "fields": …, "note": … }`, the fields by value and the note without a BOM and with LF line endings; or `{ "text": … }` when the whole file is the part.
- **`belongsTo`:** the vault's cards and `_deck.md` files (`files`, each a `path` and maybe an `id`), a waiting `version` (its `file` and maybe its `id`), and the path of the file it belongs to, or `null`.
- **`names`:** a waiting version's `file` and `saved` time, the names already holding other versions (`taken`, compared ignoring letter case), and the waiting version's file `name`.

The TypeScript runner is `packages/core/test/conflicts.test.ts`.

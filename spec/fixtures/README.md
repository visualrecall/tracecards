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

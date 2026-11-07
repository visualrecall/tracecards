# @tracecards/core

The vault format and app logic in TypeScript, with no UI.

- Reads and writes vaults as defined in [`spec/vault-format.md`](../../spec/vault-format.md)
- Holds the in-memory model of decks and cards, plus the operations on them: create, rename, move, reorder, delete
- Builds and queries the search index

## Rules

- No imports from React, Tauri, Obsidian or Node built-ins. Anything platform-specific goes through an interface defined here (file system, file watcher, index storage, clock), and each app supplies the implementation.
- Every format behaviour is covered by a case in [`spec/fixtures/`](../../spec/fixtures/).

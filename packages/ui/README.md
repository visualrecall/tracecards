# @tracecards/ui

Our own screens as React components: the grid screen (cards and the deck pad), the card face and the card screen shown in the card modal. The Obsidian plugin uses them now, and the standalone app will later. The note editor comes from the app: `CardScreen` takes it as an element, so there's no editor here.

- React 19, styled with plain CSS that uses Obsidian's theme variables (`--background-primary`, `--text-normal`, `--interactive-accent` and so on), so the screens follow the user's theme. The standalone app will define the same variables in its own theme.
- Never imports Obsidian. Everything the screens need from the app, such as opening a note or resolving a cover image, goes through the `Host` interface in `src/host.ts`, which screens get from React context. The plugin implements it with Obsidian's API and built-in components.
- Data comes in through small external stores (`Store` in `src/store.ts`) that screens read with `useSyncExternalStore`.
- What the user can do, such as creating or renaming a deck, is written once here (`src/deckActions.ts`): the questions asked, the checks on names and the menu items. The app's commands reuse it. The `Host` shows the menus and dialogs and makes the changes to the vault.
- Drag and drop uses `@dnd-kit/react`.
- Pure logic, such as grid keyboard navigation, has Vitest tests in `test/`.
- Gets its data and actions from `@tracecards/core`.

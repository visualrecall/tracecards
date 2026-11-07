# Contributing to Tracecards

Thanks for helping. Bug reports and ideas are welcome as [issues](https://github.com/visualrecall/tracecards/issues). We aren't taking pull requests yet, while Tracecards is young and changing fast: open an issue first, and if a change fits, we'll talk about how to bring it in.

## Setting up

You'll need Node 24 or newer.

```sh
npm install
npm run dev-vault    # creates dev-vault/, an Obsidian vault with the plugin installed
npm run dev          # rebuilds the plugin on every change
```

Open `dev-vault/` in Obsidian with "Open folder as vault", and reload Obsidian ("Reload app without saving") after a rebuild. The [plugin guide](apps/obsidian/README.md) explains how the code fits together.

Before opening a pull request, run:

```sh
npm run check        # lint, formatting, typecheck and tests
npm run build
```

## Commits

Commits follow [Conventional Commits](https://www.conventionalcommits.org):

```
feat(ui): add a deck filter to search

Search could only find cards. Typing # first now searches decks, which
is quicker than the Decks panel when there are many.
```

- **Type:** `feat` (something new for users), `fix` (a bug fix), `docs`, `refactor` (no change in behaviour), `perf`, `test`, `build`, `ci`, `style` (formatting only) or `chore`. Add `!` after the type or scope for a change that breaks existing vaults or settings, such as `feat(spec)!: …`.
- **Scope** (optional): the part it touches, such as `plugin`, `core`, `ui`, `spec` or `deps`.
- **Header:** in the imperative ("add", not "added"), lowercase after the colon, no full stop, 72 characters at most.
- **Body** (optional): after a blank line, why the change was made, wrapped at 72 characters.
- **One change per commit.** Keep commits small and focused, so each can be reviewed and reverted on its own. A refactor and the feature built on it are two commits. Don't mix formatting changes into a functional change.

Pull requests are squashed when merged, so a pull request's title follows the same format.

## Changing the vault format

Every Tracecards app reads and writes the format in [`spec/vault-format.md`](spec/vault-format.md). To change it, update the spec and add or update a case in [`spec/fixtures/`](spec/fixtures/) first, then the code. Existing vaults must keep working: fields Tracecards doesn't know are kept as they are, and a change follows the spec's [Versions and upgrades](spec/vault-format.md#versions-and-upgrades) rules.

## Keeping upgrades safe

People skip releases, and their devices update at different times, so a new release must work with whatever an older one left behind:

- **Settings:** when a release changes what a saved setting means or where it's kept, raise `SETTINGS_VERSION` in `apps/obsidian/src/settings.ts` and add a step to `MIGRATIONS`. Steps run in order from the saved version, and never change once released. To change a default without changing it for people who already use the plugin, add a step that keeps the old value for them.
- **Names others rely on** never change: the plugin id, command ids (hotkeys refer to them), view types (saved workspaces refer to them) and local storage keys.

## Releasing

Releases are made from `main` by a maintainer:

```sh
npm run release -- minor     # or patch, major
git push --follow-tags
```

`npm run release` runs the checks, bumps the version in `package.json` and `manifest.json`, records it in `versions.json` with the `minAppVersion` it needs, and makes a `chore(release): x.y.z` commit tagged `x.y.z`. Pushing the tag runs `.github/workflows/release.yml`, which builds the plugin, attests the files and publishes the GitHub release, with notes made from the `feat`, `fix` and `perf` commits since the last release. Obsidian offers the update once `manifest.json` on `main` has the new version.

Use `patch` for fixes only, `minor` for new features and `major` for changes that break existing vaults or settings. Raise `minAppVersion` in `manifest.json` before releasing when the plugin starts using a newer Obsidian API.

## License

By contributing, you agree that your contributions are licensed under the [GNU Affero General Public License, version 3](LICENSE), like the rest of the plugin. Contributions to `spec/` are licensed under the [Apache License 2.0](spec/LICENSE), like the spec.

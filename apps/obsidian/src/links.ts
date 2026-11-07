import type { App, PaneType, Workspace } from "obsidian";

/** A link a note opened, as Obsidian passes it to `Workspace.openLinkText`. */
export interface FollowedLink {
  linktext: string;
  sourcePath: string;
  /** Where Cmd/Ctrl-click, middle-click and the like asked for the link, if anywhere. */
  newLeaf: PaneType | boolean | undefined;
  /** Opens the link as Obsidian would have, here or with another `newLeaf`. */
  open(newLeaf?: PaneType | boolean): Promise<void>;
}

/**
 * Sends the links the note at `sourcePath()` opens to `follow`, until the returned function is
 * called. Obsidian's editor, reading view and properties open a note's links with
 * `Workspace.openLinkText` and the note's path, so this wraps that on the workspace. Every other
 * link goes to whatever was there before, Obsidian's or another plugin's.
 */
export function followLinks(
  app: App,
  sourcePath: () => string,
  follow: (link: FollowedLink) => Promise<void>,
): () => void {
  const { workspace } = app;
  const own = Object.getOwnPropertyDescriptor(workspace, "openLinkText");
  const previous = workspace.openLinkText.bind(workspace);
  let active = true;
  const override: Workspace["openLinkText"] = (linktext, source, newLeaf, openViewState) =>
    active && source === sourcePath()
      ? follow({
          linktext,
          sourcePath: source,
          newLeaf,
          open: (where = newLeaf) => previous(linktext, source, where, openViewState),
        })
      : previous(linktext, source, newLeaf, openViewState);
  workspace.openLinkText = override;

  return () => {
    active = false;
    // If another plugin has wrapped this one since, it stays in place and only passes through.
    if (workspace.openLinkText !== override) return;
    if (own) Object.defineProperty(workspace, "openLinkText", own);
    else delete (workspace as { openLinkText?: unknown }).openLinkText;
  };
}

import { DeckListPanel, HostContext, ICONS } from "@tracecards/ui";
import { ItemView, Platform, type WorkspaceLeaf } from "obsidian";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type TracecardsPlugin from "./main";

/** Never renamed: saved workspaces refer to it, and a tab of an unknown type can't open. */
export const DECKS_VIEW_TYPE = "tracecards-decks";

/**
 * The Decks panel in Obsidian's sidebar: every deck, following the Tracecards tab. Clicking a
 * deck shows it there, cards dragged in the tab can be dropped on its decks, and its decks can be
 * dropped in the slots of the tab's deck pad.
 */
export class DecksView extends ItemView {
  override navigation = false;
  private root: Root | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: TracecardsPlugin,
  ) {
    super(leaf);
  }

  override getViewType(): string {
    return DECKS_VIEW_TYPE;
  }

  override getDisplayText(): string {
    return "Decks";
  }

  override getIcon(): string {
    return ICONS.decksPanel;
  }

  override async onOpen(): Promise<void> {
    const { host, store, selection, cardDrop, deckDrop } = this.plugin;
    this.root = createRoot(this.contentEl);
    this.root.render(
      <StrictMode>
        <HostContext value={host}>
          <DeckListPanel
            store={store}
            selection={selection}
            cardDrop={cardDrop}
            onDeckDropChange={(drop) => deckDrop.set(drop)}
            // The focus stays in the panel for its keys, but on phones and tablets the tab takes
            // it, which closes the drawer over it (unless it's pinned), as opening a note does.
            onSelect={(name) => void this.plugin.openGrid(name, { focus: Platform.isMobile })}
          />
        </HostContext>
      </StrictMode>,
    );
  }

  override async onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
  }
}

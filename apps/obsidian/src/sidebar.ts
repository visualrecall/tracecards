import type { WorkspaceLeaf } from "obsidian";
import { DECKS_VIEW_TYPE } from "./DecksView";
import { GRID_VIEW_TYPE } from "./GridView";
import type TracecardsPlugin from "./main";

/**
 * A sidebar's tab group, or the drawer that is the sidebar on phones and tablets, with what
 * Obsidian itself uses to show one of its panels. Obsidian's API can only reveal a panel, which
 * opens a closed sidebar, so these are used when they're there.
 */
interface TabGroup {
  children: WorkspaceLeaf[];
  currentTab: number;
  selectTab(leaf: WorkspaceLeaf): void;
}

/** The Decks panel, with its tab group and the panel the group shows. */
interface DecksPlace {
  decks: WorkspaceLeaf;
  group: TabGroup;
  shown: WorkspaceLeaf | undefined;
}

/**
 * Switches the sidebar with the tab in use, while the setting is on: the Decks panel comes
 * forward for a Tracecards tab, and the panel it came forward over goes back for any other tab.
 * Only the panel shown changes: a closed sidebar stays closed, and the focus stays in the tab.
 */
export class SidebarSwitch {
  /** The panel the Decks panel last came forward over, to bring back. */
  private replaced: WorkspaceLeaf | null = null;

  constructor(private readonly plugin: TracecardsPlugin) {}

  /** Follows the tab that became active. Using a panel in a sidebar changes nothing. */
  follow(leaf: WorkspaceLeaf | null): void {
    if (!this.plugin.settings.switchSidebar || !leaf || this.inSidebar(leaf)) return;
    const place = this.decksPlace();
    if (!place) return;
    const { decks, group, shown } = place;
    if (leaf.getViewState().type === GRID_VIEW_TYPE) {
      if (shown === decks) return;
      this.replaced = shown ?? null;
      group.selectTab(decks);
    } else if (shown === decks) {
      // The panel Decks came forward over, or else Files, if it's still in the same group.
      const files = this.plugin.app.workspace.getLeavesOfType("file-explorer")[0];
      const back = [this.replaced, files].find(
        (panel) => panel && panel !== decks && group.children.includes(panel),
      );
      if (back) group.selectTab(back);
    }
  }

  /** Notes the panel shown where the Decks panel is, before Decks is brought forward over it. */
  noteReplaced(): void {
    const place = this.decksPlace();
    if (place && place.shown !== place.decks) this.replaced = place.shown ?? null;
  }

  /** The Decks panel and its tab group, while the panel is open in a sidebar. */
  private decksPlace(): DecksPlace | null {
    const decks = this.plugin.app.workspace.getLeavesOfType(DECKS_VIEW_TYPE)[0];
    if (!decks || !this.inSidebar(decks)) return null;
    const group = decks.parent as Partial<TabGroup> | undefined;
    if (
      !Array.isArray(group?.children) ||
      typeof group.currentTab !== "number" ||
      typeof group.selectTab !== "function"
    ) {
      return null;
    }
    return { decks, group: group as TabGroup, shown: group.children[group.currentTab] };
  }

  private inSidebar(leaf: WorkspaceLeaf): boolean {
    const { leftSplit, rightSplit } = this.plugin.app.workspace;
    const root = leaf.getRoot();
    return root === leftSplit || root === rightSplit;
  }
}

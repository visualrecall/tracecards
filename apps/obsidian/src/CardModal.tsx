import { CardScreen, HostContext, isEditingFace, ValueStore } from "@tracecards/ui";
import {
  type App,
  type EventRef,
  MarkdownView,
  Modal,
  normalizePath,
  parseLinktext,
  Platform,
  Scope,
  type TFile,
  WorkspaceLeaf,
} from "obsidian";
import { StrictMode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type { ObsidianHost } from "./host";
import { type FollowedLink, followLinks } from "./links";
import type { RecentCards } from "./recent";
import type { VaultStore } from "./store";

/** A card the modal showed before a link was followed, and where its note was scrolled to. */
interface Visit {
  file: TFile;
  eState: Record<string, unknown>;
}

/**
 * Shows a card in a modal: its note beside the card face. The note is in a real Obsidian leaf, so
 * the user's editor, settings, vim mode and plugins all apply. Links to other cards open them in
 * the modal, with Back to return. On phones it fills the screen, as a note app shows a note, and
 * the Tracecards tab waits behind it as it was.
 */
export class CardModal extends Modal {
  private readonly path: ValueStore<string | null>;
  private readonly events: EventRef[] = [];
  /** The cards shown before, the last one first to go back to. */
  private readonly history: Visit[] = [];
  /** The card that opened the modal, focused again when it closes. */
  private readonly returnFocus = activeDocument.activeElement;
  private leaf: WorkspaceLeaf | null = null;
  private root: Root | null = null;
  /** Counts the cards shown, so each gets a fresh screen, on its Note tab. */
  private shown = 0;
  private stopFollowingLinks: (() => void) | null = null;
  private closed = false;

  constructor(
    app: App,
    private readonly host: ObsidianHost,
    private readonly store: VaultStore,
    private readonly recent: RecentCards,
    private file: TFile,
  ) {
    super(app);
    this.path = new ValueStore(store.relativePath(file.path));
    // Obsidian handles keys before the editor does, so Modal's own Esc would close the modal even
    // when vim needs Esc to leave insert mode. This scope leaves Esc to vim then, as Obsidian's
    // own embedded editors do. Like Modal's scope, it has no parent, so app hotkeys are off while
    // the modal is open. Esc goes back to the card shown before, if there was one.
    // The face's editors take Esc too, to cancel.
    this.scope = new Scope();
    this.scope.register([], "Escape", () => {
      if (this.vimNeedsEscape() || isEditingFace(activeDocument.activeElement)) return;
      if (this.history.length > 0) this.goBack();
      else this.close();
      return false;
    });
  }

  override async onOpen(): Promise<void> {
    this.containerEl.addClass("tracecards-card-modal");
    try {
      this.leaf = createDetachedLeaf(this.app);
      await this.leaf.setViewState({
        type: "markdown",
        state: { file: this.file.path, mode: "source", source: false },
        active: false,
      });
    } catch (error) {
      console.error("tracecards: couldn't show the note in the card modal", error);
      this.close();
      this.openBesideGrid();
      return;
    }
    const view = this.leaf.view;
    if (this.closed || !(view instanceof MarkdownView)) return;

    this.events.push(
      this.app.vault.on("rename", (file) => {
        if (file !== this.file) return;
        // Together with the model that has the card at its new path, so the card shows all along.
        const path = this.store.relativePath(file.path);
        this.store.onNextRefresh(() => this.path.set(path));
      }),
      this.app.vault.on("delete", (file) => {
        if (file === this.file) this.close();
      }),
    );
    this.stopFollowingLinks = followLinks(
      this.app,
      () => this.file.path,
      (link) => this.followLink(link),
    );
    this.root = createRoot(this.contentEl);
    this.render();
    this.focusNote();
  }

  /**
   * Android's back button goes back to the card shown before, if there was one, as Esc does, and
   * otherwise closes the card.
   */
  override onHistoryBack(): void {
    if (this.history.length > 0) this.goBack();
    else this.close();
  }

  /**
   * Puts the focus in the note, so it can be typed in straight away. Not on phones, where that
   * would bring up the keyboard over the card: a tap in the note does.
   */
  private focusNote(): void {
    const view = this.leaf?.view;
    if (!Platform.isPhone && view instanceof MarkdownView) view.editor.focus();
  }

  override onClose(): void {
    this.closed = true;
    for (const ref of this.events) this.app.vault.offref(ref);
    this.stopFollowingLinks?.();
    this.root?.unmount();
    // Closes the note's view, which saves any unsaved edits.
    this.leaf?.detach();
    if (this.returnFocus?.instanceOf(HTMLElement) && this.returnFocus.isConnected) {
      this.returnFocus.focus({ preventScroll: true });
    }
  }

  private render(): void {
    const view = this.leaf?.view;
    const root = this.root;
    if (!(view instanceof MarkdownView) || !root) return;
    // Rendered synchronously, so the note is in the page when the editor is focused.
    flushSync(() =>
      root.render(
        <StrictMode>
          <HostContext value={this.host}>
            <CardScreen
              key={this.shown}
              store={this.store}
              path={this.path}
              note={view.containerEl}
              onBack={this.history.length > 0 ? this.goBack : undefined}
              focusNote={() => view.editor.focus()}
              phone={Platform.isPhone}
              onClose={() => this.close()}
            />
          </HostContext>
        </StrictMode>,
      ),
    );
  }

  /**
   * Opens a card the note links to in the modal. Other notes open in a new tab,
   * as do links opened with Cmd/Ctrl-click and the like, and the modal closes. A note that doesn't
   * exist yet is made where Obsidian would make it, and opens here if that makes it a card.
   */
  private async followLink(link: FollowedLink): Promise<void> {
    const leaf = this.leaf;
    if (!leaf) return;
    const { path, subpath } = parseLinktext(link.linktext);
    let target = this.app.metadataCache.getFirstLinkpathDest(path, link.sourcePath);
    if (!target && !link.newLeaf) target = await this.newCard(path, link.sourcePath);
    if (link.newLeaf || !target || !this.store.isCard(target.path)) {
      this.close();
      return link.open(link.newLeaf || "tab");
    }

    const visit: Visit = { file: this.file, eState: leaf.view.getEphemeralState() };
    await leaf.openFile(target, { eState: subpath ? { subpath } : {} });
    // A link to a heading in the same card only scrolls.
    if (this.closed || target === visit.file) return;
    this.history.push(visit);
    this.showNote();
  }

  /**
   * Makes the note a link to a missing note asks for, as Obsidian would, if it's a card: at the
   * path the link gives, from the vault's root when it names a folder, and otherwise in the folder
   * Obsidian's "Default location for new notes" gives. Null when it wouldn't be a card or can't
   * be made, so Obsidian makes it, or says why it can't.
   */
  private async newCard(linkpath: string, sourcePath: string): Promise<TFile | null> {
    const { fileManager, vault } = this.app;
    const folder = linkpath.includes("/")
      ? ""
      : fileManager.getNewFileParent(sourcePath, linkpath).path;
    const path = normalizePath(`${folder}/${linkpath.replace(/\.md$/, "")}.md`);
    if (!this.store.isCard(path)) return null;
    let file: TFile | null = null;
    try {
      // Once the model has it, so the new card shows as it opens.
      await this.store.change(async () => {
        file = await vault.create(path, "");
      });
    } catch {
      return null;
    }
    return file;
  }

  private readonly goBack = (): void => {
    void this.back();
  };

  /** Shows the card shown before the last link was followed, or closes if it's gone. */
  private async back(): Promise<void> {
    let visit = this.history.pop();
    while (visit && this.app.vault.getFileByPath(visit.file.path) !== visit.file) {
      visit = this.history.pop();
    }
    if (!visit || !this.leaf) {
      this.close();
      return;
    }
    await this.leaf.openFile(visit.file, { eState: visit.eState });
    if (!this.closed) this.showNote();
  }

  /** Shows the card whose note the leaf now has, on a fresh screen. */
  private showNote(): void {
    const view = this.leaf?.view;
    if (!(view instanceof MarkdownView) || !view.file) return;
    this.file = view.file;
    this.recent.add(view.file.path);
    this.path.set(this.store.relativePath(view.file.path));
    this.shown += 1;
    this.render();
    this.focusNote();
  }

  /** Whether the editor has focus and vim is in insert or visual mode. */
  private vimNeedsEscape(): boolean {
    const view = this.leaf?.view;
    if (!(view instanceof MarkdownView) || !view.editor.hasFocus()) return false;
    // `editor.cm` is CodeMirror's EditorView, as Obsidian's docs show, and vim keeps its state on
    // its adapter at `cm.state.vim`. Neither is in Obsidian's types.
    const vim = (view.editor as unknown as EditorWithVim).cm?.cm?.state?.vim;
    return Boolean(vim?.insertMode || vim?.visualMode);
  }

  /** Where the note opens if the modal can't show it. Phones have no splits. */
  private openBesideGrid(): void {
    const { workspace } = this.app;
    const leaf = Platform.isPhone
      ? workspace.getLeaf("tab")
      : workspace.getLeaf("split", "vertical");
    void leaf.openFile(this.file);
  }
}

interface EditorWithVim {
  cm?: { cm?: { state?: { vim?: { insertMode?: boolean; visualMode?: boolean } } } };
}

/**
 * A leaf that isn't part of the workspace. Obsidian has no public way to make one, so this calls
 * WorkspaceLeaf's undocumented constructor, as the Tree Modal plugin does.
 */
function createDetachedLeaf(app: App): WorkspaceLeaf {
  const Leaf = WorkspaceLeaf as unknown as new (app: App) => WorkspaceLeaf;
  return new Leaf(app);
}

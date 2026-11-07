import { HostContext, type Sheet } from "@tracecards/ui";
import { type App, Modal } from "obsidian";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ObsidianHost } from "./host";

/**
 * A sheet from the screens, such as the one of decks on phones, in a modal: at the bottom of the
 * screen on phones, as Obsidian's confirmations are there. As a modal, it closes with Android's
 * back button, a tap outside or its close button.
 */
export class SheetModal extends Modal {
  private root: Root | null = null;

  constructor(
    app: App,
    private readonly host: ObsidianHost,
    private readonly sheet: Sheet,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.containerEl.addClass("tracecards-sheet");
    this.setTitle(this.sheet.title);
    this.root = createRoot(this.contentEl);
    this.root.render(
      <StrictMode>
        <HostContext value={this.host}>{this.sheet.render(() => this.close())}</HostContext>
      </StrictMode>,
    );
  }

  override onClose(): void {
    this.root?.unmount();
    this.root = null;
  }
}

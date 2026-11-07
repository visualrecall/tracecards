import type { Deck } from "@tracecards/core";
import { HostContext, PrintDialog } from "@tracecards/ui";
import { type App, Modal } from "obsidian";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ObsidianHost } from "./host";

/** The dialog that prints a deck: as a PDF to print at home, or through Game Crafter. */
export class PrintModal extends Modal {
  private root: Root | null = null;

  constructor(
    app: App,
    private readonly host: ObsidianHost,
    private readonly deck: Deck,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.containerEl.addClass("tracecards-print-modal");
    this.root = createRoot(this.contentEl);
    this.root.render(
      <StrictMode>
        <HostContext value={this.host}>
          <PrintDialog deck={this.deck} onClose={() => this.close()} />
        </HostContext>
      </StrictMode>,
    );
  }

  override onClose(): void {
    // Unmounting lets the dialog remove an unpaid game and cart from the account.
    this.root?.unmount();
  }
}
